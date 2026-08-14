import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
      await prisma.$executeRawUnsafe("INSERT INTO \"Transaction\" (id, userId, kind, amt, status, refType, refId) VALUES ('hold', 'buyer', 'escrow-in', 40, 'held', '', '')");
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

  await writeFile(snapshot, 'tampered');
  const tampered = runScript('scripts/verify-restored-copy.mjs', [
    '--database', snapshot,
    '--live-path', source,
    '--evidence-dir', evidenceDir,
  ]);
  assert.notEqual(tampered.status, 0);
  assert.match(`${tampered.stdout}\n${tampered.stderr}`, /checksum mismatch/i);
});
