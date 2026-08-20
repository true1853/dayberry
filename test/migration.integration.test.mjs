import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { PrismaClient } from '@prisma/client';

import {
  classifyEscrowCandidateGraph,
  expectedEscrowStatus,
  stableCreateKey,
  stableHoldKey,
  stableReleaseKey,
  validateEscrowInvariant,
} from '../lib/deals/escrow-invariants.js';
import {
  BASELINE_MIGRATION,
  createBaselineOnlyMigrations,
  createPreChangeDatabase,
  createTempDir,
  foreignKeyList,
  healthChecks,
  indexNames,
  migrateDeploy,
  removeTempDir,
  resolveApplied,
  schemaDiffExitCode,
  seedLegacyRows,
  tableColumnNames,
  withClient,
} from './fixtures/escrow-db.mjs';
import { approvalToken } from '../scripts/backfill-deal-escrow.mjs';

const cleanDeal = {
  id: 'deal-a',
  userId: 'buyer-a',
  ownerId: 'seller-a',
  credits: 40,
  status: 'active',
  stage: 'created',
  escrowTransactionId: null,
};

const cleanHold = {
  id: 'tx-a',
  userId: 'buyer-a',
  kind: 'escrow-in',
  amt: 40,
  status: 'held',
  refType: '',
  refId: '',
  businessKey: null,
};

test('classifier exposes stable keys and status expectations', () => {
  assert.equal(stableCreateKey('deal-a'), 'deal:deal-a:create');
  assert.equal(stableHoldKey('deal-a'), 'deal:deal-a:hold');
  assert.equal(stableReleaseKey('deal-a'), 'deal:deal-a:release');
  assert.equal(expectedEscrowStatus({ status: 'active' }), 'held');
  assert.equal(expectedEscrowStatus({ status: 'disputed' }), 'held');
  assert.equal(expectedEscrowStatus({ status: 'done' }), 'done');
  assert.equal(expectedEscrowStatus({ status: 'cancelled' }), 'refunded');
});

test('classifier returns one globally unique legacy direct pair with exact row IDs', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [cleanHold],
    users: [],
  });

  assert.deepEqual(result.automaticPairs, [{ dealId: 'deal-a', transactionId: 'tx-a' }]);
  assert.deepEqual(result.chainRows, []);
  assert.deepEqual(result.buckets.missingLink, [{ dealId: 'deal-a' }]);
  assert.match(result.hash, /^[a-f0-9]{64}$/);
});

test('classifier is deterministic for reordered input and sorts every bucket', () => {
  const ambiguousDeals = [
    { ...cleanDeal, id: 'deal-z' },
    { ...cleanDeal, id: 'deal-a' },
  ];
  const ambiguousHolds = [
    { ...cleanHold, id: 'tx-z' },
    { ...cleanHold, id: 'tx-a' },
  ];

  const forward = classifyEscrowCandidateGraph({
    deals: ambiguousDeals,
    transactions: ambiguousHolds,
    users: [],
  });
  const reverse = classifyEscrowCandidateGraph({
    deals: [...ambiguousDeals].reverse(),
    transactions: [...ambiguousHolds].reverse(),
    users: [],
  });

  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.automaticPairs, []);
  assert.deepEqual(forward.buckets.multipleCandidates, [
    { dealId: 'deal-a', transactionIds: ['tx-a', 'tx-z'] },
    { dealId: 'deal-z', transactionIds: ['tx-a', 'tx-z'] },
  ]);
});

test('chain exclusion keeps a newer chain hold outside the direct candidate graph', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [
      cleanHold,
      {
        ...cleanHold,
        id: 'tx-newer-chain',
        refType: 'chain',
        refId: 'chain-1',
        createdAt: '2099-01-01T00:00:00.000Z',
      },
    ],
    users: [],
  });

  assert.deepEqual(result.automaticPairs, [{ dealId: 'deal-a', transactionId: 'tx-a' }]);
  assert.deepEqual(result.chainRows, [{ refId: 'chain-1', transactionId: 'tx-newer-chain' }]);
  assert.equal(JSON.stringify(result).includes('createdAt'), false);
});

