// screen-feed.jsx — home feed + discovery mechanics (list / swipe / chain)
import React from 'react';
import { CAT, CAT_IDS, catOf, normalizeCat } from './data.js';
import { Icon } from './icons.jsx';
import { AIBadge, Photo, Credit, LotCard, Sheet } from './ui.jsx';

// ---------- shared: category filter row ----------
export function CatRow({ active, setActive }) {
  const cats = [['all', 'Всё'], ...CAT_IDS.map(id => [id, CAT[id].label])];
  return (
    <div className="row gap8" style={{ overflowX: 'auto', padding: '2px 18px 4px', scrollbarWidth: 'none' }}>
      {cats.map(([id, label]) => (
        <div key={id} className={'chip chip-berry' + (active === id ? ' is-on' : '')} onClick={() => setActive(id)}>{label}</div>
      ))}
    </div>
  );
}

// ---------- "ready matches" carousel ----------
function MatchStrip({ onOpen, onChains, matches = [], lots = [], myLots = [] }) {
  return (
    <div className="col gap8" style={{ padding: '0 0 2px' }}>
      <div className="px row" style={{ justifyContent: 'space-between' }}>
        <span className="row gap6"><AIBadge>Умный мэтчинг</AIBadge></span>
        <span className="cap" onClick={onChains} style={{ color: 'var(--berry)', cursor: 'pointer' }}>Цепочки →</span>
      </div>
      <div className="row gap12" style={{ overflowX: 'auto', padding: '0 18px 4px', scrollbarWidth: 'none' }}>
        {matches.map(m => {
          const L = lots.find(x => x.id === m.lot);
          if (!L) return null;
          const mine = (m.myLot && myLots.find(x => x.id === m.myLot)) || myLots[0] || null;
          return (
            <div key={m.id} className="card" style={{ width: 196, flex: 'none', overflow: 'hidden', cursor: 'pointer' }} onClick={() => onOpen(L.id)}>
              <div className="row" style={{ alignItems: 'stretch', height: 74 }}>
                {mine ? (
                  <Photo label={mine.photo} url={mine.photoUrl} cat={mine.cat} style={{ flex: 1 }} />
                ) : (
                  <div className="col" style={{ flex: 1, background: 'var(--berry-50)', alignItems: 'center', justifyContent: 'center' }}><Icon name="swap" size={22} color="var(--berry)" /></div>
                )}
                <div className="col" style={{ justifyContent: 'center', alignItems: 'center', width: 34, background: 'var(--berry-50)' }}>
                  <Icon name="swap" size={18} color="var(--berry)" />
                </div>
                <Photo label={L.photo} url={L.photoUrl} cat={L.cat} style={{ flex: 1 }} />
              </div>
              <div className="col gap5" style={{ padding: '8px 10px 10px' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tag" style={{ background: 'var(--berry)', color: '#fff' }}>{m.score}% совпадение</span>
                  <span className="title clamp2" style={{ fontSize: 13 }} />
                </div>
                <div className="sub clamp2" style={{ minHeight: 32, fontSize: 12.5 }}>{m.why}</div>
                <div className="row gap6" style={{ justifyContent: 'space-between' }}>
                  <span className="cap">{m.dir === 'you-pay' ? 'Ваша доплата' : 'Вам доплатят'}</span>
                  <Credit n={m.topup} size={13} coin={13} color={m.dir === 'you-pay' ? 'var(--ink)' : 'var(--ok)'} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================
// VARIANT A — LIST / FEED
// ===========================================================
export function FeedList({ cat, onOpen, onChains, hints = true, limit, lots = [], matches = [], myLots = [], myLot = null, loading = false, favIds, onToggleFav, city = '' }) {
  let items = lots.filter(l => cat === 'all' || normalizeCat(l.cat) === cat);
  // «Рядом с вами» должно быть правдой: свой город наверх, порядок внутри
  // групп сохраняем — сортировку ленты задаёт сервер.
  if (city) {
    const near = items.filter(l => l.ownerCity === city);
    if (near.length && near.length < items.length) {
      items = [...near, ...items.filter(l => l.ownerCity !== city)];
    }
  }
  if (limit) items = items.slice(0, limit);
  const nearCount = city ? items.filter(l => l.ownerCity === city).length : 0;
  return (
    <div className="col gap16" style={{ paddingBottom: 20 }}>
      {hints && matches.length > 0 && <MatchStrip matches={matches} lots={lots} myLots={myLots} onOpen={onOpen} onChains={onChains} />}
      <div className="px col gap10">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="h3">{city && nearCount ? 'Рядом с вами' : 'Свежие объявления'}</span>
          {city ? <span className="cap row gap4"><Icon name="map" size={14} color="var(--ink-3)" />{city}</span> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {loading && !items.length
            ? Array.from({ length: 4 }, (_, i) => <LotCardSkeleton key={i} />)
            : items.map(l => <LotCard key={l.id} lot={l} compact onClick={() => onOpen(l.id)} fav={favIds ? favIds.has(l.id) : false} onToggleFav={onToggleFav} />)}
        </div>
      </div>
    </div>
  );
}

// Плейсхолдер карточки, пока едет лента: держит layout, чтобы контент
// не прыгал при появлении данных.
export function LotCardSkeleton() {
  return (
    <div className="card skel-card" aria-hidden="true">
      <div className="skel" style={{ aspectRatio: '1 / 1', borderRadius: 0 }} />
      <div className="col gap5" style={{ padding: '8px 10px 10px' }}>
        <div className="skel" style={{ height: 13, width: '85%', borderRadius: 4 }} />
        <div className="skel" style={{ height: 11, width: '55%', borderRadius: 4 }} />
        <div className="skel" style={{ height: 15, width: '40%', borderRadius: 4, marginTop: 2 }} />
      </div>
    </div>
  );
}

// ===========================================================
// VARIANT B — SWIPE
// ===========================================================
export function FeedSwipe({ cat, onOpen, lots = [], myLot = null }) {
  const deck = React.useMemo(() => lots.filter(l => cat === 'all' || normalizeCat(l.cat) === cat), [lots, cat]);
  const [idx, setIdx] = React.useState(0);
  const [drag, setDrag] = React.useState(0);
  const [liked, setLiked] = React.useState(null);
  const start = React.useRef(null);

  React.useEffect(() => { setIdx(0); }, [cat]);

  const top = deck[idx];
  const next = deck[idx + 1];

  const decide = (dir) => {
    if (dir === 'right') { setLiked(top); return; }
    setDrag(0); setIdx(i => i + 1);
  };
  const onDown = (e) => { start.current = (e.touches ? e.touches[0] : e).clientX; };
  const onMove = (e) => { if (start.current == null) return; setDrag((e.touches ? e.touches[0] : e).clientX - start.current); };
  const onUp = () => {
    if (start.current == null) return;
    if (drag > 90) decide('right');
    else if (drag < -90) decide('left');
    else setDrag(0);
    start.current = null;
  };

  if (!top) {
    return (
      <div className="col gap14" style={{ alignItems: 'center', justifyContent: 'center', padding: '60px 30px', textAlign: 'center' }}>
        <div className="avatar" style={{ width: 64, height: 64, background: 'var(--berry-50)' }}><Icon name="check" size={30} color="var(--berry)" /></div>
        <span className="h3">Вы пролистали всё рядом</span>
        <span className="sub">Загляните позже или расширьте радиус поиска — новые лоты появляются каждый час.</span>
        <button className="btn btn-ghost" onClick={() => setIdx(0)}>Начать сначала</button>
      </div>
    );
  }

  return (
    <div className="col" style={{ padding: '4px 18px 18px', height: '100%' }}>
      <div className="sub px" style={{ padding: '0 0 10px', textAlign: 'center' }}>
        Свайп вправо — <b style={{ color: 'var(--berry)' }}>хочу обменять</b>, влево — мимо
      </div>
      <div className="grow" style={{ position: 'relative', minHeight: 420 }}>
        {next && <SwipeCard lot={next} style={{ transform: 'scale(0.94) translateY(14px)', filter: 'brightness(0.99)' }} />}
        <SwipeCard
          lot={top}
          drag={drag}
          onDown={onDown} onMove={onMove} onUp={onUp}
          onTap={() => onOpen(top.id)}
        />
      </div>
      <div className="row gap16" style={{ justifyContent: 'center', padding: '16px 0 2px' }}>
        <button onClick={() => decide('left')} style={swipeBtn('#fff', 'var(--line)')}><Icon name="close" size={26} color="var(--ink-2)" /></button>
        <button onClick={() => onOpen(top.id)} style={{ ...swipeBtn('#fff', 'var(--line)'), width: 52, height: 52 }}><Icon name="info" size={22} color="var(--info)" /></button>
        <button onClick={() => decide('right')} style={swipeBtn('var(--berry)', 'var(--berry)')}><Icon name="swap" size={26} color="#fff" /></button>
      </div>

      <Sheet open={!!liked} onClose={() => { setLiked(null); setDrag(0); setIdx(i => i + 1); }} title="Это мэтч ✨">
        {liked && <div className="px col gap14" style={{ paddingBottom: 8 }}>
          <div className="row gap12" style={{ alignItems: 'center' }}>
            {myLot ? (
              <Photo label={myLot.photo} url={myLot.photoUrl} cat={myLot.cat} style={{ width: 70, height: 70, borderRadius: 14 }} />
            ) : (
              <div className="avatar" style={{ width: 70, height: 70, background: 'var(--berry-50)' }}><Icon name="swap" size={30} color="var(--berry)" /></div>
            )}
            <Icon name="swap" size={22} color="var(--berry)" />
            <Photo label={liked.photo} url={liked.photoUrl} cat={liked.cat} style={{ width: 70, height: 70, borderRadius: 14 }} />
          </div>
          <span className="body">Похоже, {(liked.ownerName || 'Владелец').split(' ')[0]} ищет именно то, что вы готовы отдать. Откройте лот и предложите обмен — AI уже посчитал справедливую доплату.</span>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => { onOpen(liked.id); setLiked(null); }}>Предложить обмен</button>
        </div>}
      </Sheet>
    </div>
  );
}
const swipeBtn = (bg, bd) => ({ width: 62, height: 62, borderRadius: 999, background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--sh-2)' });

function SwipeCard({ lot, drag = 0, onDown, onMove, onUp, onTap, style }) {
  const interactive = !!onDown;
  const rot = drag / 22;
  return (
    <div
      className="card"
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab',
        transform: interactive ? `translateX(${drag}px) rotate(${rot}deg)` : style?.transform,
        transition: interactive && drag === 0 ? 'transform .3s cubic-bezier(.2,.8,.2,1)' : 'none',
        boxShadow: 'var(--sh-3)', touchAction: 'pan-y', ...(!interactive ? style : null),
      }}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      onClick={() => { if (Math.abs(drag) < 6 && onTap) onTap(); }}
    >
      <Photo label={lot.photo} url={lot.photoUrl} cat={lot.cat} style={{ position: 'absolute', inset: 0 }} full />
      {interactive && (
        <>
          <Stamp text="ОБМЕН" color="var(--berry)" show={drag > 40} side="left" rot={-14} />
          <Stamp text="МИМО" color="var(--ink-2)" show={drag < -40} side="right" rot={14} />
        </>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 16px 16px', background: 'linear-gradient(to top, rgba(0,0,0,0.82), transparent)' }}>
        <div className="row gap6" style={{ marginBottom: 8 }}>
          <span className="tag" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(6px)' }}>{catOf(lot.cat).label}</span>
          <span className="tag" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(6px)' }}>{lot.condition}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
          <div className="col" style={{ gap: 5, minWidth: 0 }}>
            <span className="h3" style={{ color: '#fff' }}>{lot.title}</span>
            <span className="row gap6" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}><Icon name="map" size={13} color="rgba(255,255,255,0.8)" />{lot.ownerCity || ''} · {lot.posted}</span>
          </div>
          <span className="row gap4" style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 11, padding: '7px 10px' }}><Credit n={lot.value} size={15} coin={14} /></span>
        </div>
        <div className="row gap6" style={{ marginTop: 10, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', borderRadius: 11, padding: '8px 11px' }}>
          <Icon name="swap" size={15} color="#fff" />
          <span style={{ color: '#fff', fontSize: 12.5, fontWeight: 600 }} className="ellipsis">Хочет: {lot.wants}</span>
        </div>
      </div>
    </div>
  );
}

function Stamp({ text, color, show, side, rot }) {
  return (
    <div style={{ position: 'absolute', top: 24, [side]: 20, padding: '6px 14px', border: `3px solid ${color}`, borderRadius: 10, color, fontWeight: 800, fontSize: 22, letterSpacing: '0.05em', transform: `rotate(${rot}deg)`, opacity: show ? 1 : 0, transition: 'opacity .12s', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(2px)' }}>{text}</div>
  );
}

// ---------- favorites ----------
export function FavoritesScreen({ lots = [], go, onToggleFav, bell = null }) {
  return (
    <div className="app-scroll">
      <div className="appbar" style={{ paddingBottom: 10 }}>
        <div className="col gap2 grow">
          <span className="h2">Избранное</span>
          <span className="cap">Сохранённые объявления</span>
        </div>
        {bell}
      </div>
      <div className="px" style={{ paddingBottom: 20 }}>
        {lots.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {lots.map(l => <LotCard key={l.id} lot={l} compact onClick={() => go('lot', { lotId: l.id })} fav onToggleFav={onToggleFav} />)}
          </div>
        ) : (
          <div className="col gap8" style={{ alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
            <div className="avatar" style={{ width: 56, height: 56, background: 'var(--berry-50)' }}><Icon name="heart" size={26} color="var(--berry)" /></div>
            <span className="title">Пока пусто</span>
            <span className="sub" style={{ maxWidth: 240, textAlign: 'center' }}>Нажимайте на сердечко в объявлении, чтобы сохранить его сюда</span>
          </div>
        )}
      </div>
    </div>
  );
}
