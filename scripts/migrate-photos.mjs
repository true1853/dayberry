// scripts/migrate-photos.mjs — разовый перенос base64-картинок из БД на диск.
//
//   DATABASE_URL="file:/app/data/dayberry.db" node scripts/migrate-photos.mjs
//
// Идемпотентен: строки, уже переведённые на /uploads/..., пропускаются,
// так что скрипт можно запускать повторно и добивать остатки.
// Работает батчами — data-URL'ы весят мегабайты, читать всю таблицу разом нельзя.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { saveDataUrl, saveImage, UPLOAD_DIR, UPLOAD_PREFIX } from '../lib/storage.js';

const prisma = new PrismaClient();
const BATCH = 20;
const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/');
// файлы, сохранённые до перехода на WebP
const isLegacyFile = (v) => typeof v === 'string' && v.startsWith(UPLOAD_PREFIX) && !v.endsWith('.webp');

let freedBytes = 0;

async function migrateTable({ label, model, field, where, accept, convert }) {
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
      if (!accept(value)) { failed.add(row.id); continue; }
      try {
        const url = await convert(value);
        if (!url || url === value) { failed.add(row.id); continue; }
        await model.update({ where: { id: row.id }, data: { [field]: url } });
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

// Перекодирует уже лежащий на диске файл в WebP и создаёт превью.
async function recodeLegacy(url, opts) {
  const name = url.slice(UPLOAD_PREFIX.length);
  const bytes = await readFile(path.join(UPLOAD_DIR, name));
  freedBytes += bytes.length;
  return saveImage(bytes, opts);
}

const TARGETS = [
  { label: 'Lot.photoUrl', model: prisma.lot, field: 'photoUrl' },
  { label: 'LotPhoto.url', model: prisma.lotPhoto, field: 'url' },
  { label: 'User.avatar', model: prisma.user, field: 'avatar', opts: { max: 256, thumb: false } },
];

async function main() {
  console.log(`Каталог загрузок: ${UPLOAD_DIR}\n`);

  const results = [];

  console.log('base64 из БД -> файлы:');
  for (const t of TARGETS) {
    results.push(await migrateTable({
      ...t,
      where: { [t.field]: { startsWith: 'data:image/' } },
      accept: isDataUrl,
      convert: (v) => { freedBytes += v.length; return saveDataUrl(v, t.opts); },
    }));
  }

  console.log('\nстарые JPEG/PNG -> WebP + превью:');
  for (const t of TARGETS) {
    results.push(await migrateTable({
      ...t,
      where: { AND: [{ [t.field]: { startsWith: UPLOAD_PREFIX } }, { NOT: { [t.field]: { endsWith: '.webp' } } }] },
      accept: isLegacyFile,
      convert: (v) => recodeLegacy(v, t.opts),
    }));
  }

  const converted = results.reduce((n, r) => n + r.converted, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  console.log(`\nОбработано записей: ${converted}${failed ? `, пропущено: ${failed}` : ''}`);
  console.log(`Исходных данных заменено: ~${(freedBytes / 1024 / 1024).toFixed(1)} МБ`);

  if (converted && !failed) await removeOrphans();
}

// Подчищает файлы, на которые больше никто не ссылается: после перекодировки
// исходные JPEG/PNG остаются на диске мёртвым грузом. Трогаем только их —
// всё, что не .webp и не встречается в БД.
async function removeOrphans() {
  const { readdir, unlink, stat } = await import('node:fs/promises');
  const referenced = new Set();
  for (const t of TARGETS) {
    const rows = await t.model.findMany({
      where: { [t.field]: { startsWith: UPLOAD_PREFIX } },
      select: { [t.field]: true },
    });
    for (const r of rows) referenced.add(r[t.field].slice(UPLOAD_PREFIX.length));
  }

  let removed = 0;
  let bytes = 0;
  for (const name of await readdir(UPLOAD_DIR)) {
    if (name.endsWith('.webp') || referenced.has(name)) continue;
    const full = path.join(UPLOAD_DIR, name);
    try {
      bytes += (await stat(full)).size;
      await unlink(full);
      removed++;
    } catch (e) {
      console.warn(`  ! не удалось удалить ${name}: ${e.message}`);
    }
  }
  if (removed) console.log(`Удалено осиротевших файлов: ${removed} (${(bytes / 1024 / 1024).toFixed(1)} МБ)`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
