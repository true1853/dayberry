// screen-lot.jsx — lot detail + AI valuation + make-offer flow
import React from 'react';
import { lot, U, MY_LOT, ME } from './data.js';
import { Icon } from './icons.jsx';
import { fmt, Credit, Photo, Avatar, Stars, CatTag, AIBadge, IconBtn, Sheet } from './ui.jsx';

function AIValuation({ L }) {
  const pct = Math.max(6, Math.min(94, ((L.value - L.aiLow) / (L.aiHigh - L.aiLow)) * 100));
  return (
    <div className="card" style={{ padding: 15, border: '1px solid var(--berry-100)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="row gap6"><AIBadge>AI-оценка</AIBadge></span>
        <span className="cap row gap4"><Icon name="checkCircle" size={13} color="var(--ok)" />ориентир</span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <Credit n={L.value} size={26} coin={22} />
        <span className="sub">≈ ₽{fmt(L.value)}</span>
      </div>
      <span className="sub">Ориентир по похожим объявлениям — точную стоимость согласуйте в чате.</span>
      <div className="col gap6" style={{ marginTop: 14 }}>
        <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'linear-gradient(90deg, var(--berry-100), var(--berry-200), var(--berry))' }}>
          <div style={{ position: 'absolute', top: -4, left: `${pct}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: 999, background: '#fff', border: '3px solid var(--berry)', boxShadow: 'var(--sh-1)' }} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="cap">мин ₽{fmt(L.aiLow)}</span>
          <span className="cap">макс ₽{fmt(L.aiHigh)}</span>
        </div>
      </div>
    </div>
  );
}

export function LotDetail({ lotId, onBack, onOffer, onOwnerChat, lots }) {
  const L = (lots || []).find(l => l.id === lotId) || lot(lotId);
  const [g, setG] = React.useState(0);
  if (!L) return null;
  const owner = L.owner === 'me' ? ME : (U[L.owner] || ME);

  return (
    <div className="app-scroll">
      <div style={{ position: 'relative' }}>
        <Photo label={L.photo} url={L.photoUrl} cat={L.cat} style={{ aspectRatio: '1/1' }} />
        <div style={{ position: 'absolute', top: 'calc(8px + 48px)', left: 14, right: 14 }} className="row" >
          <IconBtn name="back" onClick={onBack} />
          <div className="grow" />
          <div className="row gap8">
            <IconBtn name="heart" />
            <IconBtn name="send" />
          </div>
        </div>
        <div className="row gap6" style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)' }}>
          {Array.from({ length: Math.min(L.photos, 6) }).map((_, i) => (
            <span key={i} style={{ width: i === g ? 18 : 6, height: 6, borderRadius: 999, background: i === g ? 'var(--berry)' : 'rgba(255,255,255,0.8)', transition: 'all .2s', cursor: 'pointer' }} onClick={() => setG(i)} />
          ))}
        </div>
      </div>

      <div className="px col gap16" style={{ paddingTop: 16, paddingBottom: 30 }}>
        <div className="col gap8">
          <div className="row gap6"><CatTag cat={L.cat} /><span className="tag" style={{ background: 'var(--line-2)', color: 'var(--ink-2)' }}>{L.condition}</span>{L.hot && <span className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)' }}><Icon name="flame" size={12} color="var(--berry)" />Хит</span>}</div>
          <span className="h2">{L.title}</span>
          <div className="row gap10 cap"><span className="row gap4"><Icon name="eye" size={14} color="var(--ink-3)" />{L.views}</span><span className="row gap4"><Icon name="map" size={14} color="var(--ink-3)" />{owner.city}</span><span>{L.posted}</span></div>
        </div>

        <AIValuation L={L} />

        <div className="card" style={{ padding: 14 }}>
          <div className="row gap8" style={{ marginBottom: 8 }}><Icon name="swap" size={18} color="var(--berry)" /><span className="title">Готов(а) обменять на</span></div>
          <span className="body">{L.wants}</span>
        </div>

        <div className="col gap6">
          <span className="over">Описание</span>
          <span className="body" style={{ color: 'var(--ink-2)' }}>{L.desc}</span>
        </div>

        <div className="card" style={{ padding: 14 }} onClick={onOwnerChat}>
          <div className="row gap12">
            <Avatar user={L.owner} size={46} />
            <div className="grow col" style={{ gap: 3 }}>
              <span className="title">{owner.name}</span>
              <span className="row gap6"><Stars value={owner.rating} /><span className="cap">{owner.rating} · {owner.deals} сделок</span></span>
            </div>
            <Icon name="chevR" size={20} color="var(--ink-3)" />
          </div>
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, var(--bg) 72%, transparent)', display: 'flex', gap: 10 }}>
        <button className="btn btn-soft" style={{ flex: 'none', padding: '14px 16px' }} onClick={onOwnerChat}><Icon name="chat" size={20} color="var(--ink)" /></button>
        <button className="btn btn-primary grow btn-lg" onClick={() => onOffer(L)}><Icon name="swap" size={20} color="#fff" />Предложить обмен</button>
      </div>
    </div>
  );
}

export function OfferSheet({ L, myLot, balance = 0, open, onClose, onConfirm }) {
  const MY = myLot || MY_LOT;
  const diff = L ? L.value - MY.value : 0;
  const [credits, setCredits] = React.useState(0);
  React.useEffect(() => { if (L) setCredits(Math.max(0, diff)); }, [L]);
  if (!L) return null;
  const balanced = MY.value + credits;
  const ok = Math.abs(balanced - L.value) <= L.value * 0.12;

  return (
    <Sheet open={open} onClose={onClose} title="Предложить обмен">
      <div className="px col gap14" style={{ paddingBottom: 8 }}>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <div className="card-line grow col gap6" style={{ padding: 10, alignItems: 'center' }}>
            <Photo label={MY.photo} url={MY.photoUrl} cat={MY.cat} style={{ width: '100%', aspectRatio: '4/3', borderRadius: 10 }} />
            <span className="cap" style={{ textAlign: 'center' }}>Вы отдаёте</span>
            <span className="title" style={{ fontSize: 12.5, textAlign: 'center' }}>{MY.title}</span>
          </div>
          <div className="avatar" style={{ width: 34, height: 34, background: 'var(--berry-50)', flex: 'none' }}><Icon name="swap" size={18} color="var(--berry)" /></div>
          <div className="card-line grow col gap6" style={{ padding: 10, alignItems: 'center' }}>
            <Photo label={L.photo} url={L.photoUrl} cat={L.cat} style={{ width: '100%', aspectRatio: '4/3', borderRadius: 10 }} />
            <span className="cap" style={{ textAlign: 'center' }}>Вы получаете</span>
            <span className="title" style={{ fontSize: 12.5, textAlign: 'center' }}>{L.title}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 13, background: 'var(--berry-50)' }}>
          <div className="row gap8" style={{ marginBottom: 8 }}><AIBadge>AI предлагает</AIBadge><span className="grow" /><span className="sub">расчёт доплаты баллами</span></div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="title">Доплата баллами</span>
            <div className="row gap8" style={{ alignItems: 'center' }}>
              <button onClick={() => setCredits(c => Math.max(0, c - 1000))} style={stepBtn}>−</button>
              <Credit n={credits} size={17} coin={15} />
              <button onClick={() => setCredits(c => c + 1000)} style={stepBtn}>+</button>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <span className="cap">Ваш баланс: <b className="amount">{fmt(balance)} Б</b></span>
            <span className="cap" style={{ color: ok ? 'var(--ok)' : 'var(--warn)' }}>{ok ? '✓ обмен сбалансирован' : 'разница великовата'}</span>
          </div>
        </div>

        <div className="row gap10" style={{ padding: '0 2px' }}>
          <Icon name="lock" size={18} color="var(--ink-3)" />
          <span className="sub">Ваши <b className="amount">{fmt(credits)} Б</b> заморозятся в эскроу. Партнёр получит их только после того, как вы подтвердите получение вещи.</span>
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={() => onConfirm(L, credits)}>
          <Icon name="shield" size={20} color="#fff" />Открыть сделку · заморозить <Credit n={credits} size={15} coin={14} color="#fff" />
        </button>
      </div>
    </Sheet>
  );
}

const stepBtn = { width: 30, height: 30, borderRadius: 9, border: '1px solid var(--berry-200)', background: '#fff', color: 'var(--berry)', fontSize: 19, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
