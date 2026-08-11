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
  // Без курсора: конвертированные строки сами выпадают из фильтра, поэтому
  // каждая итерация забирает следующую порцию необработанных. Курсорная
  // пагинация здесь давала пропуски — она опиралась на id уже обновлённой
  // строки, которой в отфильтрованной выборке больше нет.
  const failed = new Set();
  let scanned = 0;
  let converted = 0;

  for (;;) {
    const rows = await model.findMany({
      where: failed.size ? { AND: [where, { id: { notIn: [...failed] } }] } : where,
      select: { id: true, [field]: true },
      take: BATCH,
    });
    if (!rows.length) break;
    scanned += rows.length;

    for (const row of rows) {
      const value = row[field];
      // строка не конвертировалась — исключаем явно, иначе цикл не завершится
      if (!isDataUrl(value)) { failed.add(row.id); continue; }
      try {
        const url = await saveDataUrl(value);
        if (!url) { failed.add(row.id); continue; }
        await model.update({ where: { id: row.id }, data: { [field]: url } });
        freedBytes += value.length;
        converted++;
      } catch (e) {
        failed.add(row.id);
        console.error(`  ! ${label} ${row.id}: ${e.message}`);
      }
    }
    process.stdout.write(`  ${label}: просмотрено ${scanned}, перенесено ${converted}\r`);
  }

  console.log(`  ${label}: просмотрено ${scanned}, перенесено ${converted}${failed.size ? `, пропущено ${failed.size}` : ''}          `);
  return { converted, failed: failed.size };
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
