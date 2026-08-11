// lib/storage.js — server-only: фото на диск вместо base64 в БД.
//
// Раньше картинки лежали в SQLite как data:image/... строки и уезжали
// клиенту внутри каждого ответа server action — по несколько мегабайт,
// без возможности кэширования. Теперь в БД хранится путь вида
// /uploads/<sha256>.jpg, а байты отдаёт роут app/uploads/[file] с
// immutable-кэшем: браузер качает каждое фото ровно один раз.
//
// Имя файла — контентный хэш, поэтому одинаковые картинки не дублируются,
// а URL можно кэшировать вечно: содержимое по этому адресу не меняется.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

// В контейнере cwd = /app, а /app/data — том dayberry-data (там же лежит БД),
// поэтому загруженные файлы переживают пересборку образа.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
export const UPLOAD_PREFIX = '/uploads/';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const FILENAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/;

export const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const DATA_URL_RE = /^data:(image\/[a-z+]+);base64,(.+)$/i;

let dirReady = null;
function ensureDir() {
  if (!dirReady) dirReady = mkdir(UPLOAD_DIR, { recursive: true });
  return dirReady;
}

const exists = (p) => access(p).then(() => true, () => false);

/**
 * Кладёт data-URL на диск и возвращает публичный путь.
 * Уже сохранённые пути (/uploads/...) и http(s)-ссылки пропускает как есть,
 * чтобы редактирование лота не теряло существующие фото.
 * Возвращает '' для всего, что не является картинкой.
 */
export async function saveDataUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith(UPLOAD_PREFIX) || /^https?:\/\//i.test(value)) return value;

  const m = DATA_URL_RE.exec(value);
  if (!m) return '';
  const ext = EXT_BY_MIME[m[1].toLowerCase()];
  if (!ext) return '';

  let bytes;
  try {
    bytes = Buffer.from(m[2], 'base64');
  } catch {
    return '';
  }
  if (!bytes.length) return '';

  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
  const dest = path.join(UPLOAD_DIR, name);

  await ensureDir();
  // Контентный хэш: если файл уже есть, он побайтово тот же — не переписываем.
  if (!(await exists(dest))) {
    await writeFile(dest, bytes);
  }
  return UPLOAD_PREFIX + name;
}

/** Сохраняет список картинок, отбрасывая пустые результаты. Порядок сохраняется. */
export async function saveDataUrls(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const saved = await Promise.all(values.map(saveDataUrl));
  return saved.filter(Boolean);
}

/** true для значений, которые saveDataUrl умеет принять. */
export function isStorableImage(value) {
  return typeof value === 'string'
    && (value.startsWith('data:image/') || value.startsWith(UPLOAD_PREFIX));
}
