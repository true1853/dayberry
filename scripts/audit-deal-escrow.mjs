import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyEscrowCandidateGraph } from '../lib/deals/escrow-invariants.js';

const ENV_BY_OPTION = {
  database: 'ESCROW_DATABASE',
  'live-path': 'ESCROW_LIVE_DB',
  output: 'ESCROW_AUDIT_OUTPUT',
};

function parseOptions(argv, environment = process.env) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    const name = token.slice(2);
    if (!(name in ENV_BY_OPTION)) throw new Error(`unknown option: --${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing required input: ${name}`);
    parsed[name] = value;
    index += 1;
  }

  for (const [name, envName] of Object.entries(ENV_BY_OPTION)) {
    const value = parsed[name] ?? environment[envName];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`missing required input: ${name} (or ${envName})`);
    }
    parsed[name] = value.trim();
  }
  return parsed;
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

function sqliteUrl(database) {
  return `file:${database.replaceAll('\\', '/')}?mode=ro`;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function jsonSafe(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]));
  }
  return value;
}

async function tableColumns(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return new Set(rows.map(row => row.name));
}

function selectColumn(columns, tableAlias, name, fallback = 'NULL') {
  return columns.has(name)
    ? `${tableAlias}.${quoteIdentifier(name)} AS ${quoteIdentifier(name)}`
    : `${fallback} AS ${quoteIdentifier(name)}`;
}

async function readDomainRows(prisma) {
  const dealColumns = await tableColumns(prisma, 'Deal');
  const transactionColumns = await tableColumns(prisma, 'Transaction');
  const userColumns = await tableColumns(prisma, 'User');
  const lotColumns = await tableColumns(prisma, 'Lot');

  const deals = dealColumns.size === 0 ? [] : await prisma.$queryRawUnsafe(`
    SELECT
      ${selectColumn(dealColumns, 'd', 'id')},
      ${selectColumn(dealColumns, 'd', 'userId')},
      ${selectColumn(dealColumns, 'd', 'lotId')},
      ${selectColumn(dealColumns, 'd', 'credits', '0')},
      ${selectColumn(dealColumns, 'd', 'status')},
      ${selectColumn(dealColumns, 'd', 'stage')},
      ${selectColumn(dealColumns, 'd', 'disputedAt')},
      ${selectColumn(dealColumns, 'd', 'escrowTransactionId')},
      ${selectColumn(dealColumns, 'd', 'createCommandKey')},
      ${lotColumns.has('ownerId') ? 'l."ownerId"' : 'NULL'} AS "ownerId"
    FROM "Deal" d
    ${lotColumns.size > 0 && dealColumns.has('lotId') ? 'LEFT JOIN "Lot" l ON l."id" = d."lotId"' : 'LEFT JOIN (SELECT NULL AS "id", NULL AS "ownerId") l ON 0'}
    ORDER BY d."id"
  `);

  const transactions = transactionColumns.size === 0 ? [] : await prisma.$queryRawUnsafe(`
    SELECT
      ${selectColumn(transactionColumns, 't', 'id')},
      ${selectColumn(transactionColumns, 't', 'userId')},
      ${selectColumn(transactionColumns, 't', 'kind')},
      ${selectColumn(transactionColumns, 't', 'amt', '0')},
      ${selectColumn(transactionColumns, 't', 'status')},
      ${selectColumn(transactionColumns, 't', 'refType', "''")},
      ${selectColumn(transactionColumns, 't', 'refId', "''")},
      ${selectColumn(transactionColumns, 't', 'businessKey')}
    FROM "Transaction" t
    ORDER BY t."id"
  `);

  const users = userColumns.size === 0 ? [] : await prisma.$queryRawUnsafe(`
    SELECT
      ${selectColumn(userColumns, 'u', 'id')},
      ${selectColumn(userColumns, 'u', 'balance', '0')},
      ${selectColumn(userColumns, 'u', 'dealsCount')}
    FROM "User" u
    ORDER BY u."id"
  `);

  return jsonSafe({ deals, transactions, users });
}

async function readRuntime(prisma) {
  const [versionRows, compileRows, journalRows, synchronousRows, foreignKeyRows, queryOnlyRows] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT sqlite_version() AS version'),
    prisma.$queryRawUnsafe('PRAGMA compile_options'),
    prisma.$queryRawUnsafe('PRAGMA journal_mode'),
    prisma.$queryRawUnsafe('PRAGMA synchronous'),
    prisma.$queryRawUnsafe('PRAGMA foreign_keys'),
    prisma.$queryRawUnsafe('PRAGMA query_only'),
  ]);
  return jsonSafe({
    sqliteVersion: versionRows[0]?.version || null,
    compileOptions: compileRows.map(row => row.compile_options).sort(),
    pragmas: {
      journalMode: journalRows[0]?.journal_mode ?? null,
      synchronous: synchronousRows[0]?.synchronous ?? null,
      foreignKeys: foreignKeyRows[0]?.foreign_keys ?? null,
      queryOnly: queryOnlyRows[0]?.query_only ?? null,
    },
  });
}

async function readTableCounts(prisma) {
  const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const counts = {};
  for (const { name } of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`);
    counts[name] = Number(rows[0]?.count || 0);
  }
  return counts;
}

export async function runAudit({ database, livePath, output }) {
  const resolvedDatabase = await canonicalPath(database);
  const resolvedLivePath = await canonicalPath(livePath);
  const resolvedOutput = await canonicalPath(output);

  if (samePath(resolvedDatabase, resolvedLivePath)) {
    throw new Error('audit database resolves to the live path');
  }
  if (!existsSync(resolvedDatabase)) throw new Error(`audit database does not exist: ${resolvedDatabase}`);
  if (samePath(resolvedOutput, resolvedDatabase) || samePath(resolvedOutput, resolvedLivePath)) {
    throw new Error('audit output collides with a database path');
  }

  const prisma = new PrismaClient({ datasourceUrl: sqliteUrl(resolvedDatabase) });
  let report;
  try {
    const [rows, runtime, tableCounts] = await Promise.all([
      readDomainRows(prisma),
      readRuntime(prisma),
      readTableCounts(prisma),
    ]);
    const classification = classifyEscrowCandidateGraph(rows);
    const high = Object.values(classification.buckets).some(bucket => bucket.length > 0);
    report = {
      kind: 'escrow-audit',
      schemaVersion: 1,
      mode: 'read-only',
      database: resolvedDatabase,
      livePath: resolvedLivePath,
      high,
      runtime,
      tableCounts,
      classification,
    };
  } finally {
    await prisma.$disconnect();
  }

  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const report = await runAudit({
    database: options.database,
    livePath: options['live-path'],
    output: options.output,
  });
  const bucketCounts = Object.fromEntries(
    Object.entries(report.classification.buckets).map(([name, rows]) => [name, rows.length]),
  );
  console.log(`escrow audit: hash=${report.classification.hash} high=${report.high}`);
  console.log(JSON.stringify({ automaticPairs: report.classification.automaticPairs.length, buckets: bucketCounts }));
  if (report.high) process.exitCode = 2;
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch(error => {
    console.error(`escrow audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
