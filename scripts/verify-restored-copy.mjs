import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runAudit } from './audit-deal-escrow.mjs';

const ENV_BY_OPTION = {
  database: 'ESCROW_DATABASE',
  'live-path': 'ESCROW_LIVE_DB',
  'evidence-dir': 'ESCROW_EVIDENCE_DIR',
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

function jsonSafe(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]));
  }
  return value;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function findSnapshotManifest(evidenceDir, database) {
  const names = (await readdir(evidenceDir)).filter(name => name.endsWith('.json')).sort();
  for (const name of names) {
    try {
      const candidate = JSON.parse(await readFile(path.join(evidenceDir, name), 'utf8'));
      if (candidate.kind !== 'escrow-snapshot' || !candidate.target?.path) continue;
      const target = await canonicalPath(candidate.target.path);
      if (samePath(target, database)) return { file: path.join(evidenceDir, name), manifest: candidate };
    } catch {
      // Ignore unrelated or malformed JSON; absence of a matching valid manifest fails below.
    }
  }
  throw new Error(`snapshot manifest not found for restored database: ${database}`);
}

async function independentChecks(database) {
  const prisma = new PrismaClient({ datasourceUrl: sqliteUrl(database) });
  try {
    const [integrityRows, foreignKeyRows, versionRows, compileRows, journalRows, synchronousRows] = await Promise.all([
      prisma.$queryRawUnsafe('PRAGMA integrity_check'),
      prisma.$queryRawUnsafe('PRAGMA foreign_key_check'),
      prisma.$queryRawUnsafe('SELECT sqlite_version() AS version'),
      prisma.$queryRawUnsafe('PRAGMA compile_options'),
      prisma.$queryRawUnsafe('PRAGMA journal_mode'),
      prisma.$queryRawUnsafe('PRAGMA synchronous'),
    ]);
    return jsonSafe({
      integrityCheck: integrityRows.map(row => row.integrity_check),
      foreignKeyCheck: foreignKeyRows,
      runtime: {
        sqliteVersion: versionRows[0]?.version || null,
        compileOptions: compileRows.map(row => row.compile_options).sort(),
        pragmas: {
          journalMode: journalRows[0]?.journal_mode ?? null,
          synchronous: synchronousRows[0]?.synchronous ?? null,
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const database = await canonicalPath(options.database);
  const livePath = await canonicalPath(options['live-path']);
  const evidenceDir = await canonicalPath(options['evidence-dir']);

  if (samePath(database, livePath)) throw new Error('restored database resolves to the live path');
  if (!existsSync(database)) throw new Error(`restored database does not exist: ${database}`);
  if (!existsSync(evidenceDir)) throw new Error(`evidence directory does not exist: ${evidenceDir}`);
  if (!(await stat(evidenceDir)).isDirectory()) throw new Error(`evidence path is not a directory: ${evidenceDir}`);

  const { file: manifestFile, manifest } = await findSnapshotManifest(evidenceDir, database);
  const actualChecksum = await sha256(database);
  if (actualChecksum !== manifest.artifact?.sha256) {
    throw new Error(`checksum mismatch: expected ${manifest.artifact?.sha256 || 'missing'}, got ${actualChecksum}`);
  }

  const checks = await independentChecks(database);
  const auditFile = path.join(evidenceDir, `restore-audit-${actualChecksum.slice(0, 12)}.json`);
  const audit = await runAudit({ database, livePath, output: auditFile });
  const report = {
    kind: 'escrow-restore-verification',
    schemaVersion: 1,
    database,
    livePath,
    snapshotManifest: manifestFile,
    artifact: {
      sha256: actualChecksum,
      size: (await stat(database)).size,
    },
    checks,
    audit: {
      file: auditFile,
      high: audit.high,
      severity: audit.severity,
      classificationHash: audit.classification.hash,
      tableCounts: audit.tableCounts,
    },
  };
  const output = path.join(evidenceDir, 'restore-verification.json');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (checks.integrityCheck.length !== 1 || checks.integrityCheck[0] !== 'ok') {
    throw new Error(`integrity_check failed: ${JSON.stringify(checks.integrityCheck)}`);
  }
  if (checks.foreignKeyCheck.length !== 0) {
    throw new Error(`foreign_key_check failed: ${JSON.stringify(checks.foreignKeyCheck)}`);
  }
  if (audit.high) throw new Error(`HIGH escrow audit result: ${audit.classification.hash}`);

  console.log(`restored copy verified: ${database}`);
  console.log(`sha256: ${actualChecksum}`);
}

main()
  .catch(error => {
    console.error(`restore verification failed: ${error.message}`);
    process.exitCode = 1;
  });
