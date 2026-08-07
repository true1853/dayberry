import React from 'react';
import './globals.css';
import '../src/design.css';

export const metadata = {
  title: 'Дай бери',
  description: 'Обмен без денег — бартер-кредиты, эскроу и честные обмены',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Дай бери',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/pwa-192x192.svg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#c1124f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, height: '100%', overflow: 'hidden', background: '#faf7f8' }}>
        {children}
      </body>
    </html>
  );
}
