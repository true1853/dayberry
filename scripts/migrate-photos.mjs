// scripts/migrate-photos.mjs — разовый перенос base64-картинок из БД на диск.
//
//   DATABASE_URL="file:/app/data/dayberry.db" node scripts/migrate-photos.mjs
//
// Идемпотентен: строки, уже переведённые на /uploads/..., пропускаются,
// так что скрипт можно запускать повторно и добивать остатки.
// Работает батчами — data-URL'ы весят мегабайты, читать всю таблицу разом нельзя.
import { PrismaClient } from '@prisma/client';
import { saveDataUrl, UPLOAD_DIR } from '../lib/storage.js';

const prisma = new PrismaClient();
const BATCH = 20;
const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/');

let freedBytes = 0;

async function migrateTable({ label, model, field, where }) {
  let cursor = null;
  let scanned = 0;
  let converted = 0;
  let failed = 0;

  for (;;) {
    const rows = await model.findMany({
      where,
      select: { id: true, [field]: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    for (const row of rows) {
      const value = row[field];
      if (!isDataUrl(value)) continue;
      try {
        const url = await saveDataUrl(value);
        if (!url) { failed++; continue; }
        await model.update({ where: { id: row.id }, data: { [field]: url } });
        freedBytes += value.length;
        converted++;
      } catch (e) {
        failed++;
        console.error(`  ! ${label} ${row.id}: ${e.message}`);
      }
    }
    process.stdout.write(`  ${label}: просмотрено ${scanned}, перенесено ${converted}\r`);
  }

  console.log(`  ${label}: просмотрено ${scanned}, перенесено ${converted}${failed ? `, ошибок ${failed}` : ''}          `);
  return { converted, failed };
}

async function main() {
  console.log(`Каталог загрузок: ${UPLOAD_DIR}\n`);

  const results = [];
  results.push(await migrateTable({
    label: 'Lot.photoUrl', model: prisma.lot, field: 'photoUrl',
    where: { photoUrl: { startsWith: 'data:image/' } },
  }));
  results.push(await migrateTable({
    label: 'LotPhoto.url', model: prisma.lotPhoto, field: 'url',
    where: { url: { startsWith: 'data:image/' } },
  }));
  results.push(await migrateTable({
    label: 'User.avatar', model: prisma.user, field: 'avatar',
    where: { avatar: { startsWith: 'data:image/' } },
  }));

  const converted = results.reduce((n, r) => n + r.converted, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  console.log(`\nПеренесено записей: ${converted}${failed ? `, не удалось: ${failed}` : ''}`);
  console.log(`Выгружено из БД: ~${(freedBytes / 1024 / 1024).toFixed(1)} МБ base64`);
  if (converted) {
    console.log('\nЧтобы файл БД реально уменьшился, выполните VACUUM:');
    console.log('  sqlite3 /app/data/dayberry.db "VACUUM;"');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
