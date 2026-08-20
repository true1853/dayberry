// Бэкфилл точной связи сделки с её эскроу.
//
// Четыре взаимоисключающих режима, по возрастанию полномочий:
//   --emit-manifest    только чтение: строит канонический манифест и его SHA-256;
//   (по умолчанию)     dry-run: сверяет манифест и БД, ничего не пишет;
//   --rehearsal-apply  запись на НЕ живой копии; повтор даёт mutations=0;
//   --production-apply запись на живой базе; только из плана 01-06.
//
// Ни один режим, кроме production, не имеет права разрешиться в живой путь.
// Ни один режим не угадывает связь: источник истины — аудит снимка и
// одобренный манифест, а каждая строка перечитывается перед записью.
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stableHoldKey } from '../lib/deals/escrow-invariants.js';

const MODES = ['emit-manifest', 'rehearsal-apply', 'production-apply'];

const ENV_BY_OPTION = {
  database: 'ESCROW_DATABASE',
  'live-path': 'ESCROW_LIVE_DB',
  audit: 'ESCROW_AUDIT',
  manifest: 'ESCROW_MANIFEST',
  'manifest-sha256': 'ESCROW_MANIFEST_SHA256',
  'confirm-live-path': 'ESCROW_CONFIRM_LIVE_DB',
  dispositions: 'ESCROW_DISPOSITIONS',
  'pre-snapshot-sha256': 'ESCROW_PRE_SNAPSHOT_SHA256',
  'pre-audit-sha256': 'ESCROW_PRE_AUDIT_SHA256',
  'candidate-sha256': 'ESCROW_CANDIDATE_SHA256',
  'rollback-sha256': 'ESCROW_ROLLBACK_SHA256',
  'single-writer-sha256': 'ESCROW_SINGLE_WRITER_SHA256',
  'approval-token': 'ESCROW_APPROVAL_TOKEN',
  ledger: 'ESCROW_TOKEN_LEDGER',
};

const REQUIRED_BY_MODE = {
  'emit-manifest': ['database', 'live-path', 'audit', 'manifest'],
  'dry-run': ['database', 'live-path', 'audit', 'manifest', 'manifest-sha256'],
  'rehearsal-apply': ['database', 'live-path', 'audit', 'manifest', 'manifest-sha256'],
  'production-apply': [
    'database', 'live-path', 'audit', 'manifest', 'manifest-sha256',
    'confirm-live-path', 'pre-snapshot-sha256', 'pre-audit-sha256',
    'candidate-sha256', 'rollback-sha256', 'single-writer-sha256',
    'approval-token', 'ledger',
  ],
};

// Отсутствие связи — единственная категория, которую бэкфилл и должен
// устранить. Всё остальное он не чинит никогда: такие строки попадают в
// раздел unresolved манифеста и требуют поимённого решения оператора,
// но не мешают связать здоровые пары рядом.
const SELF_HEALING_BUCKETS = new Set(['missingLink']);

