import React from 'react';
import './globals.css';
import '../src/design.css';
import '../src/web.css';

export const metadata = {
  title: 'Дайбери',
  description: 'Обмен без денег — бартер-кредиты, эскроу и честные обмены',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Дайбери',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4B2BC9',
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
