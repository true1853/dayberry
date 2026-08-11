/** @type {import('next').NextConfig} */
const nextConfig = {
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
      {
        source: '/:path((?!_next/static).*)',
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
    ];
  },
  // Оптимизация webpack
  webpack: (config) => {
    // Уменьшаем размер бандла в production
    if (process.env.NODE_ENV === 'production') {
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
      };
    }
    return config;
  },
};

export default nextConfig;
