// Одноразовые SQLite-базы для миграционных тестов.
//
// Правило фазы 1: тест никогда не трогает рабочую базу и не переключает
// провайдер в схеме — меняется только DATABASE_URL, а каждая база живёт в
// собственном временном каталоге и удаляется вместе с ним.
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

export const projectRoot = path.resolve(import.meta.dirname, '..', '..');
export const migrationsDir = path.join(projectRoot, 'prisma', 'migrations');
export const BASELINE_MIGRATION = '20260814170000_baseline';
export const FORWARD_MIGRATION = '20260814171000_deal_escrow_integrity';

const prismaCli = path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');

export function databaseUrl(databasePath) {
  return `file:${path.resolve(databasePath).replaceAll('\\', '/')}`;
}

// Prisma CLI вызывается через node, а не через npx: npx на Windows уходит в
// .cmd-обёртку, и spawnSync без shell на ней падает.
export function runPrisma(args, databasePath, extraEnv = {}) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(databasePath),
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      CHECKPOINT_DISABLE: '1',
      ...extraEnv,
    },
  });
}

export function migrateDeploy(databasePath) {
  return runPrisma(['migrate', 'deploy'], databasePath);
}

export function resolveApplied(databasePath, migration) {
  return runPrisma(['migrate', 'resolve', '--applied', migration], databasePath);
}

// Пустой diff — обязательное условие перед resolve baseline. Код выхода 2
// означает «различия есть»; 0 — эквивалентность. Сравнивать нужно именно с
// baseline: до forward-миграции продовая копия и не должна ей соответствовать.
export function schemaDiffExitCode(databasePath, targetMigrationsDir = migrationsDir) {
  const result = runPrisma([
    'migrate', 'diff',
    '--from-url', databaseUrl(databasePath),
    '--to-migrations', targetMigrationsDir,
    '--shadow-database-url', databaseUrl(`${databasePath}.shadow`),
    '--exit-code',
  ], databasePath);
  return { code: result.status, output: `${result.stdout}\n${result.stderr}` };
}

// Копия истории миграций, обрезанная по baseline: ей проверяется
// эквивалентность схемы перед resolve --applied.
export async function createBaselineOnlyMigrations(dir) {
  const target = path.join(dir, 'migrations-baseline-only');
  await mkdir(path.join(target, BASELINE_MIGRATION), { recursive: true });
  await copyFile(path.join(migrationsDir, 'migration_lock.toml'), path.join(target, 'migration_lock.toml'));
  await copyFile(
    path.join(migrationsDir, BASELINE_MIGRATION, 'migration.sql'),
    path.join(target, BASELINE_MIGRATION, 'migration.sql'),
  );
  return target;
}

async function applySqlScript(databasePath, sqlPath) {
  const script = await readFile(sqlPath, 'utf8');
  const statements = script
    .split(';')
    .map(statement => statement.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
  try {
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
  } finally {
    await prisma.$disconnect();
  }
}

export async function createTempDir(label = 'escrow') {
  return mkdtemp(path.join(os.tmpdir(), `dayberry-${label}-`));
}

export async function removeTempDir(dir) {
  await rm(dir, { recursive: true, force: true });
}

// База в состоянии «до изменения»: только baseline-SQL, без записи в
// _prisma_migrations. Ровно то, чем является продовая копия сегодня.
export async function createPreChangeDatabase(dir, name = 'pre-change.db') {
  const databasePath = path.join(dir, name);
  await applySqlScript(databasePath, path.join(migrationsDir, BASELINE_MIGRATION, 'migration.sql'));
  return databasePath;
}

export async function withClient(databasePath, handler) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl(databasePath) });
  try {
    return await handler(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Живоподобный набор строк: прямая сделка с холдом, цепочка со своим холдом,
// чат и отзыв, ссылающиеся на сделку. Последние два важны: пересборка Deal
// в SQLite может обнулить их dealId, и тест обязан это ловить.
export async function seedLegacyRows(databasePath) {
  await withClient(databasePath, async (prisma) => {
    await prisma.$executeRawUnsafe(`INSERT INTO "User" ("id","name","email","passwordHash","balance") VALUES
      ('u-buyer','Покупатель','buyer@example.test','x',60),
      ('u-seller','Продавец','seller@example.test','x',0),
      ('u-third','Третий','third@example.test','x',25)`);

    await prisma.$executeRawUnsafe(`INSERT INTO "Lot" ("id","ownerId","cat","title","value","aiLow","aiHigh") VALUES
      ('lot-a','u-seller','sport','Велосипед',100,90,110),
      ('lot-b','u-third','music','Гитара',80,70,90)`);

    await prisma.$executeRawUnsafe(`INSERT INTO "Deal" ("id","userId","lotId","credits","stage","status","updatedAt") VALUES
      ('deal-live','u-buyer','lot-a',40,'created','active',CURRENT_TIMESTAMP)`);

    await prisma.$executeRawUnsafe(`INSERT INTO "Transaction" ("id","userId","kind","title","amt","status","refType","refId") VALUES
      ('tx-direct-hold','u-buyer','escrow-in','Эскроу',40,'held','',''),
      ('tx-chain-hold','u-third','escrow-in','Эскроу · цепочка',25,'held','chain','chain-live')`);

    await prisma.$executeRawUnsafe(`INSERT INTO "Chain" ("id","status","fingerprint","initiatorId","updatedAt") VALUES
      ('chain-live','active','fp-live','u-third',CURRENT_TIMESTAMP)`);

    await prisma.$executeRawUnsafe(`INSERT INTO "ChainStep" ("id","chainId","order","userId","lotId","toUserId","value","topup") VALUES
      ('step-1','chain-live',0,'u-third','lot-b','u-seller',80,25)`);

    await prisma.$executeRawUnsafe(`INSERT INTO "Chat" ("id","kind","dealId","userId","partnerId") VALUES
      ('chat-1','direct','deal-live','u-buyer','u-seller')`);

    await prisma.$executeRawUnsafe(`INSERT INTO "Review" ("id","dealId","authorId","targetId","rating","text") VALUES
      ('review-1','deal-live','u-buyer','u-seller',5,'Хорошо')`);
  });
}

export async function tableColumnNames(databasePath, table) {
  return withClient(databasePath, async (prisma) => {
    const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
    return rows.map(row => row.name).sort();
  });
}

export async function indexNames(databasePath, table) {
  return withClient(databasePath, async (prisma) => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table}' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    return rows.map(row => row.name);
  });
}

export async function foreignKeyList(databasePath, table) {
  return withClient(databasePath, async (prisma) => {
    const rows = await prisma.$queryRawUnsafe(`PRAGMA foreign_key_list("${table}")`);
    return rows
      .map(row => ({ table: row.table, from: row.from, to: row.to, onDelete: row.on_delete }))
      .sort((left, right) => `${left.from}`.localeCompare(`${right.from}`));
  });
}

export async function healthChecks(databasePath) {
  return withClient(databasePath, async (prisma) => {
    const integrity = await prisma.$queryRawUnsafe('PRAGMA integrity_check');
    const foreignKeys = await prisma.$queryRawUnsafe('PRAGMA foreign_key_check');
    return {
      integrityCheck: integrity.map(row => row.integrity_check),
      foreignKeyCheck: foreignKeys,
    };
  });
}