export function parseOptions(argv, environment = process.env) {
  const parsed = {};
  let mode = 'dry-run';

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    const name = token.slice(2);

    if (name === 'apply') throw new Error('plain --apply is not supported: use --rehearsal-apply or --production-apply');
    if (MODES.includes(name)) {
      if (mode !== 'dry-run') throw new Error('modes are mutually exclusive');
      mode = name;
      continue;
    }
    if (!(name in ENV_BY_OPTION)) throw new Error(`unknown option: --${name}`);

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing required input: ${name}`);
    parsed[name] = value;
    index += 1;
  }

  for (const name of REQUIRED_BY_MODE[mode]) {
    const envName = ENV_BY_OPTION[name];
    const value = parsed[name] ?? environment[envName];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`missing required input: ${name} (or ${envName})`);
    }
    parsed[name] = value.trim();
  }

  return { mode, options: parsed };
}

async function canonicalPath(value) {
  const resolved = path.resolve(value);
  if (existsSync(resolved)) return realpath(resolved);
  const parent = path.dirname(resolved);
  const canonicalParent = existsSync(parent) ? await realpath(parent) : path.resolve(parent);
  return path.join(canonicalParent, path.basename(resolved));
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function sqliteUrl(database, readOnly = false) {
  return `file:${database.replaceAll('\\', '/')}${readOnly ? '?mode=ro' : ''}`;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Токен производится только из неизменяемых доказательств и точного пути
// живой базы: подменить один вход и не сломать токен нельзя.
export function approvalToken(authorization) {
  return sha256Text(stableJson(authorization));
}

function assertAuditUsable(audit, expectedDatabase) {
  if (audit.kind !== 'escrow-audit') throw new Error('audit file is not an escrow audit');
  if (!samePath(path.resolve(audit.database), expectedDatabase)) {
    throw new Error(`audit was produced for a different database: ${audit.database}`);
  }
}

// Каждая строка, которую бэкфилл видит, но чинить не имеет права. Ключ
// строки — категория плюс идентификатор: он и есть единица решения
// оператора по PF-02.
function collectUnresolved(audit) {
  const rows = [];
  for (const [bucket, entries] of Object.entries(audit.classification.buckets)) {
    if (SELF_HEALING_BUCKETS.has(bucket) || entries.length === 0) continue;
    for (const entry of entries) {
      const id = entry.dealId || entry.transactionId || entry.refId || entry.userId || entry.businessKey;
      rows.push({ bucket, id: String(id), row: entry });
    }
  }
  return rows.sort((left, right) => `${left.bucket}:${left.id}`.localeCompare(`${right.bucket}:${right.id}`));
}

function dispositionKey(entry) {
  return `${entry.bucket}:${entry.id}`;
}

// Решения не разрешают запись — они подтверждают, что оператор видел
// каждую строку поимённо. Несовпадение множеств останавливает применение.
function assertDispositionsCover(unresolved, dispositions) {
  if (dispositions.kind !== 'escrow-backfill-dispositions') {
    throw new Error('dispositions file has the wrong kind');
  }
  const decided = new Map((dispositions.rows || []).map(row => [`${row.bucket}:${row.id}`, row]));
  const expected = unresolved.map(dispositionKey).sort();
  const actual = [...decided.keys()].sort();
  if (stableJson(expected) !== stableJson(actual)) {
    const missing = expected.filter(key => !decided.has(key));
    const extra = actual.filter(key => !expected.includes(key));
    throw new Error(`dispositions do not match unresolved rows: missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(extra)}`);
  }
  for (const [key, row] of decided) {
    if (typeof row.decision !== 'string' || row.decision.trim() === '') {
      throw new Error(`disposition without a decision: ${key}`);
    }
  }
}

export function buildManifest({ database, livePath, auditFile, auditSha256, audit }) {
  const rows = audit.classification.automaticPairs
    .map(pair => ({
      dealId: String(pair.dealId),
      transactionId: String(pair.transactionId),
      refType: 'deal',
      refId: String(pair.dealId),
      businessKey: stableHoldKey(pair.dealId),
    }))
    .sort((left, right) => left.dealId.localeCompare(right.dealId));

  return {
    kind: 'escrow-backfill-manifest',
    schemaVersion: 2,
    database,
    livePath,
    audit: {
      file: auditFile,
      sha256: auditSha256,
      classificationHash: audit.classification.hash,
      severity: audit.severity,
    },
    rows,
    unresolved: collectUnresolved(audit),
    counts: {
      rows: rows.length,
      unresolved: collectUnresolved(audit).length,
      chainRows: audit.classification.chainRows.length,
    },
  };
}

function manifestText(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function manifestSha256(manifest) {
  return sha256Text(stableJson(manifest));
}

async function readRow(prisma, table, id) {
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE "id" = ?`, id);
  return rows[0] || null;
}

// Одна строка манифеста применяется только если БД до сих пор выглядит
// ровно так, как в момент аудита. Любое расхождение — стоп без записи.
async function applyRow(prisma, row) {
  const deal = await readRow(prisma, 'Deal', row.dealId);
  const transaction = await readRow(prisma, 'Transaction', row.transactionId);
  if (!deal) throw new Error(`deal disappeared since the audit: ${row.dealId}`);
  if (!transaction) throw new Error(`transaction disappeared since the audit: ${row.transactionId}`);

  const linked = deal.escrowTransactionId;
  if (linked && linked !== row.transactionId) {
    throw new Error(`deal ${row.dealId} is already linked to ${linked}`);
  }
  if (transaction.refType === 'chain') throw new Error(`refusing to consume a chain hold: ${row.transactionId}`);
  if (transaction.userId !== deal.userId) throw new Error(`user drift on ${row.transactionId}`);
  if (Number(transaction.amt) !== Number(deal.credits)) throw new Error(`amount drift on ${row.transactionId}`);
  if (transaction.kind !== 'escrow-in') throw new Error(`kind drift on ${row.transactionId}`);
  if (transaction.refType && transaction.refType !== 'deal') throw new Error(`ref drift on ${row.transactionId}`);
  if (transaction.refId && transaction.refId !== row.refId) throw new Error(`ref drift on ${row.transactionId}`);
  if (transaction.businessKey && transaction.businessKey !== row.businessKey) {
    throw new Error(`business key drift on ${row.transactionId}`);
  }

  const alreadyDone = linked === row.transactionId
    && transaction.refType === row.refType
    && transaction.refId === row.refId
    && transaction.businessKey === row.businessKey;
  if (alreadyDone) return 0;

  await prisma.$executeRawUnsafe(
    'UPDATE "Transaction" SET "refType" = ?, "refId" = ?, "businessKey" = ? WHERE "id" = ?',
    row.refType, row.refId, row.businessKey, row.transactionId,
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "Deal" SET "escrowTransactionId" = ? WHERE "id" = ?',
    row.transactionId, row.dealId,
  );
  return 1;
}

