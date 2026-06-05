// screen-chain.jsx — chain-first discovery + multi-party chain detail
import React from 'react';
import { CHAIN, MY_LOT, lot, U, ME } from './data.js';
import { Icon } from './icons.jsx';
import { AIBadge, Photo, Credit, Avatar, AppBar, IconBtn } from './ui.jsx';

const CHAINS = [
  CHAIN,
  {
    id: 'ch2', score: 88,
    steps: [
      { who: 'me',     gives: 'Apple Watch S9', photoUrl: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=400&q=80', to: 'oleg',   value: 38000 },
      { who: 'oleg',   gives: 'Велосипед Trek', photoUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80', to: 'marina', value: 41000 },
      { who: 'marina', gives: '5 фотосессий',   photoUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&q=80', to: 'me',     value: 35000 },
    ],
    note: 'Короткая цепочка из 3 участников. Доплата минимальна.',
  },
  {
    id: 'ch3', score: 82,
    steps: [
      { who: 'me',     gives: 'Apple Watch S9',    photoUrl: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=400&q=80', to: 'roma',  value: 38000 },
      { who: 'roma',   gives: 'iPhone 14',         photoUrl: 'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=400&q=80', to: 'dasha', value: 54000 },
      { who: 'dasha',  gives: 'Куртка St. Island', photoUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&q=80', to: 'lena',  value: 22000 },
      { who: 'lena',   gives: 'Сет настолок',      photoUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=400&q=80', to: 'me',    value: 8000 },
    ],
    note: 'Цепочка из 4 участников — система нашла редкое совпадение.',
  },
];

const who = (id) => (id === 'me' ? { ...ME, initials: 'А', name: 'Вы' } : U[id]);

function ChainNode({ step, isMe, last }) {
  const u = who(step.who);
  return (
    <div className="col gap10">
      <div className="row gap12" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Avatar user={step.who} size={46} />
          {isMe && <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 800, color: '#fff', background: 'var(--berry)', borderRadius: 999, padding: '1px 6px' }}>ВЫ</span>}
        </div>
        <div className="grow col" style={{ gap: 2 }}>
          <span className="title">{u.name}</span>
          <span className="sub">отдаёт <b style={{ color: 'var(--ink)' }}>{step.gives}</b></span>
        </div>
        <Credit n={step.value} size={14} coin={13} />
      </div>
      {!last && (
        <div className="row gap10" style={{ paddingLeft: 22, alignItems: 'center' }}>
          <div style={{ width: 2, height: 30, background: 'var(--berry-200)', borderRadius: 2 }} />
          <span className="row gap6" style={{ background: 'var(--berry-50)', borderRadius: 999, padding: '4px 11px', color: 'var(--berry)', fontSize: 12, fontWeight: 700 }}>
            <Icon name="arrowR" size={14} color="var(--berry)" />получает {who(step.to).name === 'Вы' ? 'Вы' : who(step.to).name}
          </span>
        </div>
      )}
    </div>
  );
}

export function ChainCard({ chain, onOpen, mini }) {
  return (
    <div className="card" style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={onOpen}>
      <div className="row" style={{ justifyContent: 'space-between', padding: '13px 14px 10px', alignItems: 'center' }}>
        <span className="row gap8">
          <Icon name="chain" size={20} color="var(--berry)" />
          <span className="title">Цепочка · {chain.steps.length} участника</span>
        </span>
        <span className="tag" style={{ background: 'var(--berry)', color: '#fff' }}>{chain.score}%</span>
      </div>
      <div className="row" style={{ padding: '0 14px 12px', alignItems: 'center', gap: 0 }}>
        {chain.steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="col gap4" style={{ alignItems: 'center', width: 0, flex: 1, minWidth: 0 }}>
              <Avatar user={s.who} size={34} />
              <span className="cap ellipsis" style={{ maxWidth: '100%', fontSize: 10 }}>{who(s.who).name === 'Вы' ? 'Вы' : who(s.who).name.split(' ')[0]}</span>
            </div>
            {i < chain.steps.length - 1 && <Icon name="chevR" size={15} color="var(--berry-200)" />}
            {i === chain.steps.length - 1 && <><Icon name="arrowR" size={15} color="var(--berry-200)" /><div className="col gap4" style={{ alignItems: 'center', width: 30, flex: 'none' }}><div className="avatar" style={{ width: 34, height: 34, background: 'var(--berry-50)' }}><Icon name="check" size={16} color="var(--berry)" /></div></div></>}
          </React.Fragment>
        ))}
      </div>
      <div className="divider" />
      <div className="row" style={{ justifyContent: 'space-between', padding: '10px 14px' }}>
        <span className="sub clamp2" style={{ flex: 1 }}>{mini ? `Вы получаете: ${chain.steps[chain.steps.length - 1].gives}` : chain.note}</span>
        <span className="cap row gap4" style={{ color: 'var(--berry)', flex: 'none', marginLeft: 8 }}>Открыть<Icon name="chevR" size={13} color="var(--berry)" /></span>
      </div>
    </div>
  );
}

export function FeedChain({ onOpenChain }) {
  return (
    <div className="col gap16" style={{ padding: '4px 18px 20px' }}>
      <div className="card" style={{ padding: 14, background: 'linear-gradient(135deg, var(--berry-900), var(--berry))', color: '#fff' }}>
        <div className="row gap10" style={{ alignItems: 'flex-start' }}>
          <div className="avatar" style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.18)', flex: 'none' }}><Icon name="chain" size={20} color="#fff" /></div>
          <div className="col gap4">
            <span className="h3" style={{ color: '#fff' }}>Круговой обмен</span>
            <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13.5, lineHeight: 1.45 }}>Не нашли прямой обмен? Система соберёт цепочку из 3–5 человек, где каждый получит желаемое.</span>
          </div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="row gap6"><AIBadge>Подобрано для вас</AIBadge></span>
        <span className="cap">по лоту «{MY_LOT.title.split(',')[0]}»</span>
      </div>
      <div className="col gap12">
        {CHAINS.map(c => <ChainCard key={c.id} chain={c} mini onOpen={() => onOpenChain(c.id)} />)}
      </div>
    </div>
  );
}

