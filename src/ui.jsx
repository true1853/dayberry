// ui.jsx — shared presentational components
import React from 'react';
import { CAT } from './data.js';
import { Icon } from './icons.jsx';

export const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');

// ---- credit coin mark ----
export function Coin({ size = 16 }) {
  return (
    <span className="coin" style={{ width: size, height: size, fontSize: size * 0.62 }}>Б</span>
  );
}

// ---- brand logo ----
// Знак уже фирменного цвета, поэтому подложки под ним нет: на фиолетовом
// градиенте, каким был старый бейдж «ДБ», он бы просто не читался.
export function Logo({ size = 40 }) {
  return (
    <img
      src="/logo.png"
      alt="Дайбери"
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block', flex: 'none', objectFit: 'contain' }}
    />
  );
}
// amount with coin: <Credit n={48000} />
export function Credit({ n, size = 15, weight = 700, coin = 14, color, gap = 5, sign = false }) {
  const s = sign && n > 0 ? '+' : '';
  return (
    <span className="row" style={{ gap, color }}>
      <Coin size={coin} />
      <span className="amount" style={{ fontSize: size, fontWeight: weight }}>{s}{fmt(n)}</span>
    </span>
  );
}

// Превью лежит рядом с полной версией под именем <hash>.sm.webp — чистое
// преобразование имени, без обращений к серверу. Легаси-пути (.jpg/.png)
// остаются как есть: превью для них не создавалось.
export function thumbUrl(url) {
  if (typeof url !== 'string' || !url.endsWith('.webp') || url.endsWith('.sm.webp')) return url;
  return url.slice(0, -'.webp'.length) + '.sm.webp';
}

// ---- photo placeholder or real image ----
// По умолчанию показывается превью: почти везде картинка рендерится мелко
// (сетки, аватарки лотов, строки сделок). full нужен галерее и свайпу.
export function Photo({ label, url, cat = 'gadget', style, rounded = 0, badge, children, full = false }) {
  const c = CAT[cat] || CAT.gadget;
  const src = full ? url : thumbUrl(url);
  if (url) {
    return (
      <div className="photo" style={{ background: c.soft, borderRadius: rounded, ...style, overflow: 'hidden', position: 'relative' }}>
        <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
        {badge}
        {children}
      </div>
    );
  }
  return (
    <div className="photo" style={{ background: c.soft, borderRadius: rounded, ...style }}>
      <div className="photo-label" style={{ color: c.color, opacity: 0.7 }}>{'// ' + label}</div>
      {badge}
      {children}
    </div>
  );
}

// ---- avatar ----
export function Avatar({ user, size = 40, url = '' }) {
  const initials = (user || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      {url ? (
        <div className="avatar" style={{ width: size, height: size, overflow: 'hidden' }}>
          <img src={url} alt="" width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" decoding="async" />
        </div>
      ) : (
        <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initials}</div>
      )}
    </div>
  );
}

// count — сколько отзывов получено. Ноль отзывов и оценка 0 — разные вещи:
// новичок не должен выглядеть как человек с плохой репутацией.
export function Stars({ value, size = 12, count, showValue = false }) {
  if (count === 0) {
    return <span className="cap" style={{ fontSize: size }}>нет оценок</span>;
  }
  return (
    <span className="row gap4">
      <span className="stars">{[0,1,2,3,4].map(i => <Icon key={i} name="star" size={size} color={i < Math.round(value) ? '#F5A623' : 'var(--line)'} />)}</span>
      {showValue && value > 0 && (
        <span className="cap" style={{ fontSize: size }}>
          {value.toFixed(1)}{count ? ` · ${count}` : ''}
        </span>
      )}
    </span>
  );
}

export function CatTag({ cat }) {
  const c = CAT[cat] || CAT.gadget;
  return <span className="tag" style={{ background: c.soft, color: c.color }}>{c.label}</span>;
}

// ---- AI badge / pill ----
export function AIBadge({ children = 'AI', tone = 'berry' }) {
  const map = {
    berry: { bg: 'var(--berry-50)', fg: 'var(--berry)' },
    ink: { bg: '#f2eef0', fg: 'var(--ink)' },
  };
  const s = map[tone];
  return (
    <span className="tag" style={{ background: s.bg, color: s.fg }}>
      <Icon name="ai" size={12} color={s.fg} />{children}
    </span>
  );
}

