// screen-deal.jsx — escrow deal status + confirm-receipt
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Credit, Photo, Avatar, Stars, AppBar, IconBtn, Sheet } from './ui.jsx';

const DEAL_STEPS = [
  { id: 'created', label: 'Сделка создана', sub: 'Баллы заморожены в эскроу' },
  { id: 'meet',    label: 'Передача вещи',  sub: 'Личная встреча или доставка' },
  { id: 'confirm', label: 'Подтверждение',  sub: 'Вы подтверждаете получение' },
  { id: 'done',    label: 'Баллы переведены',sub: 'Эскроу разморожен' },
];

function Stepper({ active }) {
  const ai = DEAL_STEPS.findIndex(s => s.id === active);
  return (
    <div className="col">
      {DEAL_STEPS.map((s, i) => {
        const done = i < ai, cur = i === ai;
        return (
          <div key={s.id} className="row gap12" style={{ alignItems: 'flex-start' }}>
            <div className="col" style={{ alignItems: 'center', alignSelf: 'stretch' }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done || cur ? 'var(--berry)' : 'var(--line)', color: '#fff', boxShadow: cur ? '0 0 0 5px var(--berry-50)' : 'none', transition: 'all .3s' }}>
                {done ? <Icon name="check" size={15} color="#fff" sw={2.6} /> : <span style={{ fontSize: 12, fontWeight: 800, color: done || cur ? '#fff' : 'var(--ink-3)' }}>{i + 1}</span>}
              </div>
              {i < DEAL_STEPS.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 26, background: done ? 'var(--berry)' : 'var(--line)', transition: 'all .3s' }} />}
            </div>
            <div className="col" style={{ gap: 1, paddingBottom: 18 }}>
              <span className="title" style={{ color: done || cur ? 'var(--ink)' : 'var(--ink-3)' }}>{s.label}</span>
              <span className="sub">{s.sub}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DealStatus({ deal, onBack, onConfirm, onChat, onDone }) {
  if (!deal) return null;
  const L = deal.lot || {};
  const { credits, stage } = deal;
  const owner = { name: deal.ownerName || '' };
  const [confirming, setConfirming] = React.useState(false);

  if (stage === 'done') return <DealDone deal={deal} onDone={onDone} />;

  const my = deal.myLot || { title: '', photo: '', photoUrl: '', cat: 'gadget' };
  return (
    <div className="app-scroll">
      <AppBar sub="Сделка · эскроу" title="Обмен в работе" left={<IconBtn name="back" onClick={onBack} />} right={<IconBtn name="chat" onClick={onChat} />} />
      <div className="px col gap16" style={{ paddingBottom: 30 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Photo label={my.photo} url={my.photoUrl} cat={my.cat} style={{ width: 58, height: 58, borderRadius: 13 }} />
            <div className="col grow" style={{ gap: 2 }}><span className="cap">вы отдаёте</span><span className="title" style={{ fontSize: 13.5 }}>{my.title}</span></div>
          </div>
          <div className="row gap8" style={{ alignItems: 'center', margin: '10px 0' }}><div className="divider grow" /><Icon name="swap" size={18} color="var(--berry)" /><div className="divider grow" /></div>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Photo label={L.photo} url={L.photoUrl} cat={L.cat} style={{ width: 58, height: 58, borderRadius: 13 }} />
            <div className="col grow" style={{ gap: 2 }}><span className="cap" style={{ color: 'var(--ok)' }}>вы получаете</span><span className="title" style={{ fontSize: 13.5 }}>{L.title}</span></div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, background: 'linear-gradient(135deg, #1b1b1b, #2a2a2a)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div className="row gap10" style={{ marginBottom: 12 }}>
            <Icon name="lock" size={20} color="var(--berry-200)" />
            <span className="title" style={{ color: '#fff' }}>В эскроу заморожено</span>
            <span className="grow" />
            <span className="tag" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}>защищено</span>
          </div>
          <Credit n={credits} size={30} coin={24} color="#fff" />
          <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>
            {(owner.name || 'Партнёр').split(' ')[0]} получит баллы только после вашего подтверждения. Если вещь не та — деньги вернутся вам.
          </span>
        </div>

        <div className="card" style={{ padding: '16px 16px 2px' }}>
          <span className="over" style={{ display: 'block', marginBottom: 14 }}>Статус сделки</span>
          <Stepper active={stage} />
        </div>

        <div className="row gap12 card" style={{ padding: 12, alignItems: 'center' }} onClick={onChat}>
          <Avatar user={owner.name} size={42} />
          <div className="col grow" style={{ gap: 2 }}><span className="title">{owner.name}</span><span className="cap">обычно отвечает за 5 минут</span></div>
          <button className="btn btn-ghost" style={{ padding: '10px 14px' }}><Icon name="chat" size={18} color="var(--berry)" />Чат</button>
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, var(--bg) 72%, transparent)' }}>
        <button className="btn btn-primary btn-block btn-lg" onClick={() => setConfirming(true)}>
          <Icon name="checkCircle" size={20} color="#fff" />Подтвердить получение
        </button>
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Подтвердить получение?">
        <div className="px col gap14" style={{ paddingBottom: 8 }}>
          <span className="body">Подтверждайте, только когда получили вещь и проверили её. После этого <b>{fmt(credits)} Б</b> моментально уйдут партнёру, а сделка закроется.</span>
          <div className="card" style={{ padding: 12, background: 'var(--warn-soft)' }}>
            <span className="row gap8 sub" style={{ color: '#7a5410' }}><Icon name="shield" size={18} color="var(--warn)" />Что-то не так? Откройте спор — баллы останутся замороженными до решения.</span>
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => { setConfirming(false); onConfirm(); }}><Icon name="check" size={20} color="#fff" />Да, всё получил(а)</button>
          <button className="btn btn-soft btn-block" onClick={() => setConfirming(false)}>Открыть спор</button>
        </div>
      </Sheet>
    </div>
  );
}

function DealDone({ deal, onDone }) {
  const { credits } = deal;
  const L = deal.lot || {};
  return (
    <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="grow col" style={{ alignItems: 'center', justifyContent: 'center', padding: '40px 30px', textAlign: 'center', gap: 16 }}>
        <div className="pop" style={{ width: 96, height: 96, borderRadius: 999, background: 'var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 70, height: 70, borderRadius: 999, background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={40} color="#fff" sw={2.6} /></div>
        </div>
        <div className="col gap8 fade-in">
          <span className="h1">Обмен завершён 🎉</span>
          <span className="sub" style={{ maxWidth: 280 }}>Вы получили <b style={{ color: 'var(--ink)' }}>{L.title || 'сделку'}</b>, а <b className="amount">{fmt(credits)} Б</b> переведены партнёру из эскроу.</span>
        </div>
        <div className="card fade-in" style={{ padding: 14, width: '100%', maxWidth: 320 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Переведено из эскроу</span><Credit n={credits} size={15} coin={14} /></div>
          <div className="divider" style={{ margin: '10px 0' }} />
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Ваш рейтинг</span><span className="row gap6"><Stars value={5} /><span className="title" style={{ fontSize: 13 }}>+1 сделка</span></span></div>
        </div>
      </div>
      <div className="px col gap10" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <button className="btn btn-primary btn-block btn-lg" onClick={() => onDone('rate')}><Icon name="star" size={18} color="#fff" />Оценить партнёра</button>
        <button className="btn btn-soft btn-block" onClick={() => onDone('home')}>Вернуться в ленту</button>
      </div>
    </div>
  );
}