test('classifier retains corrupt, dangling, duplicate-key and zero-credit row IDs', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [
      { ...cleanDeal, id: 'deal-linked', escrowTransactionId: 'tx-wrong' },
      { ...cleanDeal, id: 'deal-zero', credits: 0, escrowTransactionId: 'tx-zero' },
    ],
    transactions: [
      { ...cleanHold, id: 'tx-wrong', userId: 'someone-else', refType: 'deal', refId: 'deal-linked' },
      { ...cleanHold, id: 'tx-zero', amt: 0, refType: 'deal', refId: 'deal-zero' },
      { ...cleanHold, id: 'tx-dangling', refType: 'deal', refId: 'missing-deal' },
      { ...cleanHold, id: 'tx-key-a', businessKey: 'deal:dup:hold' },
      { ...cleanHold, id: 'tx-key-b', businessKey: 'deal:dup:hold' },
    ],
    users: [],
  });

  assert.deepEqual(result.buckets.wrongUser, [{ dealId: 'deal-linked', transactionId: 'tx-wrong' }]);
  assert.deepEqual(result.buckets.zeroCreditLinks, [{ dealId: 'deal-zero', transactionId: 'tx-zero' }]);
  assert.deepEqual(result.buckets.danglingDirectRefs, [{ refId: 'missing-deal', transactionId: 'tx-dangling' }]);
  assert.deepEqual(result.buckets.duplicateBusinessKeys, [{
    businessKey: 'deal:dup:hold',
    transactionIds: ['tx-key-a', 'tx-key-b'],
  }]);
});

test('legacy chain hold without refType never becomes a direct automatic pair', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [{ ...cleanHold, id: 'tx-legacy-chain' }],
    chainSteps: [
      { chainId: 'chain-legacy', userId: 'buyer-a', topup: 40 },
    ],
    users: [],
  });

  assert.deepEqual(result.automaticPairs, []);
  assert.deepEqual(result.buckets.legacyChainSuspectHolds, [
    { chainIds: ['chain-legacy'], transactionId: 'tx-legacy-chain', userId: 'buyer-a' },
  ]);
  assert.deepEqual(result.buckets.unmatchedDeals, [{ dealId: 'deal-a' }]);
  assert.equal(result.high, true);
});

test('a chain hold settled outside its chain is reported and stays out of the direct graph', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [],
    transactions: [{
      ...cleanHold,
      id: 'tx-chain-eaten',
      status: 'done',
      refType: 'chain',
      refId: 'chain-1',
    }],
    chains: [{ id: 'chain-1', status: 'active' }],
    users: [],
  });

  assert.deepEqual(result.automaticPairs, []);
  assert.deepEqual(result.buckets.chainHoldsSettledOutsideChain, [
    { chainId: 'chain-1', chainStatus: 'active', transactionId: 'tx-chain-eaten' },
  ]);
  assert.equal(result.high, true);
});

test('missing linkage is expected before migration and blocking once the column exists', () => {
  const before = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [cleanHold],
    users: [],
    schema: { hasDealEscrowLink: false },
  });

  assert.deepEqual(before.automaticPairs, [{ dealId: 'deal-a', transactionId: 'tx-a' }]);
  assert.deepEqual(before.buckets.missingLink, [{ dealId: 'deal-a' }]);
  assert.deepEqual(before.severity.expected.missingLink, 1);
  assert.equal(before.severity.blocking.missingLink, undefined);
  assert.equal(before.high, false);

  const after = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [cleanHold],
    users: [],
    schema: { hasDealEscrowLink: true },
  });

  assert.deepEqual(after.buckets.missingLink, [{ dealId: 'deal-a' }]);
  assert.equal(after.severity.blocking.missingLink, 1);
  assert.equal(after.high, true);
});

test('classifier invariant validation reports every mismatched field', () => {
  const violations = validateEscrowInvariant(
    { ...cleanDeal, escrowTransactionId: 'tx-bad' },
    {
      ...cleanHold,
      id: 'tx-bad',
      userId: 'wrong-user',
      amt: 41,
      kind: 'earn',
      status: 'done',
      refType: 'deal',
      refId: 'other-deal',
    },
  );

  assert.deepEqual(violations, ['amount', 'kind', 'ref', 'status', 'user']);
});

const projectRoot = path.resolve(import.meta.dirname, '..');

