import React from 'react';
import './globals.css';
import '../src/design.css';
import '../src/web.css';

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
  themeColor: '#ff385c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, height: '100%', overflow: 'hidden', background: '#ffffff' }}>
        {children}
      </body>
    </html>
  );
}
