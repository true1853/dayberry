// lib/notify.js — единая точка создания уведомлений.
//
// Сейчас доставка одна — лента в приложении (колокольчик). Внешние каналы
// (web-push, email, бот) подключаются здесь же: запись в Notification
// остаётся источником правды, а канал — способом дотянуться.
import { prisma } from './prisma.js';
import { sendPush } from './push.js';

const MAX_TITLE = 120;
const MAX_BODY = 400;

const cut = (s, n) => {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * @param {object|object[]} input — {userId, type, title, body, entityType, entityId}
 */
export async function notify(input) {
  const rows = (Array.isArray(input) ? input : [input])
    .filter(n => n && n.userId && n.title)
    .map(n => ({
      userId: n.userId,
      type: n.type || 'system',
      title: cut(n.title, MAX_TITLE),
      body: cut(n.body, MAX_BODY),
      entityType: n.entityType || '',
      entityId: n.entityId || '',
    }));
  if (!rows.length) return 0;

  // Уведомление не должно ронять действие, которое его породило: человек
  // согласился на цепочку — согласие важнее, чем строчка в колокольчике.
  try {
    const res = await prisma.notification.createMany({ data: rows });
    // Push — вторая доставка того же самого. Ошибка здесь тоже не должна
    // ничего ронять, поэтому ждём и глотаем отдельно.
    try { await sendPush(rows); } catch (e) { console.warn('[notify] push failed:', e.message); }
    return res.count;
  } catch (e) {
    console.warn('[notify] failed:', e.message);
    return 0;
  }
}

export function serializeNotification(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    read: !!n.readAt,
    t: n.createdAt.toISOString(),
  };
}
