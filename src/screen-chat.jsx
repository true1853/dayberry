// screen-chat.jsx — deals/chat list + conversation thread
import React from 'react';
import { CHATLIST, CHAT_MSGS, U } from './data.js';
import { Icon } from './icons.jsx';
import { Photo, Avatar, AppBar, IconBtn } from './ui.jsx';

const STAGE_LABEL = {
  meet: { t: 'Встреча назначена', c: 'var(--berry)' },
  progress: { t: 'Услуга в работе', c: 'var(--c-digital)' },
  chain: { t: 'Цепочка обмена', c: 'var(--ok)' },
};

export function DealsList({ onOpen, onOpenDeal }) {
  return (
    <div className="app-scroll">
      <AppBar title="Сделки" big sub="Чаты и активные обмены" right={<IconBtn name="filter" />} />
      <div className="px col gap10" style={{ paddingBottom: 20 }}>
        <div className="card" style={{ padding: 14, cursor: 'pointer', border: '1px solid var(--berry-100)' }} onClick={onOpenDeal}>
          <div className="row gap10">
            <div className="avatar" style={{ width: 42, height: 42, background: 'var(--berry-50)' }}><Icon name="lock" size={20} color="var(--berry)" /></div>
            <div className="col grow" style={{ gap: 2 }}>
              <span className="title">Активная сделка · эскроу</span>
              <span className="sub">PS5 ↔ Apple Watch — ждёт подтверждения</span>
            </div>
            <Icon name="chevR" size={20} color="var(--ink-3)" />
          </div>
          <div className="escrow-track" style={{ marginTop: 12 }}><div className="escrow-fill" style={{ width: '50%' }} /></div>
        </div>

        <span className="over" style={{ padding: '6px 2px 0' }}>Переписки</span>
        <div className="card" style={{ overflow: 'hidden' }}>
          {CHATLIST.map((c, i) => {
            const u = U[c.owner];
            const st = STAGE_LABEL[c.stage];
            return (
              <div key={c.id} className="row gap12" style={{ padding: '13px 14px', cursor: 'pointer', borderTop: i ? '1px solid var(--line)' : 'none', alignItems: 'center' }} onClick={() => onOpen(c.id)}>
                <Avatar user={c.owner} size={48} />
                <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="title ellipsis">{u.name}</span>
                    <span className="cap">{c.t}</span>
                  </div>
                  <span className="sub ellipsis">{c.last}</span>
                  <span className="tag" style={{ alignSelf: 'flex-start', background: `color-mix(in srgb, ${st.c} 12%, white)`, color: st.c, marginTop: 2 }}>{st.t}</span>
                </div>
                {c.unread > 0 && <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--berry)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{c.unread}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChatThread({ chatId, onBack, onOpenDeal }) {
  const c = CHATLIST.find(x => x.id === chatId) || CHATLIST[0];
  const u = U[c.owner];
  const [msgs, setMsgs] = React.useState(CHAT_MSGS);
  const [text, setText] = React.useState('');
  const scroller = React.useRef(null);

  React.useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs]);

  const send = () => {
    if (!text.trim()) return;
    setMsgs(m => [...m, { from: 'me', text: text.trim(), t: 'сейчас' }]);
    setText('');
    setTimeout(() => setMsgs(m => [...m, { from: 'them', text: 'Принято! 🙌', t: 'сейчас' }]), 1100);
  };

  return (
    <div className="app" style={{ position: 'absolute' }}>
      <div className="safe-top" />
      <div className="row gap10" style={{ padding: '4px 14px 12px', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
        <IconBtn name="back" onClick={onBack} />
        <Avatar user={c.owner} size={40} />
        <div className="col grow" style={{ gap: 1 }}>
          <span className="title">{u.name}</span>
          <span className="cap" style={{ color: u.online ? 'var(--ok)' : 'var(--ink-3)' }}>{u.online ? 'в сети' : 'был(а) недавно'}</span>
        </div>
        <IconBtn name="info" />
      </div>

      <div className="px" style={{ padding: '10px 18px' }}>
        <div className="card" style={{ padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} onClick={onOpenDeal}>
          <Photo label="PS5 SLIM" url="https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=200&q=80" cat="gadget" style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div className="col grow" style={{ gap: 1 }}><span className="title" style={{ fontSize: 13 }}>{c.deal}</span><span className="cap row gap4"><Icon name="lock" size={12} color="var(--berry)" />10 000 Б в эскроу</span></div>
          <span className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13 }}>Сделка</span>
        </div>
      </div>

      <div className="app-scroll" ref={scroller} style={{ padding: '6px 18px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.map((m, i) => {
          if (m.from === 'sys') return (
            <div key={i} className="row gap6" style={{ alignSelf: 'center', maxWidth: '88%', background: 'var(--berry-50)', color: 'var(--berry-700)', padding: '8px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, textAlign: 'center', margin: '4px 0' }}>
              <Icon name="shield" size={15} color="var(--berry)" style={{ flex: 'none' }} />{m.text}
            </div>
          );
          const me = m.from === 'me';
          return (
            <div key={i} style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <div style={{ padding: '9px 13px', borderRadius: me ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: me ? 'var(--berry)' : '#fff', color: me ? '#fff' : 'var(--ink)', boxShadow: me ? 'none' : 'var(--sh-1)', fontSize: 14.5, lineHeight: 1.4 }}>{m.text}</div>
              <span className="cap" style={{ display: 'block', textAlign: me ? 'right' : 'left', marginTop: 3, padding: '0 4px' }}>{m.t}</span>
            </div>
          );
        })}
      </div>

      <div className="row gap8" style={{ padding: '8px 14px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', background: '#fff', alignItems: 'center' }}>
        <button style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}><Icon name="plusCircle" size={22} color="var(--ink-2)" /></button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Сообщение…" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 999, padding: '11px 16px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', background: 'var(--bg)' }} />
        <button onClick={send} style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--berry)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}><Icon name="send" size={20} color="#fff" /></button>
      </div>
    </div>
  );
}