function runScript(script, args = [], env = {}) {
  return spawnSync(process.execPath, [path.join(projectRoot, script), ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function prismaUrl(databasePath, readOnly = false) {
  const normalized = path.resolve(databasePath).replaceAll('\\', '/');
  return `file:${normalized}${readOnly ? '?mode=ro' : ''}`;
}

async function createEscrowFixture(databasePath, { withCandidate = false } = {}) {
  const prisma = new PrismaClient({ datasources: { db: { url: prismaUrl(databasePath) } } });
  try {
    await prisma.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "balance" INTEGER NOT NULL DEFAULT 0, "dealsCount" INTEGER NOT NULL DEFAULT 0)');
    await prisma.$executeRawUnsafe('CREATE TABLE "Lot" ("id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL)');
    await prisma.$executeRawUnsafe('CREATE TABLE "Deal" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "lotId" TEXT NOT NULL, "credits" INTEGER NOT NULL DEFAULT 0, "stage" TEXT NOT NULL DEFAULT \'created\', "status" TEXT NOT NULL DEFAULT \'active\', "disputedAt" DATETIME)');
    await prisma.$executeRawUnsafe('CREATE TABLE "Transaction" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "amt" INTEGER NOT NULL, "status" TEXT NOT NULL, "refType" TEXT NOT NULL DEFAULT \'\', "refId" TEXT NOT NULL DEFAULT \'\')');
    if (withCandidate) {
      await prisma.$executeRawUnsafe("INSERT INTO \"User\" (id, balance, dealsCount) VALUES ('buyer', 60, 0), ('seller', 0, 0)");
      await prisma.$executeRawUnsafe("INSERT INTO \"Lot\" (id, ownerId) VALUES ('lot', 'seller')");
      await prisma.$executeRawUnsafe("INSERT INTO \"Deal\" (id, userId, lotId, credits, stage, status) VALUES ('deal', 'buyer', 'lot', 40, 'created', 'active')");
      // Кандидат на автоматическую связь плюс блокирующая находка: ссылка на
      // несуществующую сделку. Без неё дозревшая severity-модель не считала бы
      // pre-migration снимок HIGH, и тест перестал бы проверять отказ команды.
      await prisma.$executeRawUnsafe("INSERT INTO \"Transaction\" (id, userId, kind, amt, status, refType, refId) VALUES ('hold', 'buyer', 'escrow-in', 40, 'held', '', ''), ('dangling', 'buyer', 'escrow-in', 15, 'held', 'deal', 'missing-deal')");
    }
  } finally {
    await prisma.$disconnect();
  }
}

test('missing input audit fails closed before database access', () => {
  const result = runScript('scripts/audit-deal-escrow.mjs');
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /missing required input.*database/i);
});

test('missing input backup and restore verification fail closed', () => {
  for (const script of ['scripts/backup-snapshot.mjs', 'scripts/verify-restored-copy.mjs']) {
    const result = runScript(script, [], {
      DATABASE_URL: '',
      ESCROW_SOURCE_DB: '',
      ESCROW_BACKUP_TARGET: '',
      ESCROW_BACKUP_EVIDENCE: '',
      ESCROW_DATABASE: '',
      ESCROW_LIVE_DB: '',
      ESCROW_EVIDENCE_DIR: '',
    });
    assert.notEqual(result.status, 0, script);
    assert.match(`${result.stdout}\n${result.stderr}`, /missing required input/i, script);
  }
});

test('read-only audit and restore verification reject resolved live-path equality', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dayberry-live-deny-'));
  const database = path.join(dir, 'live.db');
  const output = path.join(dir, 'audit.json');
  const evidenceDir = path.join(dir, 'evidence');
  await writeFile(database, 'not opened');

  const audit = runScript('scripts/audit-deal-escrow.mjs', [
    '--database', database,
    '--live-path', database,
    '--output', output,
  ]);
  assert.notEqual(audit.status, 0);
  assert.match(`${audit.stdout}\n${audit.stderr}`, /live path/i);

  const restore = runScript('scripts/verify-restored-copy.mjs', [
    '--database', database,
    '--live-path', database,
    '--evidence-dir', evidenceDir,
  ]);
  assert.notEqual(restore.status, 0);
  assert.match(`${restore.stdout}\n${restore.stderr}`, /live path/i);
});

test('snapshot refuses collisions and emits independently verified evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dayberry-snapshot-'));
  const source = path.join(dir, 'source.db');
  const target = path.join(dir, 'snapshot.db');
  const evidence = path.join(dir, 'snapshot.json');
  await createEscrowFixture(source);

  const created = runScript('scripts/backup-snapshot.mjs', [
    '--source', source,
    '--target', target,
    '--evidence', evidence,
  ]);
  assert.equal(created.status, 0, `${created.stdout}\n${created.stderr}`);

  const manifest = JSON.parse(await readFile(evidence, 'utf8'));
  assert.equal(manifest.kind, 'escrow-snapshot');
  assert.equal(manifest.target.path, path.resolve(target));
  assert.match(manifest.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.artifact.size > 0);
  assert.deepEqual(manifest.verification.integrityCheck, ['ok']);
  assert.deepEqual(manifest.verification.foreignKeyCheck, []);
  assert.ok(manifest.runtime.sqliteVersion);
  assert.ok(Array.isArray(manifest.runtime.compileOptions));

  const repeated = runScript('scripts/backup-snapshot.mjs', [
    '--source', source,
    '--target', target,
    '--evidence', evidence,
  ]);
  assert.notEqual(repeated.status, 0);
  assert.match(`${repeated.stdout}\n${repeated.stderr}`, /already exists/i);

  const collision = runScript('scripts/backup-snapshot.mjs', [
    '--source', source,
    '--target', source,
    '--evidence', path.join(dir, 'collision.json'),
  ]);
  assert.notEqual(collision.status, 0);
  assert.match(`${collision.stdout}\n${collision.stderr}`, /source.*target|target.*source/i);
});