// ---- lot card (feed) ----
export function LotCard({ lot, onClick, compact, fav = false, onToggleFav }) {
  const ownerCity = lot.ownerCity || '';
  return (
    <div className="card" style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={onClick}>
      <div style={{ position: 'relative' }}>
        <Photo label={lot.photo} url={lot.photoUrl} cat={lot.cat} style={{ aspectRatio: compact ? '1/1' : '4/3' }} />
        <div className="row gap6" style={{ position: 'absolute', top: 10, left: 10 }}>
          {lot.hot && <span className="tag" style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--berry)', backdropFilter: 'blur(6px)' }}><Icon name="flame" size={12} color="var(--berry)" />Хит</span>}
        </div>
        {onToggleFav && (
          <button
            aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={fav}
            className="row"
            style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.92)', justifyContent: 'center', boxShadow: 'var(--sh-1)', cursor: 'pointer', transition: 'transform .15s' }}
            onClick={(e) => { e.stopPropagation(); onToggleFav(lot); }}
          >
            <Icon name="heart" size={18} color={fav ? 'var(--berry)' : 'var(--ink-2)'} fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}
        <span className="row gap4" style={{ position: 'absolute', bottom: 8, right: 8, padding: '3px 7px', borderRadius: 8, background: 'rgba(28,12,18,0.55)', color: '#fff', fontSize: 11, fontWeight: 600, backdropFilter: 'blur(4px)' }}>
          <Icon name="camera" size={12} color="#fff" />{lot.photos}
        </span>
      </div>
      <div className="col gap8" style={{ padding: '11px 13px 13px' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <Credit n={lot.value} size={17} coin={16} />
          <span className="cap row gap4"><Icon name="eye" size={13} color="var(--ink-3)" />{lot.views}</span>
        </div>
        <div className="title clamp2" style={{ minHeight: 38 }}>{lot.title}</div>
        <div className="row gap6" style={{ justifyContent: 'space-between' }}>
          <div className="row gap6" style={{ minWidth: 0 }}>
            <Avatar user={lot.ownerName} url={lot.ownerAvatar} size={20} />
            <span className="cap ellipsis">{lot.ownerCity || ''}</span>
          </div>
          <span className="cap">{lot.posted}</span>
        </div>
      </div>
    </div>
  );
}

// ---- top app bar ----
export function AppBar({ title, sub, left, right, big }) {
  return (
    <div className="appbar">
      {left}
      <div className="grow col" style={{ gap: 1 }}>
        {sub && <span className="over">{sub}</span>}
        <span className={big ? 'h1' : 'h2'}>{title}</span>
      </div>
      {right}
    </div>
  );
}

export function IconBtn({ name, onClick, badge, color = 'var(--ink)', bg = '#fff', fill = 'none' }) {
  return (
    <button className="row" onClick={onClick} style={{ position: 'relative', width: 42, height: 42, borderRadius: 13, border: '1px solid var(--line)', background: bg, justifyContent: 'center', flex: 'none', cursor: 'pointer', boxShadow: 'var(--sh-1)' }}>
      <Icon name={name} size={21} color={color} fill={fill} />
      {badge ? <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--berry)', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)' }}>{badge}</span> : null}
    </button>
  );
}

// ---- bottom tab bar ----
export function TabBar({ tab, setTab, unread }) {
  const items = [
    { id: 'favorites', icon: 'heart',  label: 'Избранное' },
    { id: 'mylots',    icon: 'grid',   label: 'Объявления' },
    { id: 'search',    icon: 'search', label: 'Поиск' },
    { id: 'deals',     icon: 'chat',   label: 'Сообщения', badge: unread },
    { id: 'profile',   icon: 'user',   label: 'Профиль' },
  ];
  return (
    <div className="tabbar">
      {items.map(it => (
        <div key={it.id} className={'tab' + (tab === it.id ? ' is-on' : '')} onClick={() => setTab(it.id)}>
          <div style={{ position: 'relative' }}>
            <Icon name={it.icon} size={24} color={tab === it.id ? 'var(--berry)' : 'var(--ink-3)'} fill={tab === it.id && it.icon === 'heart' ? 'currentColor' : 'none'} />
            {it.badge ? <span style={{ position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--berry)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.badge}</span> : null}
          </div>
          <span className="tab-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---- bottom sheet ----
export function Sheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {title && <div className="px row" style={{ justifyContent: 'space-between', padding: '6px 18px 10px' }}>
          <span className="h3">{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--line-2)', width: 30, height: 30, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="close" size={16} color="var(--ink-2)" /></button>
        </div>}
        <div style={{ overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
