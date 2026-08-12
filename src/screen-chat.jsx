// screen-chat.jsx — deals/chat list + conversation thread (real data)
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Avatar, AppBar, IconBtn, PullToRefresh } from './ui.jsx';
import { getChatAction, sendMessageAction, getChatUpdatesAction, markChatReadAction } from './server/actions.js';

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

// Аватар участника с маленьким значком статуса в углу: на экране сделок
// раньше стояли только абстрактные иконки, и было не видно, с кем обмен.
function PartyAvatar({ name, url, size = 46, badge, badgeColor = 'var(--berry)', badgeBg = '#fff' }) {
  return (
    <div style={{ position: 'relative', flex: 'none', width: size, height: size }}>
      <Avatar user={name} url={url} size={size} />
      {badge && (
        <span style={{
          position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 999,
          background: badgeBg, border: '2px solid var(--card, #fff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={badge} size={11} color={badgeColor} />
        </span>
      )}
    </div>
  );
}

export function DealsList({ chats = [], deals = [], onOpen, onOpenDeal, bell = null, onRefresh }) {
  const activeDeals = deals.filter(d => d.status === 'active' && d.stage !== 'done');
  // Тот, кто подтвердил получение первым, экран завершения не увидит:
  // к моменту закрытия сделки он уже ушёл со страницы. Без этого блока
  // половина участников не может оставить отзыв вообще.
  const toRate = deals.filter(d => d.stage === 'done' && !d.reviewed);
  return (
    <PullToRefresh onRefresh={onRefresh}>
      {/* фильтра у списка нет — кнопка была декоративной; на её месте
          колокольчик, которого раньше не было ни на одном экране, кроме поиска */}
      <AppBar title="Сделки" big sub="Чаты и активные обмены" right={bell} />
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
                <PartyAvatar name={d.partnerName} url={d.partnerAvatar} size={46} badge="lock" badgeBg="var(--berry-50)" />
                <div className="col grow" style={{ gap: 2 }}>
                  <span className="title ellipsis">{d.partnerName || 'Партнёр'}</span>
                  <span className="sub ellipsis">{d.role === 'partner' ? `Вы отдаёте «${L.title.split(',')[0]}»` : `${L.title.split(',')[0]} ↔ ваши вещи`} — {fmt(d.credits)} Б в эскроу</span>
                </div>
                {myConf ? <span className="tag" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', flex: 'none', alignSelf: 'center' }}>ждём партнёра</span> : parConf ? <span className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)', flex: 'none', alignSelf: 'center' }}>подтвердите</span> : null}
                <Icon name="chevR" size={20} color="var(--ink-3)" />
              </div>
              <div className="escrow-track" style={{ marginTop: 12 }}><div className="escrow-fill" style={{ width: pct + '%' }} /></div>
            </div>
          );
        })}

        {toRate.length > 0 && (
          <>
            <span className="over" style={{ padding: '6px 2px 0' }}>Ждут вашей оценки</span>
            {toRate.map(d => (
              <div key={d.id} className="card" style={{ padding: 14, cursor: 'pointer', border: '1px solid var(--line)' }} onClick={() => onOpenDeal(d.id)}>
                <div className="row gap10" style={{ alignItems: 'center' }}>
                  <PartyAvatar name={d.partnerName} url={d.partnerAvatar} size={46} badge="star" badgeColor="#f5a623" badgeBg="#fff7e6" />
                  <div className="col grow" style={{ gap: 2 }}>
                    <span className="title">Оцените {d.partnerName || 'партнёра'}</span>
                    <span className="sub ellipsis">Обмен «{(d.lot?.title || '').split(',')[0]}» завершён</span>
                  </div>
                  <Icon name="chevR" size={20} color="var(--ink-3)" />
                </div>
              </div>
            ))}
          </>
        )}

        <span className="over" style={{ padding: '6px 2px 0' }}>Переписки</span>
        {!chats.length && (
          <div className="card col gap8" style={{ padding: 22, alignItems: 'center', textAlign: 'center' }}>
            <Icon name="chat" size={28} color="var(--ink-3)" />
            <span className="sub">Переписок пока нет — предложите обмен на любом объявлении</span>
          </div>
        )}
        {chats.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {chats.map((c, i) => {
            const last = c.messages && c.messages[c.messages.length - 1];
            const st = c.deal ? (STAGE_LABEL[c.deal.stage] || { t: 'Сделка', c: 'var(--ink-2)' }) : null;
            const unread = c.unread || 0;
            return (
              <div key={c.id} className="row gap12" style={{ padding: '13px 14px', cursor: 'pointer', borderTop: i ? '1px solid var(--line)' : 'none', alignItems: 'center', background: unread ? 'var(--berry-50)' : 'transparent' }} onClick={() => onOpen(c.id)}>
                {c.kind === 'chain'
                  ? <div className="avatar" style={{ width: 48, height: 48, flex: 'none', background: 'var(--berry-50)' }}><Icon name="chain" size={22} color="var(--berry)" /></div>
                  : <Avatar user={c.partner?.name} url={c.partner?.avatar} size={48} />}
                <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="title ellipsis">{c.partner?.name}</span>
                    <span className="cap">{last ? fmtDate(last.t) : ''}</span>
                  </div>
                  <div className="row gap8" style={{ alignItems: 'center' }}>
                    <span className="sub ellipsis grow" style={{ fontWeight: unread ? 600 : 400, color: unread ? 'var(--ink)' : undefined }}>
                      {last ? `${last.me ? 'Вы: ' : ''}${last.text}` : 'Нет сообщений'}
                    </span>
                    {unread > 0 && (
                      <span style={{ flex: 'none', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--berry)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 99 ? '99+' : unread}</span>
                    )}
                  </div>
                  {st && <span className="tag" style={{ alignSelf: 'flex-start', background: `color-mix(in srgb, ${st.c} 12%, white)`, color: st.c, marginTop: 2 }}>{st.t}</span>}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </PullToRefresh>
  );
}

// Ссылка в переписке должна открываться, а не переписываться руками.
// Разрешаем только http(s): текст сообщения — чужой ввод, и превращать
// его в произвольную схему (javascript:, data:) нельзя.
const LINK_RE = /(https?:\/\/[^\s<>"']+)/gi;
const MAX_MESSAGE_LEN = 2000;

function Linkified({ text, me }) {
  const parts = String(text || '').split(LINK_RE);
  return parts.map((part, i) => (
    i % 2 === 1
      ? <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          style={{ color: me ? '#fff' : 'var(--berry)', textDecoration: 'underline', wordBreak: 'break-all' }}
        >{part}</a>
      : <React.Fragment key={i}>{part}</React.Fragment>
  ));
}

// Как часто открытый тред спрашивает сервер о новых сообщениях. Пуш-канала
// нет, а без опроса чат односторонний: входящие не появлялись до перезахода.
const POLL_MS = 4000;

// День считаем по местному времени, а не по UTC из ISO: иначе ночное
// сообщение по Москве уезжает во «вчера».
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayKey = (iso) => (iso ? localDay(new Date(iso)) : '');

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const key = localDay(d);
  if (key === localDay(today)) return 'Сегодня';
  if (key === localDay(yest)) return 'Вчера';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ChatThread({ chatId, onBack, onOpenDeal, onRead }) {
  const [chat, setChat] = React.useState(null);
  const [text, setText] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sendError, setSendError] = React.useState('');
  // Отправленные, но ещё не подтверждённые сервером — показываем сразу,
  // иначе поле очищается, а сообщения на экране нет.
  const [pending, setPending] = React.useState([]);
  const scroller = React.useRef(null);
  const stick = React.useRef(true);
  const inputRef = React.useRef(null);
  const readCb = React.useRef(onRead);
  readCb.current = onRead;

  const lastAt = React.useRef('');
  React.useEffect(() => {
    const ms = (chat && chat.messages) || [];
    lastAt.current = ms.length ? ms[ms.length - 1].t : '';
  }, [chat]);

  const markRead = React.useCallback(() => {
    markChatReadAction(chatId)
      .then(() => { if (readCb.current) readCb.current(chatId); })
      .catch(() => {});
  }, [chatId]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!chatId) { setLoading(false); return; }
      setLoading(true);
      try {
        const c = await getChatAction(chatId);
        if (!alive) return;
        setChat(c);
        if (c) markRead();
      } catch (e) {
        if (alive) setSendError('Не удалось загрузить чат — обновите страницу');
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [chatId, markRead]);

  // Опрос новых сообщений. В скрытой вкладке молчим: фоновый тред не должен
  // долбить сервер, а по возвращении на экран запрос уходит сразу.
  React.useEffect(() => {
    if (!chatId) return undefined;
    let alive = true;
    let busy = false;
    const tick = async () => {
      if (!alive || busy || (typeof document !== 'undefined' && document.hidden)) return;
      busy = true;
      try {
        const res = await getChatUpdatesAction(chatId, lastAt.current);
        if (!alive || !res || !res.ok) return;
        const fresh = res.messages || [];
        if (fresh.length) {
          setChat(c => {
            if (!c) return c;
            const known = new Set(c.messages.map(m => m.id));
            const add = fresh.filter(m => !known.has(m.id));
            if (!add.length) return c;
            return { ...c, messages: [...c.messages, ...add], deal: res.deal || c.deal };
          });
          // отметку двигаем только на чужих сообщениях: свои прочитаны всегда
          if (fresh.some(m => !m.me)) markRead();
        } else if (res.deal) {
          setChat(c => (c ? { ...c, deal: res.deal } : c));
        }
      } catch (e) {
        // молча: обрыв связи — не повод показывать ошибку поверх переписки
      } finally {
        busy = false;
      }
    };
    const id = setInterval(tick, POLL_MS);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [chatId, markRead]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Не дёргаем вниз того, кто читает историю выше.
  React.useEffect(() => {
    if (scroller.current && stick.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [chat, pending]);

  const doSend = async (msg, tmpId) => {
    try {
      const res = await sendMessageAction(chatId, msg);
      if (!res.ok) {
        setPending(p => p.map(m => (m.id === tmpId ? { ...m, sending: false, failed: true } : m)));
        setSendError(res.error || 'Не удалось отправить');
        return;
      }
      setSendError('');
      setChat(c => (c ? { ...c, messages: [...c.messages, res.message] } : c));
      setPending(p => p.filter(m => m.id !== tmpId));
    } catch (e) {
      console.error('send message failed', e);
      setPending(p => p.map(m => (m.id === tmpId ? { ...m, sending: false, failed: true } : m)));
      setSendError('Не удалось отправить — проверьте связь');
    }
  };

  const send = () => {
    const msg = text.trim();
    if (!msg) return;
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    stick.current = true;
    setPending(p => [...p, { id: tmpId, me: true, from: 'me', text: msg, t: new Date().toISOString(), sending: true }]);
    doSend(msg, tmpId);
  };

  const retry = (m) => {
    setPending(p => p.map(x => (x.id === m.id ? { ...x, failed: false, sending: true } : x)));
    setSendError('');
    doSend(m.text, m.id);
  };

  // Enter отправляет, Shift+Enter — перенос строки: условия обмена
  // в одну строку не всегда укладываются.
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const grow = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  };

  if (loading) return <div className="app" style={{ position: 'absolute' }}><div className="safe-top" /><div className="grow col" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="coin pop" style={{ width: 40, height: 40, fontSize: 18 }}>Б</div></div></div>;
  if (!chat) return <div className="app" style={{ position: 'absolute' }}><div className="safe-top" /><div className="grow col" style={{ alignItems: 'center', justifyContent: 'center' }}><span className="sub">Чат не найден</span></div></div>;

  const u = chat.partner;
  const deal = chat.deal;
  const group = chat.kind === 'chain';
  const items = [...chat.messages, ...pending];

  return (
    <div className="app" style={{ position: 'absolute' }}>
      <div className="safe-top" />
      <div className="row gap10" style={{ padding: '4px 14px 12px', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
        <IconBtn name="back" onClick={onBack} />
        {group
          ? <div className="avatar" style={{ width: 40, height: 40, flex: 'none', background: 'var(--berry-50)' }}><Icon name="chain" size={20} color="var(--berry)" /></div>
          : <Avatar user={u.name} url={u.avatar} size={40} />}
        <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
          <span className="title ellipsis">{u.name}</span>
          <span className="cap ellipsis">{group ? (chat.members || []).map(m => m.name).join(', ') : u.city}</span>
        </div>
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

      <div className="app-scroll" ref={scroller} onScroll={onScroll} style={{ padding: '6px 18px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!items.length && (
          <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, margin: 'auto', padding: '30px 20px' }}>
            <div className="avatar" style={{ width: 52, height: 52, background: 'var(--berry-50)' }}><Icon name="chat" size={24} color="var(--berry)" /></div>
            <span className="title" style={{ fontSize: 15 }}>Начните разговор</span>
            <span className="sub" style={{ maxWidth: 260 }}>Спросите о состоянии вещи и договоритесь, где и когда встретиться.</span>
          </div>
        )}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const sep = !prev || dayKey(prev.t) !== dayKey(m.t) ? (
            <div className="cap" style={{ alignSelf: 'center', padding: '8px 0 2px' }}>{dayLabel(m.t)}</div>
          ) : null;

          if (m.from === 'sys') return (
            <React.Fragment key={m.id || i}>
              {sep}
              <div className="row gap6" style={{ alignSelf: 'center', maxWidth: '88%', background: 'var(--berry-50)', color: 'var(--berry-700)', padding: '8px 12px', borderRadius: 12, fontSize: 12.5, fontWeight: 600, textAlign: 'center', margin: '4px 0' }}>
                <Icon name="shield" size={15} color="var(--berry)" style={{ flex: 'none' }} />{m.text}
              </div>
            </React.Fragment>
          );

          const me = m.me;
          // В цепочке пишут трое: без подписи реплики сливаются в один голос.
          const showAuthor = !me && group && m.author && (!prev || prev.from === 'sys' || prev.author !== m.author);
          return (
            <React.Fragment key={m.id || i}>
              {sep}
              <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                {showAuthor && <span className="cap" style={{ display: 'block', margin: '2px 0 3px 6px', fontWeight: 700, color: 'var(--berry-700)' }}>{m.author}</span>}
                <div style={{ padding: '9px 13px', borderRadius: me ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: me ? 'var(--berry)' : '#fff', color: me ? '#fff' : 'var(--ink)', boxShadow: me ? 'none' : 'var(--sh-1)', fontSize: 14.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: m.sending ? 0.6 : 1 }}><Linkified text={m.text} me={me} /></div>
                <span className="cap" style={{ display: 'block', textAlign: me ? 'right' : 'left', marginTop: 3, padding: '0 4px' }}>
                  {m.failed ? (
                    <button onClick={() => retry(m)} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--berry-700)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>не отправлено · повторить</button>
                  ) : m.sending ? 'отправляется…' : fmtTime(m.t)}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {text.length > MAX_MESSAGE_LEN - 200 && (
        <div className="cap" style={{ padding: '0 18px 6px', textAlign: 'right' }}>{text.length} / {MAX_MESSAGE_LEN}</div>
      )}
      <div className="row gap8" style={{ padding: '8px 14px calc(12px + env(safe-area-inset-bottom, 0px) + 24px)', borderTop: '1px solid var(--line)', background: '#fff', alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={grow}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_MESSAGE_LEN}
          placeholder="Сообщение…"
          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 20, padding: '11px 16px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', background: 'var(--bg)', resize: 'none', maxHeight: 120, lineHeight: 1.35 }}
        />
        <button onClick={send} disabled={!text.trim()} style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: text.trim() ? 'var(--berry)' : 'var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: text.trim() ? 'pointer' : 'default' }}><Icon name="send" size={20} color={text.trim() ? '#fff' : 'var(--ink-3)'} /></button>
      </div>
      {sendError && <div style={{ padding: '8px 14px', background: 'var(--warn-soft)', color: '#7a5410', fontSize: 12.5, fontWeight: 600, borderTop: '1px solid var(--warn-soft)' }}>{sendError}</div>}
    </div>
  );
}