test('read-only audit writes deterministic JSON even when HIGH findings fail the command', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dayberry-audit-'));
  const livePath = path.join(dir, 'live.db');
  const snapshot = path.join(dir, 'snapshot.db');
  const outputA = path.join(dir, 'audit-a.json');
  const outputB = path.join(dir, 'audit-b.json');
  await createEscrowFixture(snapshot, { withCandidate: true });

  const first = runScript('scripts/audit-deal-escrow.mjs', [
    '--database', snapshot,
    '--live-path', livePath,
    '--output', outputA,
  ]);
  const second = runScript('scripts/audit-deal-escrow.mjs', [
    '--database', snapshot,
    '--live-path', livePath,
    '--output', outputB,
  ]);
  assert.notEqual(first.status, 0);
  assert.notEqual(second.status, 0);

  const reportA = JSON.parse(await readFile(outputA, 'utf8'));
  const reportB = JSON.parse(await readFile(outputB, 'utf8'));
  assert.deepEqual(reportA.classification, reportB.classification);
  assert.deepEqual(reportA.classification.automaticPairs, [{ dealId: 'deal', transactionId: 'hold' }]);
  assert.equal(reportA.high, true);
  assert.match(first.stdout, new RegExp(reportA.classification.hash));
});

test('restore verification proves a clean snapshot and rejects checksum mismatch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dayberry-restore-'));
  const source = path.join(dir, 'source.db');
  const snapshot = path.join(dir, 'snapshot.db');
  const evidenceDir = path.join(dir, 'evidence');
  const snapshotEvidence = path.join(evidenceDir, 'snapshot.json');
  await mkdir(evidenceDir);
  await createEscrowFixture(source);

  const backup = runScript('scripts/backup-snapshot.mjs', [
    '--source', source,
    '--target', snapshot,
    '--evidence', snapshotEvidence,
  ]);
  assert.equal(backup.status, 0, `${backup.stdout}\n${backup.stderr}`);

  const verified = runScript('scripts/verify-restored-copy.mjs', [
    '--database', snapshot,
    '--live-path', source,
    '--evidence-dir', evidenceDir,
  ]);
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);

  await chmod(snapshot, 0o644);
  await writeFile(snapshot, 'tampered');
  const tampered = runScript('scripts/verify-restored-copy.mjs', [
    '--database', snapshot,
    '--live-path', source,
    '--evidence-dir', evidenceDir,
  ]);
  assert.notEqual(tampered.status, 0);
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /checksum mismatch/i);
});

test('fresh database migrate deploy creates the expanded schema', async (t) => {
  const dir = await createTempDir('fresh');
  t.after(() => removeTempDir(dir));
  const database = path.join(dir, 'fresh.db');

  const deployed = migrateDeploy(database);
  assert.equal(deployed.status, 0, `${deployed.stdout}\n${deployed.stderr}`);

  const dealColumns = await tableColumnNames(database, 'Deal');
  assert.ok(dealColumns.includes('escrowTransactionId'), 'Deal.escrowTransactionId');
  assert.ok(dealColumns.includes('createCommandKey'), 'Deal.createCommandKey');
  assert.ok((await tableColumnNames(database, 'Transaction')).includes('businessKey'), 'Transaction.businessKey');

  const escrowFk = (await foreignKeyList(database, 'Deal')).find(fk => fk.from === 'escrowTransactionId');
  assert.deepEqual(escrowFk, { table: 'Transaction', from: 'escrowTransactionId', to: 'id', onDelete: 'RESTRICT' });

  const dealIndexes = await indexNames(database, 'Deal');
  for (const name of [
    'Deal_createCommandKey_key',
    'Deal_escrowTransactionId_key',
    'Deal_status_idx',
    'Deal_userId_idx',
    'Deal_lotId_idx',
    'Deal_createdAt_idx',
    'Deal_disputedAt_idx',
  ]) {
    assert.ok(dealIndexes.includes(name), `index ${name}`);
  }
  assert.ok((await indexNames(database, 'Transaction')).includes('Transaction_businessKey_key'));
});

