// screen-chat.jsx — deals/chat list + conversation thread (real data)
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Avatar, AppBar, IconBtn } from './ui.jsx';
import { getChatAction, sendMessageAction } from './server/actions.js';

const STAGE_LABEL = {
  meet: { t: 'Встреча назначена', c: 'var(--berry)' },
  progress: { t: 'Услуга в работе', c: 'var(--c-digital)' },
  chain: { t: 'Цепочка обмена', c: 'var(--ok)' },
};

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function DealsList({ chats = [], deals = [], onOpen, onOpenDeal }) {
  const activeDeals = deals.filter(d => d.status === 'active' && d.stage !== 'done');
  return (
    <div className="app-scroll">
      <AppBar title="Сделки" big sub="Чаты и активные обмены" right={<IconBtn name="filter" />} />
      <div className="px col gap10" style={{ paddingBottom: 20 }}>
        {activeDeals.map(d => {
          const L = d.lot;
          if (!L) return null;
          const myConf = d.role === 'initiator' ? d.initiatorConfirmed : d.partnerConfirmed;
          const parConf = d.role === 'initiator' ? d.partnerConfirmed : d.initiatorConfirmed;
          const pct = myConf || parConf ? 75 : d.stage === 'meet' ? 50 : 25;
          return (
            <div key={d.id} className="card" style={{ padding: 14, cursor: 'pointer', border: '1px solid var(--berry-100)' }} onClick={() => onOpenDeal(d.id)}>
              <div className="row gap10">
                <div className="avatar" style={{ width: 42, height: 42, background: 'var(--berry-50)' }}><Icon name="lock" size={20} color="var(--berry)" /></div>
                <div className="col grow" style={{ gap: 2 }}>
                  <span className="title">Активная сделка · эскроу</span>
                  <span className="sub ellipsis">{d.role === 'partner' ? `Вы отдаёте «${L.title.split(',')[0]}»` : `${L.title.split(',')[0]} ↔ ваши вещи`} — {fmt(d.credits)} Б в эскроу</span>
                </div>
                {myConf ? <span className="tag" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', flex: 'none', alignSelf: 'center' }}>ждём партнёра</span> : parConf ? <span className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)', flex: 'none', alignSelf: 'center' }}>подтвердите</span> : null}
                <Icon name="chevR" size={20} color="var(--ink-3)" />
              </div>
              <div className="escrow-track" style={{ marginTop: 12 }}><div className="escrow-fill" style={{ width: pct + '%' }} /></div>
            </div>
          );
        })}

        <span className="over" style={{ padding: '6px 2px 0' }}>Переписки</span>
        <div className="card" style={{ overflow: 'hidden' }}>
          {chats.map((c, i) => {
            const last = c.messages && c.messages[c.messages.length - 1];
            const st = c.deal ? (STAGE_LABEL[c.deal.stage] || { t: 'Сделка', c: 'var(--ink-2)' }) : null;
            return (
              <div key={c.id} className="row gap12" style={{ padding: '13px 14px', cursor: 'pointer', borderTop: i ? '1px solid var(--line)' : 'none', alignItems: 'center' }} onClick={() => onOpen(c.id)}>
                <Avatar user={c.partner?.name} size={48} />
                <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="title ellipsis">{c.partner?.name}</span>
                    <span className="cap">{last ? fmtDate(last.t) : ''}</span>
                  </div>
                  <span className="sub ellipsis">{last ? last.text : 'Нет сообщений'}</span>
                  {st && <span className="tag" style={{ alignSelf: 'flex-start', background: `color-mix(in srgb, ${st.c} 12%, white)`, color: st.c, marginTop: 2 }}>{st.t}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChatThread({ chatId, onBack, onOpenDeal }) {
  const [chat, setChat] = React.useState(null);
  const [text, setText] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sendError, setSendError] = React.useState('');
  const scroller = React.useRef(null);

  React.useEffect(() => {
    (async () => {
      if (!chatId) return;
      setLoading(true);
      try {
        const c = await getChatAction(chatId);
        setChat(c);
      } catch (e) {
        setSendError('Не удалось загрузить чат — обновите страницу');
      }
      setLoading(false);
    })();
  }, [chatId]);

  React.useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [chat?.messages]);

  const send = async () => {
    if (!text.trim()) return;
    const msg = text.trim();
    setText('');
    setSendError('');
    try {
      const res = await sendMessageAction(chatId, msg);
      if (!res.ok) { setSendError(res.error || 'Не удалось отправить'); return; }
      setChat(c => c ? { ...c, messages: [...c.messages, res.message] } : c);
    } catch (e) {
      console.error('send message failed', e);
      setSendError('Не удалось отправить — обновите страницу и попробуйте ещё раз');
    }
  };

  if (loading) return <div className="app" style={{ position: 'absolute' }}><div className="safe-top" /><div className="grow col" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="coin pop" style={{ width: 40, height: 40, fontSize: 18 }}>Б</div></div></div>;
  if (!chat) return <div className="app" style={{ position: 'absolute' }}><div className="safe-top" /><div className="grow col" style={{ alignItems: 'center', justifyContent: 'center' }}><span className="sub">Чат не найден</span></div></div>;

  const u = chat.partner;
  const deal = chat.deal;

  return (
    <div className="app" style={{ position: 'absolute' }}>
      <div className="safe-top" />
      <div className="row gap10" style={{ padding: '4px 14px 12px', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
        <IconBtn name="back" onClick={onBack} />
        <Avatar user={u.name} size={40} />
        <div className="col grow" style={{ gap: 1 }}>
          <span className="title">{u.name}</span>
          <span className="cap">{u.city}</span>
        </div>
        <IconBtn name="info" />
      </div>

      {deal && (
        <div className="px" style={{ padding: '10px 18px' }}>
          <div className="card" style={{ padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} onClick={onOpenDeal}>
            <div className="avatar" style={{ width: 40, height: 40, background: 'var(--berry-50)', flex: 'none' }}><Icon name="swap" size={20} color="var(--berry)" /></div>
            <div className="col grow" style={{ gap: 1 }}><span className="title" style={{ fontSize: 13 }}>{deal.title}</span><span className="cap row gap4"><Icon name="lock" size={12} color="var(--berry)" />{fmt(deal.credits)} Б в эскроу</span></div>
            <span className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13 }}>Сделка</span>
          </div>
        </div>
      )}

      <div className="app-scroll" ref={scroller} style={{ padding: '6px 18px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chat.messages.map((m, i) => {
          if (m.from === 'sys') return (
            <div key={m.id || i} className="row gap6" style={{ alignSelf: 'center', maxWidth: '88%', background: 'var(--berry-50)', color: 'var(--berry-700)', padding: '8px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, textAlign: 'center', margin: '4px 0' }}>
              <Icon name="shield" size={15} color="var(--berry)" style={{ flex: 'none' }} />{m.text}
            </div>
          );
          const me = m.me;
          return (
            <div key={m.id || i} style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <div style={{ padding: '9px 13px', borderRadius: me ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: me ? 'var(--berry)' : '#fff', color: me ? '#fff' : 'var(--ink)', boxShadow: me ? 'none' : 'var(--sh-1)', fontSize: 14.5, lineHeight: 1.4 }}>{m.text}</div>
              <span className="cap" style={{ display: 'block', textAlign: me ? 'right' : 'left', marginTop: 3, padding: '0 4px' }}>{fmtTime(m.t)}</span>
            </div>
          );
        })}
      </div>

      <div className="row gap8" style={{ padding: '8px 14px calc(12px + env(safe-area-inset-bottom, 0px) + 24px)', borderTop: '1px solid var(--line)', background: '#fff', alignItems: 'center' }}>
        <button style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}><Icon name="plusCircle" size={22} color="var(--ink-2)" /></button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Сообщение…" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 999, padding: '11px 16px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', background: 'var(--bg)' }} />
        <button onClick={send} style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--berry)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer' }}><Icon name="send" size={20} color="#fff" /></button>
      </div>
      {sendError && <div style={{ padding: '8px 14px', background: 'var(--warn-soft)', color: '#7a5410', fontSize: 12.5, fontWeight: 600, borderTop: '1px solid var(--warn-soft)' }}>{sendError}</div>}
    </div>
  );
}
