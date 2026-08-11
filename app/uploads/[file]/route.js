// Раздача загруженных фото из тома /app/data/uploads.
// public/ не подходит: файлы появляются в рантайме, а образ пересобирается.
//
// Имя файла — контентный хэш, поэтому ответ можно кэшировать навсегда:
// изменение фото даёт новое имя и новый URL.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { UPLOAD_DIR, FILENAME_RE, MIME_BY_EXT } from '../../../lib/storage';

// Файлы появляются в рантайме — ничего не прекомпилируем.
// Кэширование обеспечивают заголовки ответа, а не кэш Next.
export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const { file } = await params;

  // Строгий whitelist по формату имени: заодно закрывает path traversal —
  // ни '..', ни слэши через regexp не проходят.
  if (!FILENAME_RE.test(file)) {
    return new Response('Not found', { status: 404 });
  }

  const full = path.join(UPLOAD_DIR, file);
  let info;
  try {
    info = await stat(full);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!info.isFile()) return new Response('Not found', { status: 404 });

  const ext = file.slice(file.lastIndexOf('.') + 1);
  return new Response(Readable.toWeb(createReadStream(full)), {
    headers: {
      'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
      'Content-Length': String(info.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${file}"`,
    },
  });
}