test('baseline resolve is blocked when the database is not schema-equivalent', async (t) => {
  const dir = await createTempDir('diff-gate');
  t.after(() => removeTempDir(dir));
  const baselineOnly = await createBaselineOnlyMigrations(dir);

  const equivalent = await createPreChangeDatabase(dir, 'equivalent.db');
  assert.equal(schemaDiffExitCode(equivalent, baselineOnly).code, 0, 'pre-change database must equal the baseline');

  const drifted = await createPreChangeDatabase(dir, 'drifted.db');
  await withClient(drifted, prisma => prisma.$executeRawUnsafe('ALTER TABLE "Deal" ADD COLUMN "operatorNote" TEXT'));
  assert.equal(schemaDiffExitCode(drifted, baselineOnly).code, 2, 'drifted database must not be resolvable');
});

test('pre-change database resolves baseline and deploys preserving every row', async (t) => {
  const dir = await createTempDir('pre-change');
  t.after(() => removeTempDir(dir));
  const database = await createPreChangeDatabase(dir);
  await seedLegacyRows(database);

  const baselineOnly = await createBaselineOnlyMigrations(dir);
  assert.equal(schemaDiffExitCode(database, baselineOnly).code, 0, 'schema equivalence is the gate for resolve');

  const resolved = resolveApplied(database, BASELINE_MIGRATION);
  assert.equal(resolved.status, 0, `${resolved.stdout}\n${resolved.stderr}`);

  const deployed = migrateDeploy(database);
  assert.equal(deployed.status, 0, `${deployed.stdout}\n${deployed.stderr}`);

  const after = await withClient(database, async (prisma) => ({
    deal: (await prisma.$queryRawUnsafe('SELECT * FROM "Deal" WHERE "id" = \'deal-live\''))[0],
    transactions: await prisma.$queryRawUnsafe('SELECT "id","amt","status","refType","refId","businessKey" FROM "Transaction" ORDER BY "id"'),
    chat: (await prisma.$queryRawUnsafe('SELECT "id","dealId" FROM "Chat"'))[0],
    review: (await prisma.$queryRawUnsafe('SELECT "id","dealId" FROM "Review"'))[0],
    chainSteps: await prisma.$queryRawUnsafe('SELECT "id","chainId","topup" FROM "ChainStep" ORDER BY "id"'),
    users: await prisma.$queryRawUnsafe('SELECT "id","balance" FROM "User" ORDER BY "id"'),
  }));

  assert.equal(after.deal.id, 'deal-live');
  assert.equal(after.deal.credits, 40);
  assert.equal(after.deal.status, 'active');
  assert.equal(after.deal.escrowTransactionId, null, 'migration must not guess a link');
  assert.equal(after.deal.createCommandKey, null);

  // Пересборка Deal не должна оборвать ссылки на неё: у Chat и Review
  // dealId объявлен как ON DELETE SET NULL, и DROP TABLE при включённых
  // внешних ключах обнулил бы их молча.
  assert.equal(after.chat.dealId, 'deal-live');
  assert.equal(after.review.dealId, 'deal-live');

  assert.deepEqual(after.transactions, [
    { id: 'tx-chain-hold', amt: 25, status: 'held', refType: 'chain', refId: 'chain-live', businessKey: null },
    { id: 'tx-direct-hold', amt: 40, status: 'held', refType: '', refId: '', businessKey: null },
  ]);
  assert.deepEqual(after.chainSteps, [{ id: 'step-1', chainId: 'chain-live', topup: 25 }]);
  assert.deepEqual(after.users.map(user => user.balance), [60, 0, 25]);

  const health = await healthChecks(database);
  assert.deepEqual(health.integrityCheck, ['ok']);
  assert.deepEqual(health.foreignKeyCheck, []);

  const rerun = migrateDeploy(database);
  assert.equal(rerun.status, 0, `${rerun.stdout}\n${rerun.stderr}`);
});

async function migratedDatabaseWithLegacyRows(dir, name = 'restored.db') {
  const database = await createPreChangeDatabase(dir, name);
  await seedLegacyRows(database);
  const resolved = resolveApplied(database, BASELINE_MIGRATION);
  assert.equal(resolved.status, 0, `${resolved.stdout}\n${resolved.stderr}`);
  const deployed = migrateDeploy(database);
  assert.equal(deployed.status, 0, `${deployed.stdout}\n${deployed.stderr}`);
  return database;
}

function auditSnapshot(database, livePath, output, manifest) {
  return runScript('scripts/audit-deal-escrow.mjs', [
    '--database', database,
    '--live-path', livePath,
    '--output', output,
    ...(manifest ? ['--manifest', manifest] : []),
  ]);
}

