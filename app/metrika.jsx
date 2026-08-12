'use client';

// app/metrika.jsx — Яндекс.Метрика.
//
// Три вещи, из-за которых нельзя просто вставить сниппет из справки:
//
// 1. Приложение — SPA на хэш-роутере. Без ручной отправки переходов Метрика
//    увидит по одному просмотру на человека и решит, что все смотрят одну
//    страницу.
// 2. Вебвизор пишет то, что происходит на экране, а у нас там личная
//    переписка и поля входа. Элементы с этим содержимым помечены классом
//    ym-hide-content, ввод — ym-disable-keys (см. screen-chat, screen-auth).
// 3. Локальные прогоны и стенды не должны попадать в статистику, поэтому
//    счётчик включается только на боевом домене.
import React from 'react';

const COUNTER_ID = 111543083;
const HOST_RE = /(^|\.)dayberry\.ru$/i;

export default function Metrika() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!HOST_RE.test(window.location.hostname)) return undefined;

    window.ym = window.ym || function ym(...args) { (window.ym.a = window.ym.a || []).push(args); };
    window.ym.l = Date.now();

    const src = 'https://mc.yandex.ru/metrika/tag.js?id=' + COUNTER_ID;
    if (![...document.scripts].some(s => s.src === src)) {
      const el = document.createElement('script');
      el.async = true;
      el.src = src;
      document.head.appendChild(el);
    }

    window.ym(COUNTER_ID, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: window.location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });

    // Переход между экранами приложения — это просмотр страницы. Referer
    // ставим руками, иначе в отчётах все переходы будут «прямыми».
    let prev = window.location.href;
    const onHash = () => {
      const url = window.location.href;
      if (url === prev) return;
      window.ym(COUNTER_ID, 'hit', url, { referer: prev });
      prev = url;
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <noscript>
      <div>
        <img src={`https://mc.yandex.ru/watch/${COUNTER_ID}`} style={{ position: 'absolute', left: '-9999px' }} alt="" />
      </div>
    </noscript>
  );
}

/**
 * Достижение цели. Вызывается из мест, где происходит то, ради чего сервис
 * существует: регистрация, размещение объявления, открытие и закрытие сделки.
 * Без этого в Метрике видно только «ходили по страницам».
 */
export function trackGoal(goal, params) {
  if (typeof window === 'undefined' || typeof window.ym !== 'function') return;
  if (!HOST_RE.test(window.location.hostname)) return;
  try {
    window.ym(COUNTER_ID, 'reachGoal', goal, params);
  } catch (e) {
    // счётчик не должен ломать приложение
  }
}