async function reserveToken(ledgerPath, receipt) {
  try {
    // wx: файл-квитанция создаётся ровно один раз. Повтор — отказ до того,
    // как открыта живая база.
    await writeFile(ledgerPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`approval token was already consumed: ${ledgerPath}`);
    throw error;
  }
}

async function main() {
  const { mode, options } = parseOptions(process.argv.slice(2));
  const database = await canonicalPath(options.database);
  const livePath = await canonicalPath(options['live-path']);
  const auditFile = await canonicalPath(options.audit);
  const manifestFile = await canonicalPath(options.manifest);
  const isProduction = mode === 'production-apply';

  if (!existsSync(database)) throw new Error(`database does not exist: ${database}`);
  if (!existsSync(auditFile)) throw new Error(`audit does not exist: ${auditFile}`);

  if (isProduction) {
    const confirmed = await canonicalPath(options['confirm-live-path']);
    if (!samePath(database, livePath) || !samePath(database, confirmed)) {
      throw new Error('production apply requires --database, --live-path and --confirm-live-path to resolve to one path');
    }
  } else if (samePath(database, livePath)) {
    throw new Error(`${mode} refuses the resolved live path`);
  }

  const auditSha256 = await sha256File(auditFile);
  const audit = JSON.parse(await readFile(auditFile, 'utf8'));
  assertAuditUsable(audit, database);

  const expected = buildManifest({
    database,
    livePath,
    auditFile,
    auditSha256,
    audit,
  });

  if (mode === 'emit-manifest') {
    if (existsSync(manifestFile)) throw new Error(`manifest already exists: ${manifestFile}`);
    await writeFile(manifestFile, manifestText(expected), { encoding: 'utf8', flag: 'wx' });
    console.log(`manifest: ${manifestFile}`);
    console.log(`manifest-sha256: ${manifestSha256(expected)}`);
    console.log(JSON.stringify({
      mode,
      rows: expected.rows.length,
      unresolved: expected.unresolved.length,
      mutations: 0,
    }));
    return;
  }

  if (!existsSync(manifestFile)) throw new Error(`manifest does not exist: ${manifestFile}`);
  const approved = JSON.parse(await readFile(manifestFile, 'utf8'));
  const approvedSha256 = manifestSha256(approved);
  if (approvedSha256 !== options['manifest-sha256']) {
    throw new Error(`manifest hash mismatch: expected ${options['manifest-sha256']}, got ${approvedSha256}`);
  }
  if (approved.audit?.sha256 !== auditSha256) {
    throw new Error('manifest was approved against a different audit file');
  }
  if (stableJson(approved.rows) !== stableJson(expected.rows)) {
    throw new Error('approved manifest no longer matches the current audit');
  }
  if (stableJson(approved.unresolved || []) !== stableJson(expected.unresolved)) {
    throw new Error('the set of unresolved rows changed since the manifest was approved');
  }

  // Пока есть строки, которые бэкфилл не чинит, применение требует
  // поимённого решения оператора по каждой из них.
  const unresolved = expected.unresolved;
  if (mode !== 'dry-run' && unresolved.length > 0) {
    if (!options.dispositions) {
      throw new Error(`${unresolved.length} unresolved row(s) require --dispositions before any apply`);
    }
    const dispositionsFile = await canonicalPath(options.dispositions);
    if (!existsSync(dispositionsFile)) throw new Error(`dispositions do not exist: ${dispositionsFile}`);
    assertDispositionsCover(unresolved, JSON.parse(await readFile(dispositionsFile, 'utf8')));
  }

  if (isProduction) {
    const authorization = {
      version: 1,
      livePath: database,
      preSnapshotSha256: options['pre-snapshot-sha256'],
      preAuditSha256: options['pre-audit-sha256'],
      manifestSha256: approvedSha256,
      candidateSha256: options['candidate-sha256'],
      rollbackSha256: options['rollback-sha256'],
      singleWriterSha256: options['single-writer-sha256'],
    };
    const token = approvalToken(authorization);
    if (token !== options['approval-token']) throw new Error('approval token does not match the authorization inputs');
    await reserveToken(await canonicalPath(options.ledger), { authorization, token, manifest: manifestFile });
  }

  if (mode === 'dry-run') {
    console.log(JSON.stringify({
      mode,
      rows: approved.rows.length,
      unresolved: unresolved.length,
      mutations: 0,
      manifestSha256: approvedSha256,
    }));
    if (unresolved.length > 0) {
      console.log(`unresolved rows requiring a disposition:\n${unresolved.map(entry => `  ${entry.bucket}: ${entry.id}`).join('\n')}`);
    }
    return;
  }

  const prisma = new PrismaClient({ datasourceUrl: sqliteUrl(database) });
  let mutations = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of approved.rows) mutations += await applyRow(tx, row);
    });
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({
    mode,
    rows: approved.rows.length,
    unresolved: unresolved.length,
    mutations,
    manifestSha256: approvedSha256,
  }));
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch(error => {
    console.error(`escrow backfill failed: ${error.message}`);
    process.exitCode = 1;
  });
}