function backfill(args) {
  return runScript('scripts/backfill-deal-escrow.mjs', args);
}

function manifestHashOf(stdout) {
  return /manifest-sha256: ([a-f0-9]{64})/.exec(stdout)?.[1];
}

async function escrowState(database) {
  return withClient(database, async (prisma) => ({
    deal: (await prisma.$queryRawUnsafe('SELECT "id","escrowTransactionId" FROM "Deal" ORDER BY "id"'))[0],
    transactions: await prisma.$queryRawUnsafe('SELECT "id","refType","refId","businessKey" FROM "Transaction" ORDER BY "id"'),
  }));
}

test('backfill manifest lists only the canonical unique direct pair', async (t) => {
  const dir = await createTempDir('manifest');
  t.after(() => removeTempDir(dir));
  const database = await migratedDatabaseWithLegacyRows(dir);
  const livePath = path.join(dir, 'live.db');
  const auditFile = path.join(dir, 'audit.json');
  const manifest = path.join(dir, 'manifest.json');

  auditSnapshot(database, livePath, auditFile);
  const emitted = backfill([
    '--emit-manifest',
    '--database', database,
    '--live-path', livePath,
    '--audit', auditFile,
    '--manifest', manifest,
  ]);
  assert.equal(emitted.status, 0, `${emitted.stdout}\n${emitted.stderr}`);

  const written = JSON.parse(await readFile(manifest, 'utf8'));
  assert.deepEqual(written.rows, [{
    dealId: 'deal-live',
    transactionId: 'tx-direct-hold',
    refType: 'deal',
    refId: 'deal-live',
    businessKey: 'deal:deal-live:hold',
  }]);
  assert.match(manifestHashOf(emitted.stdout), /^[a-f0-9]{64}$/);

  // Манифест ничего не пишет в базу.
  const state = await escrowState(database);
  assert.equal(state.deal.escrowTransactionId, null);

  const repeated = backfill([
    '--emit-manifest',
    '--database', database,
    '--live-path', livePath,
    '--audit', auditFile,
    '--manifest', manifest,
  ]);
  assert.notEqual(repeated.status, 0);
  assert.match(`${repeated.stdout}\n${repeated.stderr}`, /already exists/i);
});

test('backfill dry-run rejects manifest hash drift and writes nothing', async (t) => {
  const dir = await createTempDir('dry-run');
  t.after(() => removeTempDir(dir));
  const database = await migratedDatabaseWithLegacyRows(dir);
  const livePath = path.join(dir, 'live.db');
  const auditFile = path.join(dir, 'audit.json');
  const manifest = path.join(dir, 'manifest.json');

  auditSnapshot(database, livePath, auditFile);
  const emitted = backfill([
    '--emit-manifest', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest,
  ]);
  const hash = manifestHashOf(emitted.stdout);

  const ok = backfill([
    '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', hash,
  ]);
  assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
  assert.match(ok.stdout, /"mutations":0/);

  const drifted = backfill([
    '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest,
    '--manifest-sha256', 'f'.repeat(64),
  ]);
  assert.notEqual(drifted.status, 0);
  assert.match(`${drifted.stdout}\n${drifted.stderr}`, /manifest hash mismatch/i);

  assert.equal((await escrowState(database)).deal.escrowTransactionId, null);
});

test('rehearsal apply links exact rows, leaves the chain hold alone and reruns as a no-op', async (t) => {
  const dir = await createTempDir('rehearsal');
  t.after(() => removeTempDir(dir));
  const database = await migratedDatabaseWithLegacyRows(dir);
  const livePath = path.join(dir, 'live.db');
  const auditFile = path.join(dir, 'audit.json');
  const manifest = path.join(dir, 'manifest.json');

  auditSnapshot(database, livePath, auditFile);
  const hash = manifestHashOf(backfill([
    '--emit-manifest', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest,
  ]).stdout);

  const applied = backfill([
    '--rehearsal-apply', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', hash,
  ]);
  assert.equal(applied.status, 0, `${applied.stdout}\n${applied.stderr}`);
  assert.match(applied.stdout, /"mutations":1/);

  const state = await escrowState(database);
  assert.equal(state.deal.escrowTransactionId, 'tx-direct-hold');
  assert.deepEqual(state.transactions, [
    { id: 'tx-chain-hold', refType: 'chain', refId: 'chain-live', businessKey: null },
    { id: 'tx-direct-hold', refType: 'deal', refId: 'deal-live', businessKey: 'deal:deal-live:hold' },
  ]);

  const rerun = backfill([
    '--rehearsal-apply', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', hash,
  ]);
  assert.equal(rerun.status, 0, `${rerun.stdout}\n${rerun.stderr}`);
  assert.match(rerun.stdout, /"mutations":0/);

  // После бэкфилла аудит со сверкой по манифесту не считает связанную
  // сделку блокирующей находкой.
  const postAudit = path.join(dir, 'post-audit.json');
  const post = auditSnapshot(database, livePath, postAudit, manifest);
  assert.equal(post.status, 0, `${post.stdout}\n${post.stderr}`);
  const report = JSON.parse(await readFile(postAudit, 'utf8'));
  assert.equal(report.high, false);
  assert.equal(report.classification.manifestApplied, true);
});

