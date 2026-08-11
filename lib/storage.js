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
import sharp from 'sharp';

// В контейнере cwd = /app, а /app/data — том dayberry-data (там же лежит БД),
// поэтому загруженные файлы переживают пересборку образа.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
export const UPLOAD_PREFIX = '/uploads/';

// Всё, что приходит картинкой, приводится к WebP: на реальных фото это
// примерно вдвое меньше исходного JPEG при том же качестве.
const FULL_MAX = 1600;
const FULL_QUALITY = 78;
// Превью для ленты и мелких карточек. В сетке объявлений полноразмерное
// фото не нужно — превью весит на порядок меньше.
const THUMB_MAX = 640;
const THUMB_QUALITY = 72;
const THUMB_SUFFIX = '.sm';

// Имена: <hash>.webp и <hash>.sm.webp
export const FILENAME_RE = /^[a-f0-9]{32}(\.sm)?\.(webp|jpg|png|gif)$/;

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

/** Путь превью для сохранённой картинки — чистое преобразование имени. */
export function thumbPath(url) {
  if (typeof url !== 'string') return '';
  return url.endsWith('.webp') && !url.endsWith(THUMB_SUFFIX + '.webp')
    ? url.slice(0, -'.webp'.length) + THUMB_SUFFIX + '.webp'
    : url;
}

/**
 * Пережимает картинку в WebP и кладёт на диск вместе с превью.
 * Возвращает публичный путь к полной версии.
 *
 * Имя — хэш ИСХОДНЫХ байт, поэтому повторная загрузка того же файла не
 * плодит копии и не требует повторного кодирования.
 */
export async function saveImage(bytes, { max = FULL_MAX, quality = FULL_QUALITY, thumb = true } = {}) {
  if (!bytes || !bytes.length) return '';

  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const name = `${hash}.webp`;
  const dest = path.join(UPLOAD_DIR, name);
  const thumbDest = path.join(UPLOAD_DIR, `${hash}${THUMB_SUFFIX}.webp`);

  await ensureDir();

  // rotate() применяет EXIF-ориентацию, а заодно sharp выкидывает метаданные
  // (в том числе GPS из снимков телефона).
  const encode = (width, q) => sharp(bytes)
    .rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: q })
    .toBuffer();

  if (!(await exists(dest))) {
    await writeFile(dest, await encode(max, quality));
  }
  if (thumb && !(await exists(thumbDest))) {
    await writeFile(thumbDest, await encode(THUMB_MAX, THUMB_QUALITY));
  }
  return UPLOAD_PREFIX + name;
}

/**
 * Кладёт data-URL на диск и возвращает публичный путь.
 * Уже сохранённые пути (/uploads/...) и http(s)-ссылки пропускает как есть,
 * чтобы редактирование лота не теряло существующие фото.
 * Возвращает '' для всего, что не является картинкой.
 */
export async function saveDataUrl(value, opts) {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith(UPLOAD_PREFIX) || /^https?:\/\//i.test(value)) return value;

  const m = DATA_URL_RE.exec(value);
  if (!m) return '';

  let bytes;
  try {
    bytes = Buffer.from(m[2], 'base64');
  } catch {
    return '';
  }

  try {
    return await saveImage(bytes, opts);
  } catch (e) {
    console.warn('[storage] не удалось обработать картинку:', e.message);
    return '';
  }
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
