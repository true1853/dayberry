export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/callback/'],
    },
    sitemap: 'https://dayberry.ru/sitemap.xml',
    host: 'https://dayberry.ru',
  };
}
