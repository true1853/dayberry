import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Без этого Next при нескольких lockfile'ах выбирает родительский каталог
  // как корень и раскладывает standalone по вложенному пути.
  outputFileTracingRoot: projectRoot,
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Оптимизация производительности
  compress: true,
  poweredByHeader: false,
  // Улучшенное кэширование
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // HTML и RSC-ответы не кэшируем. Статику из /public — исключаем из этого
      // правила: иначе на неё вешается второй Cache-Control, браузер склеивает
      // оба заголовка и no-store побеждает immutable (шрифты качались каждый заход).
      {
        source: '/:path((?!_next/static|fonts/|favicon|manifest|pwa-|uploads/).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      // Оптимизация для шрифтов
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:file(favicon.svg|manifest.webmanifest|pwa-192x192.svg)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