test('rehearsal apply refuses the resolved live path and plain --apply', async (t) => {
  const dir = await createTempDir('live-deny');
  t.after(() => removeTempDir(dir));
  const database = await migratedDatabaseWithLegacyRows(dir);
  const auditFile = path.join(dir, 'audit.json');
  const manifest = path.join(dir, 'manifest.json');
  auditSnapshot(database, path.join(dir, 'live.db'), auditFile);

  const denied = backfill([
    '--rehearsal-apply', '--database', database, '--live-path', database,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', 'a'.repeat(64),
  ]);
  assert.notEqual(denied.status, 0);
  assert.match(`${denied.stdout}\n${denied.stderr}`, /live path/i);

  const plainApply = backfill(['--apply', '--database', database]);
  assert.notEqual(plainApply.status, 0);
  assert.match(`${plainApply.stdout}\n${plainApply.stderr}`, /--apply is not supported/i);
});

test('production apply contract fails closed and consumes its token once', async (t) => {
  const dir = await createTempDir('production');
  t.after(() => removeTempDir(dir));
  const database = await migratedDatabaseWithLegacyRows(dir);
  // Боевой контракт: аудит делается по неизменяемому снимку, а применение
  // идёт к живой базе. Совпадение путей здесь запрещено, поэтому снимок —
  // отдельный файл.
  const snapshot = path.join(dir, 'pre-apply-snapshot.db');
  await copyFile(database, snapshot);
  const auditFile = path.join(dir, 'pre-audit.json');
  const manifest = path.join(dir, 'manifest.json');
  const ledger = path.join(dir, 'token-receipt.json');

  auditSnapshot(snapshot, database, auditFile);
  const hash = manifestHashOf(backfill([
    '--emit-manifest', '--database', snapshot, '--live-path', database,
    '--audit', auditFile, '--manifest', manifest,
  ]).stdout);

  const preAuditSha256 = createHash('sha256').update(await readFile(auditFile)).digest('hex');
  const evidence = {
    'pre-snapshot-sha256': '1'.repeat(64),
    'candidate-sha256': '3'.repeat(64),
    'rollback-sha256': '4'.repeat(64),
    'single-writer-sha256': '5'.repeat(64),
  };
  const token = approvalToken({
    version: 1,
    livePath: await realpath(database),
    preSnapshotSha256: evidence['pre-snapshot-sha256'],
    preAuditSha256,
    manifestSha256: hash,
    candidateSha256: evidence['candidate-sha256'],
    rollbackSha256: evidence['rollback-sha256'],
    singleWriterSha256: evidence['single-writer-sha256'],
  });

  const productionArgs = (overrides = {}) => [
    '--production-apply',
    '--database', database,
    '--live-path', database,
    '--confirm-live-path', overrides.confirm ?? database,
    '--audit', overrides.audit ?? auditFile,
    '--manifest', manifest,
    '--manifest-sha256', hash,
    '--pre-snapshot-sha256', evidence['pre-snapshot-sha256'],
    '--pre-audit-sha256', overrides.preAuditSha256 ?? preAuditSha256,
    '--candidate-sha256', evidence['candidate-sha256'],
    '--rollback-sha256', evidence['rollback-sha256'],
    '--single-writer-sha256', evidence['single-writer-sha256'],
    '--approval-token', overrides.token ?? token,
    '--ledger', overrides.ledger ?? ledger,
  ];

  const wrongConfirm = backfill(productionArgs({ confirm: path.join(dir, 'other.db') }));
  assert.notEqual(wrongConfirm.status, 0);
  assert.match(`${wrongConfirm.stdout}\n${wrongConfirm.stderr}`, /resolve to one path/i);

  // Аудит, снятый с живой базы, для боевого применения недопустим.
  const liveAudit = path.join(dir, 'live-audit.json');
  auditSnapshot(database, path.join(dir, 'elsewhere.db'), liveAudit);
  const fromLive = backfill(productionArgs({
    audit: liveAudit,
    preAuditSha256: createHash('sha256').update(await readFile(liveAudit)).digest('hex'),
    ledger: path.join(dir, 'ledger-live.json'),
  }));
  assert.notEqual(fromLive.status, 0);
  assert.match(`${fromLive.stdout}\n${fromLive.stderr}`, /immutable snapshot|approval token/i);

  const wrongToken = backfill(productionArgs({ token: '9'.repeat(64), ledger: path.join(dir, 'ledger-b.json') }));
  assert.notEqual(wrongToken.status, 0);
  assert.match(`${wrongToken.stdout}\n${wrongToken.stderr}`, /approval token/i);

  const first = backfill(productionArgs());
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  assert.match(first.stdout, /"mutations":1/);
  assert.equal((await escrowState(database)).deal.escrowTransactionId, 'tx-direct-hold');

  const reused = backfill(productionArgs());
  assert.notEqual(reused.status, 0);
  assert.match(`${reused.stdout}\n${reused.stderr}`, /already consumed/i);
});

