import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { chmod, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ENV_BY_OPTION = {
  source: 'ESCROW_SOURCE_DB',
  target: 'ESCROW_BACKUP_TARGET',
  evidence: 'ESCROW_BACKUP_EVIDENCE',
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

function sqliteUrl(database, readOnly = false) {
  return `file:${database.replaceAll('\\', '/')}${readOnly ? '?mode=ro' : ''}`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

async function runtimeEvidence(prisma) {
  const [versionRows, compileRows, journalRows, synchronousRows, foreignKeyRows, pageSizeRows] = await Promise.all([
    prisma.$queryRawUnsafe('SELECT sqlite_version() AS version'),
    prisma.$queryRawUnsafe('PRAGMA compile_options'),
    prisma.$queryRawUnsafe('PRAGMA journal_mode'),
    prisma.$queryRawUnsafe('PRAGMA synchronous'),
    prisma.$queryRawUnsafe('PRAGMA foreign_keys'),
    prisma.$queryRawUnsafe('PRAGMA page_size'),
  ]);
  return jsonSafe({
    sqliteVersion: versionRows[0]?.version || null,
    compileOptions: compileRows.map(row => row.compile_options).sort(),
    pragmas: {
      journalMode: journalRows[0]?.journal_mode ?? null,
      synchronous: synchronousRows[0]?.synchronous ?? null,
      foreignKeys: foreignKeyRows[0]?.foreign_keys ?? null,
      pageSize: pageSizeRows[0]?.page_size ?? null,
    },
  });
}

async function verifySnapshot(target) {
  const prisma = new PrismaClient({ datasourceUrl: sqliteUrl(target, true) });
  try {
    const [integrityRows, foreignKeyRows, runtime] = await Promise.all([
      prisma.$queryRawUnsafe('PRAGMA integrity_check'),
      prisma.$queryRawUnsafe('PRAGMA foreign_key_check'),
      runtimeEvidence(prisma),
    ]);
    return {
      integrityCheck: integrityRows.map(row => row.integrity_check),
      foreignKeyCheck: jsonSafe(foreignKeyRows),
      runtime,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const source = await canonicalPath(options.source);
  const target = await canonicalPath(options.target);
  const evidence = await canonicalPath(options.evidence);

  if (!existsSync(source)) throw new Error(`source database does not exist: ${source}`);
  if (samePath(source, target)) throw new Error('source and target resolve to the same path');
  if (samePath(source, evidence) || samePath(target, evidence)) throw new Error('evidence path collides with source or target');
  if (existsSync(target)) throw new Error(`target already exists: ${target}`);
  if (existsSync(evidence)) throw new Error(`evidence already exists: ${evidence}`);
  if (!existsSync(path.dirname(target))) throw new Error(`target directory does not exist: ${path.dirname(target)}`);
  if (!existsSync(path.dirname(evidence))) throw new Error(`evidence directory does not exist: ${path.dirname(evidence)}`);

  const sourceBefore = await stat(source);
  const sourceClient = new PrismaClient({ datasourceUrl: sqliteUrl(source) });
  let sourceRuntime;
  try {
    sourceRuntime = await runtimeEvidence(sourceClient);
    await sourceClient.$executeRawUnsafe(`VACUUM INTO ${sqlString(target)}`);
  } finally {
    await sourceClient.$disconnect();
  }

  const independent = await verifySnapshot(target);
  if (independent.integrityCheck.length !== 1 || independent.integrityCheck[0] !== 'ok') {
    throw new Error(`snapshot integrity_check failed: ${JSON.stringify(independent.integrityCheck)}`);
  }
  if (independent.foreignKeyCheck.length !== 0) {
    throw new Error(`snapshot foreign_key_check failed: ${JSON.stringify(independent.foreignKeyCheck)}`);
  }

  const [targetStat, digest] = await Promise.all([stat(target), sha256(target)]);
  const manifest = {
    kind: 'escrow-snapshot',
    schemaVersion: 1,
    immutable: true,
    source: {
      path: source,
      size: sourceBefore.size,
      modifiedAt: sourceBefore.mtime.toISOString(),
    },
    target: {
      path: target,
    },
    artifact: {
      sha256: digest,
      size: targetStat.size,
    },
    runtime: independent.runtime,
    sourceRuntime,
    verification: {
      integrityCheck: independent.integrityCheck,
      foreignKeyCheck: independent.foreignKeyCheck,
    },
  };

  await chmod(target, 0o444);
  await writeFile(evidence, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await chmod(evidence, 0o444);
  console.log(`escrow snapshot: ${target}`);
  console.log(`sha256: ${digest}`);
}

main()
  .catch(error => {
    console.error(`escrow snapshot failed: ${error.message}`);
    process.exitCode = 1;
  });
