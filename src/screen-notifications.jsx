// screen-notifications.jsx — колокольчик и лента уведомлений.
//
// Лента в приложении — единственный канал доставки на сегодня. Внешние
// каналы (web-push, письма, бот) подключаются на стороне lib/notify.js:
// запись в Notification остаётся источником правды в любом случае.
import React from 'react';
import { Icon } from './icons.jsx';
import { Sheet } from './ui.jsx';
import { timeAgo } from './ui.jsx';

const TONE = {
  chain_invite: { icon: 'chain', color: 'var(--berry)', bg: 'var(--berry-50)' },
  chain_last_call: { icon: 'clock', color: 'var(--berry)', bg: 'var(--berry-50)' },
  chain_progress: { icon: 'check', color: 'var(--ok)', bg: 'var(--ok-soft)' },
  chain_replaced: { icon: 'chain', color: 'var(--berry)', bg: 'var(--berry-50)' },
  chain_active: { icon: 'checkCircle', color: 'var(--ok)', bg: 'var(--ok-soft)' },
  chain_done: { icon: 'checkCircle', color: 'var(--ok)', bg: 'var(--ok-soft)' },
  chain_failed: { icon: 'info', color: 'var(--ink-2)', bg: 'var(--line-2)' },
  chain_expired: { icon: 'clock', color: 'var(--ink-2)', bg: 'var(--line-2)' },
  message: { icon: 'chat', color: 'var(--berry)', bg: 'var(--berry-50)' },
  deal_offer: { icon: 'swap', color: 'var(--berry)', bg: 'var(--berry-50)' },
  deal_confirm: { icon: 'checkCircle', color: 'var(--berry)', bg: 'var(--berry-50)' },
  deal_done: { icon: 'checkCircle', color: 'var(--ok)', bg: 'var(--ok-soft)' },
  deal_cancelled: { icon: 'info', color: 'var(--ink-2)', bg: 'var(--line-2)' },
  deal_refund: { icon: 'wallet', color: 'var(--ok)', bg: 'var(--ok-soft)' },
  review: { icon: 'star', color: '#f5a623', bg: '#fff7e6' },
};

// Куда ведёт уведомление. Пустая строка — открывать нечего, строка кликом
// не притворяется.
const OPENABLE = new Set(['chain', 'chat', 'deal', 'wallet', 'profile']);

const toneOf = (type) => TONE[type] || { icon: 'bell', color: 'var(--ink-2)', bg: 'var(--line-2)' };

export function NotificationsSheet({ open, onClose, items = [], onOpenEntity }) {
  return (
    <Sheet open={open} onClose={onClose} title="Уведомления">
      <div className="col" style={{ padding: '0 18px 24px' }}>
        {!items.length && (
          <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, padding: '28px 10px' }}>
            <div className="avatar" style={{ width: 52, height: 52, background: 'var(--line-2)' }}><Icon name="bell" size={24} color="var(--ink-3)" /></div>
            <span className="title" style={{ fontSize: 15 }}>Пока пусто</span>
            <span className="sub">Здесь появятся приглашения в цепочки и новости по сделкам.</span>
          </div>
        )}
        {items.map(n => {
          const tone = toneOf(n.type);
          const clickable = OPENABLE.has(n.entityType) && (!!n.entityId || n.entityType === 'wallet' || n.entityType === 'profile');
          return (
            <div
              key={n.id}
              className="row gap12"
              style={{
                padding: '12px 0', alignItems: 'flex-start',
                borderBottom: '1px solid var(--line-2)',
                cursor: clickable ? 'pointer' : 'default',
                opacity: n.read ? 0.65 : 1,
              }}
              onClick={() => clickable && onOpenEntity(n)}
            >
              <div className="avatar" style={{ width: 36, height: 36, background: tone.bg, flex: 'none' }}>
                <Icon name={tone.icon} size={18} color={tone.color} />
              </div>
              <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                <span className="title" style={{ fontSize: 14 }}>{n.title}</span>
                {n.body && <span className="sub" style={{ lineHeight: 1.45 }}>{n.body}</span>}
                <span className="cap">{timeAgo(n.t)}</span>
              </div>
              {!n.read && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--berry)', flex: 'none', marginTop: 6 }} />}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