export function ChainDetail({ chainId, onBack, onJoin }) {
  const chain = CHAINS.find(c => c.id === chainId) || CHAIN;
  const myStep = chain.steps.find(s => s.who === 'me');
  const iGet = chain.steps[chain.steps.length - 1].gives;
  const total = chain.steps.reduce((a, s) => a + s.value, 0);
  const topup = Math.max(0, (chain.steps[chain.steps.length - 1].value) - myStep.value);

  return (
    <div className="app-scroll">
      <AppBar
        sub="Многосторонний обмен" title="Цепочка"
        left={<IconBtn name="back" onClick={onBack} />}
        right={<span className="tag" style={{ background: 'var(--berry)', color: '#fff', alignSelf: 'center' }}>{chain.score}% совпадение</span>}
      />
      <div className="px col gap16" style={{ paddingBottom: 30 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="row gap12">
            <Photo label={MY_LOT.photo} url={MY_LOT.photoUrl} cat={MY_LOT.cat} style={{ width: 60, height: 60, borderRadius: 14 }} />
            <div className="col" style={{ justifyContent: 'center', gap: 2, flex: 1 }}>
              <span className="cap">Вы отдаёте</span>
              <span className="title">{myStep.gives}</span>
            </div>
          </div>
          <div className="row gap10" style={{ margin: '12px 0', alignItems: 'center' }}>
            <div className="divider grow" /><Icon name="chevD" size={16} color="var(--berry-200)" /><div className="divider grow" />
          </div>
          <div className="row gap12">
            <Photo label={iGet} url={chain.steps[chain.steps.length - 1].photoUrl} cat="gadget" style={{ width: 60, height: 60, borderRadius: 14 }} />
            <div className="col" style={{ justifyContent: 'center', gap: 2, flex: 1 }}>
              <span className="cap" style={{ color: 'var(--ok)' }}>Вы получаете</span>
              <span className="title">{iGet}</span>
            </div>
          </div>
        </div>

        <div className="col gap10">
          <span className="over">Как двигаются вещи</span>
          <div className="card-line" style={{ padding: '16px 16px 14px' }}>
            {chain.steps.map((s, i) => <ChainNode key={i} step={s} isMe={s.who === 'me'} last={i === chain.steps.length - 1} />)}
            <div className="row gap10" style={{ paddingLeft: 22, marginTop: 2 }}>
              <div style={{ width: 2, height: 22, background: 'var(--berry-200)', borderRadius: 2 }} />
              <span className="row gap6" style={{ color: 'var(--ok)', fontSize: 12.5, fontWeight: 700 }}><Icon name="checkCircle" size={15} color="var(--ok)" />круг замкнулся — все в плюсе</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: 'var(--ok-soft)' }}>
          <div className="row gap10" style={{ alignItems: 'flex-start' }}>
            <Icon name="shield" size={22} color="var(--ok)" />
            <div className="col gap4">
              <span className="title" style={{ color: '#15663f' }}>Цепочка под защитой эскроу</span>
              <span className="sub" style={{ color: '#2c6a48' }}>{chain.note} Сделка проходит, только если все участники подтвердят получение. Иначе баллы возвращаются.</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <span className="over">Расчёт</span>
          <div className="col gap10" style={{ marginTop: 10 }}>
            <Line label="Оборот в цепочке" value={<Credit n={total} size={14} coin={13} />} />
            <Line label="Стоимость вашего лота" value={<Credit n={myStep.value} size={14} coin={13} />} />
            <div className="divider" />
            <Line bold label={topup > 0 ? 'Ваша доплата баллами' : 'Вам начислят баллами'} value={<Credit n={topup || Math.abs(myStep.value - iGetValue(chain))} size={15} coin={14} color={topup > 0 ? 'var(--ink)' : 'var(--ok)'} />} />
          </div>
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, var(--bg) 70%, transparent)' }}>
        <button className="btn btn-primary btn-block btn-lg" onClick={() => onJoin(chain)}>
          <Icon name="chain" size={20} color="#fff" />Вступить в цепочку
        </button>
      </div>
    </div>
  );
}

function iGetValue(chain) { return chain.steps[chain.steps.length - 1].value; }

function Line({ label, value, bold }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className={bold ? 'title' : 'sub'}>{label}</span>
      {value}
    </div>
  );
}
