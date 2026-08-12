// pwa.jsx — установка на главный экран, сервис-воркер и push.
//
// Всё, что касается «приложения на телефоне», собрано здесь: регистрация
// воркера, подписка на push и предложение установить. Разрешение на
// уведомления спрашиваем не при загрузке — в этот момент человек ещё не
// понимает, зачем оно, и жмёт «нет» навсегда.
import React from 'react';
import { Icon } from './icons.jsx';
import { pushConfigAction, savePushSubscriptionAction, deletePushSubscriptionAction } from './server/actions.js';

const DISMISSED_KEY = 'dayberry_install_dismissed';

export const isStandalone = () =>
  typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined'
  && /iphone|ipad|ipod/i.test(navigator.userAgent)
  && !window.MSStream;

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const go = () => navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[pwa] sw failed', e.message));
  // Приложение монтируется уже после load, поэтому ждать это событие нельзя:
  // подписка на него в этот момент не сработает никогда.
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

/**
 * Подписывает браузер на push. Возвращает {ok} либо причину отказа —
 * её показываем человеку: «включите уведомления в настройках браузера»
 * куда полезнее молчаливого выключателя, который не включается.
 */
export async function enablePush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'Браузер не умеет push-уведомления' };
  }
  const cfg = await pushConfigAction();
  if (!cfg?.enabled) return { ok: false, error: 'Push пока не настроен на сервере' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Уведомления запрещены — включите их для сайта в настройках браузера' };
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
  });
  const res = await savePushSubscriptionAction(sub.toJSON());
  return res?.ok ? { ok: true } : { ok: false, error: res?.error || 'Не удалось сохранить подписку' };
}

export async function disablePush() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await deletePushSubscriptionAction(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function pushState() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { supported: false, subscribed: false };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, permission: Notification.permission, subscribed: !!sub };
}

// ---------------------------------------------------------------------------
// предложение установить
// ---------------------------------------------------------------------------

export function useInstallPrompt() {
  const [deferred, setDeferred] = React.useState(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(DISMISSED_KEY) === '1'; } catch (e) { /* private mode */ }
    if (dismissed || isStandalone()) return undefined;

    // Chrome/Android: перехватываем системное предложение, чтобы показать
    // своё в понятный момент, а не поверх первого экрана.
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setVisible(true); };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS системного предложения не даёт вовсе — там объясняем словами.
    const t = isIOS() ? setTimeout(() => setVisible(true), 4000) : null;

    const onInstalled = () => { setVisible(false); setDeferred(null); };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { window.localStorage.setItem(DISMISSED_KEY, '1'); } catch (e) { /* private mode */ }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) { /* закрыл */ }
    setDeferred(null);
    setVisible(false);
  };

  return { visible, install, dismiss, canPrompt: !!deferred, ios: isIOS() };
}

export function InstallBanner({ visible, install, dismiss, canPrompt, ios }) {
  if (!visible) return null;
  return (
    <div className="install-banner">
      <div className="row gap12" style={{ alignItems: 'flex-start' }}>
        <img src="/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 12, flex: 'none' }} />
        <div className="col gap4 grow" style={{ minWidth: 0 }}>
          <span className="title" style={{ fontSize: 14.5 }}>Дайбери на главный экран</span>
          <span className="cap" style={{ lineHeight: 1.45 }}>
            {canPrompt
              ? 'Откроется как приложение, без адресной строки, и будет присылать уведомления об обменах.'
              : 'Нажмите «Поделиться» внизу браузера и выберите «На экран „Домой“».'}
          </span>
        </div>
        <button
          aria-label="Закрыть"
          onClick={dismiss}
          style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', flex: 'none' }}
        >
          <Icon name="close" size={18} color="var(--ink-3)" />
        </button>
      </div>
      {canPrompt && (
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={install}>
          <Icon name="plusCircle" size={18} color="#fff" />Установить
        </button>
      )}
    </div>
  );
}
