import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

function createClient() {
  const client = new PrismaClient();

  // SQLite по умолчанию в rollback journal: любая запись блокирует читателей,
  // и при живом трафике это выражается в подвисающих запросах. WAL позволяет
  // читать параллельно с записью. busy_timeout убирает мгновенные
  // SQLITE_BUSY на конкурентной записи — вместо ошибки запрос подождёт.
  // Через queryRaw, а не executeRaw: journal_mode и busy_timeout возвращают
  // строку с новым значением, а SQLite-коннектор Prisma не пропускает
  // результаты через execute.
  client.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
    .then(() => client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;'))
    .then(() => client.$queryRawUnsafe('PRAGMA synchronous = NORMAL;'))
    .catch((e) => console.warn('[db] не удалось применить PRAGMA:', e.message));

  return client;
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