test('rows the backfill cannot fix are listed and block apply until they are dispositioned', async (t) => {
  const dir = await createTempDir('unresolved');
  t.after(() => removeTempDir(dir));
  const database = await migratedDatabaseWithLegacyRows(dir, 'unresolved.db');
  // Живой случай с продакшена: холд, которому не соответствует ни одна
  // сделка. Чинить его бэкфилл не имеет права, но и связать здоровую пару
  // рядом он обязан.
  await withClient(database, prisma => prisma.$executeRawUnsafe(
    `INSERT INTO "Transaction" ("id","userId","kind","title","amt","status","refType","refId") VALUES ('tx-orphan','u-buyer','escrow-in','Эскроу',15,'held','','')`,
  ));

  const livePath = path.join(dir, 'live.db');
  const auditFile = path.join(dir, 'audit.json');
  const manifest = path.join(dir, 'manifest.json');
  const dispositions = path.join(dir, 'dispositions.json');
  auditSnapshot(database, livePath, auditFile);

  const emitted = backfill([
    '--emit-manifest', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest,
  ]);
  assert.equal(emitted.status, 0, `${emitted.stdout}\n${emitted.stderr}`);
  const hash = manifestHashOf(emitted.stdout);

  const written = JSON.parse(await readFile(manifest, 'utf8'));
  assert.equal(written.rows.length, 1, 'the healthy pair is still planned');
  assert.deepEqual(written.unresolved.map(entry => `${entry.bucket}:${entry.id}`), ['orphanDirectHolds:tx-orphan']);

  const withoutDispositions = backfill([
    '--rehearsal-apply', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', hash,
  ]);
  assert.notEqual(withoutDispositions.status, 0);
  assert.match(`${withoutDispositions.stdout}\n${withoutDispositions.stderr}`, /require --dispositions/i);
  assert.equal((await escrowState(database)).deal.escrowTransactionId, null, 'nothing was written');

  await writeFile(dispositions, JSON.stringify({
    kind: 'escrow-backfill-dispositions',
    rows: [{ bucket: 'orphanDirectHolds', id: 'tx-wrong-id', decision: 'leave-as-is' }],
  }, null, 2));
  const mismatched = backfill([
    '--rehearsal-apply', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', hash,
    '--dispositions', dispositions,
  ]);
  assert.notEqual(mismatched.status, 0);
  assert.match(`${mismatched.stdout}\n${mismatched.stderr}`, /do not match unresolved rows/i);

  await writeFile(dispositions, JSON.stringify({
    kind: 'escrow-backfill-dispositions',
    rows: [{
      bucket: 'orphanDirectHolds',
      id: 'tx-orphan',
      decision: 'leave-as-is',
      note: 'проверено оператором, деньги остаются замороженными до ручного разбора',
    }],
  }, null, 2));
  const applied = backfill([
    '--rehearsal-apply', '--database', database, '--live-path', livePath,
    '--audit', auditFile, '--manifest', manifest, '--manifest-sha256', hash,
    '--dispositions', dispositions,
  ]);
  assert.equal(applied.status, 0, `${applied.stdout}\n${applied.stderr}`);
  assert.match(applied.stdout, /"mutations":1/);

  const state = await escrowState(database);
  assert.equal(state.deal.escrowTransactionId, 'tx-direct-hold', 'the healthy pair is linked');
  const orphan = state.transactions.find(tx => tx.id === 'tx-orphan');
  assert.deepEqual(
    { refType: orphan.refType, refId: orphan.refId, businessKey: orphan.businessKey },
    { refType: '', refId: '', businessKey: null },
    'a dispositioned row is still never written',
  );
});
