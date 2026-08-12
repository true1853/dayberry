// lib/push.js — доставка уведомлений на телефон через web-push.
//
// Запись в Notification остаётся источником правды: колокольчик внутри
// приложения работает всегда, а push — способ дотянуться до человека,
// который сейчас в приложение не смотрит. Поэтому сбой отправки никогда
// не должен ронять действие, которое её породило.
import webpush from 'web-push';
import { prisma } from './prisma.js';

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@dayberry.ru';

let ready = false;
function configure() {
  if (ready || !PUBLIC || !PRIVATE) return ready;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  ready = true;
  return true;
}

export const pushEnabled = () => !!(PUBLIC && PRIVATE);
export const pushPublicKey = () => PUBLIC;

// Куда ведёт уведомление: те же адреса, что и у колокольчика внутри.
export function urlFor(n) {
  const id = encodeURIComponent(n.entityId || '');
  switch (n.entityType) {
    case 'chat': return `/#/chat/${id}`;
    case 'deal': return `/#/deal/${id}`;
    case 'chain': return `/#/chain/${id}`;
    case 'wallet': return '/#/wallet';
    case 'profile': return '/#/profile';
    default: return '/';
  }
}

/**
 * Рассылает push по списку уведомлений (в том виде, в каком их принял notify).
 * Уважает выключатель «Push-уведомления» в настройках и сам удаляет
 * подписки, от которых браузер отказался.
 */
export async function sendPush(rows) {
  if (!rows.length || !configure()) return 0;

  const userIds = [...new Set(rows.map(r => r.userId))];
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, user: { notifyPush: true } },
  });
  if (!subs.length) return 0;

  const byUser = new Map();
  for (const s of subs) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId).push(s);
  }

  const dead = [];
  let sent = 0;
  await Promise.all(rows.flatMap(row => (byUser.get(row.userId) || []).map(async (sub) => {
    const payload = JSON.stringify({
      title: row.title,
      body: row.body || '',
      url: urlFor(row),
      tag: `${row.type}:${row.entityId || ''}`,
    });
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      // 404/410 — подписка мертва: человек снёс приложение или отозвал
      // разрешение. Держать её дальше незачем.
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(sub.endpoint);
      else console.warn('[push] failed:', e.statusCode || e.message);
    }
  })));

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }).catch(() => {});
  }
  return sent;
}
