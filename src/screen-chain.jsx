// screen-chain.jsx — многосторонние обмены: список моих цепочек и деталка.
//
// Экран строится вокруг двух вещей, на которых держится вся механика:
// прогресс согласий с живыми аватарами и видимый всем таймер. Проценты
// совпадения — второстепенны, поэтому они не в заголовке.
import React from 'react';
import { Icon } from './icons.jsx';
import { Photo, Credit, Avatar, AppBar, IconBtn } from './ui.jsx';

// ---------------------------------------------------------------------------
// вспомогательное
// ---------------------------------------------------------------------------

export function timeLeft(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms) || ms <= 0) return 'время вышло';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

// Таймер тикает сам: цифра, застывшая на «23 ч 59 мин» на сутки, обесценивает
// весь дефицит, ради которого она показана.
function useTick(active) {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(force, 30000);
    return () => clearInterval(id);
  }, [active]);
}

const STATUS = {
  candidate: { label: 'Найдена', bg: 'var(--berry-50)', fg: 'var(--berry)' },
  pending: { label: 'Ждём ответов', bg: '#fff4e5', fg: '#a15c00' },
  active: { label: 'В работе', bg: 'var(--ok-soft)', fg: '#15663f' },
  done: { label: 'Закрыта', bg: 'var(--line-2)', fg: 'var(--ink-2)' },
};

const stepTitle = (s) => (s.lot ? s.lot.title : 'баллы');

function TopupLine({ topup }) {
  if (!topup) return <span className="sub">Без доплаты</span>;
  return topup > 0
    ? <span className="row gap6"><span className="sub">Ваша доплата</span><Credit n={topup} size={14} coin={13} /></span>
    : <span className="row gap6"><span className="sub">Вам начислят</span><Credit n={-topup} size={14} coin={13} color="var(--ok)" /></span>;
}

// ---------------------------------------------------------------------------
// карточка в списке
// ---------------------------------------------------------------------------

export function ChainCard({ chain, onOpen }) {
  useTick(chain.status === 'pending');
  const st = STATUS[chain.status] || STATUS.candidate;
  const me = chain.me || {};
  const waiting = chain.total - chain.accepted;

  return (
    <div className="card" style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={onOpen}>
      <div className="row" style={{ justifyContent: 'space-between', padding: '13px 14px 10px', alignItems: 'center' }}>
        <span className="row gap8">
          <Icon name="chain" size={20} color="var(--berry)" />
          <span className="title">Цепочка · {chain.total} участника</span>
        </span>
        <span className="tag" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
      </div>

      {/* Что человек получает — первым, до всякой механики. */}
      <div className="col gap4" style={{ padding: '0 14px 10px' }}>
        <span className="sub">
          {me.receives
            ? <>Вам — <b style={{ color: 'var(--ink)' }}>{me.receives.title}</b></>
            : <>Вам — <b style={{ color: 'var(--ink)' }}>{Math.abs(me.topup || 0)} баллов</b></>}
        </span>
        {me.gives && <span className="cap">отдаёте: {me.gives.title}</span>}
      </div>

      <div className="row" style={{ padding: '0 14px 12px', alignItems: 'center', gap: 0 }}>
        {chain.steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="col gap4" style={{ alignItems: 'center', width: 0, flex: 1, minWidth: 0 }}>
              <div style={{ position: 'relative', opacity: s.state === 'declined' ? 0.4 : 1 }}>
                <Avatar user={s.user.name} url={s.user.avatar} size={34} />
                {s.state === 'accepted' && (
                  <span style={{ position: 'absolute', right: -3, bottom: -3, width: 15, height: 15, borderRadius: 999, background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                    <Icon name="check" size={9} color="#fff" sw={3.5} />
                  </span>
                )}
              </div>
              <span className="cap ellipsis" style={{ maxWidth: '100%', fontSize: 10 }}>{s.user.name.split(' ')[0]}</span>
            </div>
            {i < chain.steps.length - 1 && <Icon name="arrowR" size={15} color="var(--berry-200)" />}
          </React.Fragment>
        ))}
      </div>

      <div className="divider" />
      <div className="row" style={{ justifyContent: 'space-between', padding: '10px 14px', alignItems: 'center' }}>
        {chain.status === 'pending' ? (
          <span className="cap row gap6" style={{ color: waiting === 1 ? 'var(--berry)' : 'var(--ink-2)' }}>
            <Icon name="clock" size={13} color={waiting === 1 ? 'var(--berry)' : 'var(--ink-3)'} />
            Согласились {chain.accepted} из {chain.total} · {timeLeft(chain.expiresAt)}
          </span>
        ) : (
          <span className="sub clamp2" style={{ flex: 1 }}>{chain.note}</span>
        )}
        <span className="cap row gap4" style={{ color: 'var(--berry)', flex: 'none', marginLeft: 8 }}>
          Открыть<Icon name="chevR" size={13} color="var(--berry)" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// лента цепочек
// ---------------------------------------------------------------------------

export function FeedChain({ onOpenChain, chains = [], onRefresh, refreshing = false, authed = true, hasLots = true, hasWants = true }) {
  const inWork = chains.filter(c => c.status !== 'candidate');
  const found = chains.filter(c => c.status === 'candidate');

  return (
    <div className="col gap14" style={{ padding: '4px 18px 20px' }}>
      <div className="card" style={{ padding: 14, background: 'linear-gradient(135deg, var(--berry-900), var(--berry))', color: '#fff' }}>
        <div className="row gap10" style={{ alignItems: 'flex-start' }}>
          <div className="avatar" style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.18)', flex: 'none' }}><Icon name="chain" size={20} color="#fff" /></div>
          <div className="col gap4">
            <span className="h3" style={{ color: '#fff' }}>Круговой обмен</span>
            <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13.5, lineHeight: 1.45 }}>
              Не нашли прямой обмен? Система собирает цепочку из трёх человек, где каждый получает то, что искал. Без комиссии.
            </span>
          </div>
        </div>
      </div>

      {inWork.length > 0 && (
        <div className="col gap10">
          <span className="over">В работе</span>
          {inWork.map(c => <ChainCard key={c.id} chain={c} onOpen={() => onOpenChain(c.id)} />)}
        </div>
      )}

      {found.length > 0 && (
        <div className="col gap10">
          <span className="over">Найдены для вас</span>
          {found.map(c => <ChainCard key={c.id} chain={c} onOpen={() => onOpenChain(c.id)} />)}
        </div>
      )}

      {!chains.length && (
        <div className="card col" style={{ padding: '30px 22px', alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <div className="avatar" style={{ width: 56, height: 56, background: 'var(--berry-50)' }}><Icon name="chain" size={27} color="var(--berry)" /></div>
          <span className="title" style={{ fontSize: 15 }}>Пока цепочек нет</span>
          {/* Пустой экран без объяснения выглядит как поломка. Говорим,
              чего именно не хватает системе, чтобы собрать цепочку. */}
          <span className="sub" style={{ lineHeight: 1.5 }}>
            {!authed
              ? 'Войдите, чтобы система искала цепочки с вашими вещами.'
              : !hasLots
                ? 'Добавьте хотя бы одно объявление — без вашей вещи круг не замкнуть.'
                : !hasWants
                  ? 'Заполните вишлист в профиле: цепочка собирается по тому, что вы хотите получить.'
                  : 'Цепочка собирается, когда желания трёх человек складываются в круг. Проверим ещё раз — это занимает несколько секунд.'}
          </span>
          {authed && onRefresh && (
            <button className="btn btn-ghost" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Ищем…' : 'Поискать цепочки'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// деталка
// ---------------------------------------------------------------------------

function ChainNode({ step, last }) {
  return (
    <div className="col gap10">
      <div className="row gap12" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative', opacity: step.state === 'declined' ? 0.45 : 1 }}>
          <Avatar user={step.user.name} url={step.user.avatar} size={46} />
          {step.isMe && <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 800, color: '#fff', background: 'var(--berry)', borderRadius: 999, padding: '1px 6px' }}>ВЫ</span>}
        </div>
        <div className="grow col" style={{ gap: 2 }}>
          <span className="title">{step.user.name}</span>
          <span className="sub">
            {step.lot
              ? <>отдаёт <b style={{ color: 'var(--ink)' }}>{step.lot.title}</b></>
              : <>закрывает круг доплатой</>}
          </span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 3 }}>
          {step.lot && <Credit n={step.value} size={14} coin={13} />}
          <StepState state={step.state} />
        </div>
      </div>
      {!last && (
        <div className="row gap10" style={{ paddingLeft: 22, alignItems: 'center' }}>
          <div style={{ width: 2, height: 30, background: 'var(--berry-200)', borderRadius: 2 }} />
          <span className="row gap6" style={{ background: 'var(--berry-50)', borderRadius: 999, padding: '4px 11px', color: 'var(--berry)', fontSize: 12, fontWeight: 700 }}>
            <Icon name="arrowR" size={14} color="var(--berry)" />получает {step.toUser.name}
          </span>
        </div>
      )}
    </div>
  );
}

function StepState({ state }) {
  if (state === 'accepted') return <span className="cap row gap4" style={{ color: 'var(--ok)' }}><Icon name="check" size={12} color="var(--ok)" />согласен</span>;
  if (state === 'declined') return <span className="cap" style={{ color: 'var(--ink-3)' }}>отказался</span>;
  return <span className="cap" style={{ color: 'var(--ink-3)' }}>ждём ответа</span>;
}

export function ChainDetail({ chainId, onBack, chains = [], onStart, onRespond, onSent, onReceived, onOpenChat, busy = false }) {
  const chain = chains.find(c => c.id === chainId) || null;
  useTick(chain?.status === 'pending');
  if (!chain) return null;

  const me = chain.me || {};
  const st = STATUS[chain.status] || STATUS.candidate;
  const waiting = chain.total - chain.accepted;

  return (
    <div className="app-scroll">
      <AppBar
        sub="Многосторонний обмен" title="Цепочка"
        left={<IconBtn name="back" onClick={onBack} />}
        right={<span className="tag" style={{ background: st.bg, color: st.fg, alignSelf: 'center' }}>{st.label}</span>}
      />
      <div className="px col gap16" style={{ paddingBottom: 30 }}>

        {chain.status === 'pending' && (
          <div className="card row gap10" style={{ padding: 14, alignItems: 'center', background: waiting === 1 ? 'var(--berry-50)' : '#fff4e5' }}>
            <Icon name="clock" size={22} color={waiting === 1 ? 'var(--berry)' : '#a15c00'} />
            <div className="col" style={{ gap: 2 }}>
              <span className="title" style={{ color: waiting === 1 ? 'var(--berry-900)' : '#7a4500' }}>
                Согласились {chain.accepted} из {chain.total}
              </span>
              <span className="sub" style={{ color: waiting === 1 ? 'var(--berry)' : '#a15c00' }}>
                {me.state === 'pending' && waiting === 1
                  ? 'Всё зависит от вас — остальные уже согласны'
                  : `Осталось ${timeLeft(chain.expiresAt)}`}
              </span>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 16 }}>
          {me.gives && (
            <div className="row gap12">
              <Photo label={me.gives.title} url={me.gives.photoUrl} cat="gadget" style={{ width: 60, height: 60, borderRadius: 14 }} />
              <div className="col" style={{ justifyContent: 'center', gap: 2, flex: 1 }}>
                <span className="cap">Вы отдаёте</span>
                <span className="title">{me.gives.title}</span>
              </div>
            </div>
          )}
          <div className="row gap10" style={{ margin: '12px 0', alignItems: 'center' }}>
            <div className="divider grow" /><Icon name="chevD" size={16} color="var(--berry-200)" /><div className="divider grow" />
          </div>
          <div className="row gap12">
            {me.receives
              ? <Photo label={me.receives.title} url={me.receives.photoUrl} cat="gadget" style={{ width: 60, height: 60, borderRadius: 14 }} />
              : <div className="avatar" style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--ok-soft)' }}><Icon name="wallet" size={26} color="var(--ok)" /></div>}
            <div className="col" style={{ justifyContent: 'center', gap: 2, flex: 1 }}>
              <span className="cap" style={{ color: 'var(--ok)' }}>Вы получаете</span>
              <span className="title">{me.receives ? me.receives.title : `${Math.abs(me.topup || 0)} баллов`}</span>
            </div>
          </div>
        </div>

        <div className="col gap10">
          <span className="over">Как двигаются вещи</span>
          <div className="card-line" style={{ padding: '16px 16px 14px' }}>
            {chain.steps.map((s, i) => <ChainNode key={i} step={s} last={i === chain.steps.length - 1} />)}
            <div className="row gap10" style={{ paddingLeft: 22, marginTop: 2 }}>
              <div style={{ width: 2, height: 22, background: 'var(--berry-200)', borderRadius: 2 }} />
              <span className="row gap6" style={{ color: 'var(--ok)', fontSize: 12.5, fontWeight: 700 }}>
                <Icon name="checkCircle" size={15} color="var(--ok)" />
                {chain.kind === 'credit' ? 'круг закрывается баллами' : 'круг замкнулся — все в плюсе'}
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: 'var(--ok-soft)' }}>
          <div className="row gap10" style={{ alignItems: 'flex-start' }}>
            <Icon name="shield" size={22} color="var(--ok)" />
            <div className="col gap4">
              <span className="title" style={{ color: '#15663f' }}>Цепочка под защитой эскроу</span>
              <span className="sub" style={{ color: '#2c6a48' }}>
                Доплаты замораживаются и уходят получателям только когда все участники отметят передачу. Отказ или истёкшее время — баллы возвращаются.
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <span className="over">Расчёт</span>
          <div className="col gap10" style={{ marginTop: 10 }}>
            <Line label="Стоимость вашего лота" value={me.gives ? <Credit n={me.gives.value} size={14} coin={13} /> : <span className="sub">—</span>} />
            <Line label="Стоимость того, что получаете" value={me.receives ? <Credit n={me.receives.value} size={14} coin={13} /> : <span className="sub">—</span>} />
            <div className="divider" />
            <div className="row" style={{ justifyContent: 'space-between' }}><TopupLine topup={me.topup || 0} /></div>
          </div>
        </div>

        {chain.status === 'active' && <TransferPanel chain={chain} onSent={onSent} onReceived={onReceived} busy={busy} />}
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px) + 28px)', background: 'linear-gradient(to top, var(--bg) 70%, transparent)' }}>
        <ChainActions chain={chain} onStart={onStart} onRespond={onRespond} onOpenChat={onOpenChat} busy={busy} />
      </div>
    </div>
  );
}

function ChainActions({ chain, onStart, onRespond, onOpenChat, busy }) {
  const me = chain.me || {};

  if (chain.status === 'candidate') {
    return (
      <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => onStart(chain)}>
        <Icon name="chain" size={20} color="#fff" />{busy ? 'Отправляем…' : 'Я в деле — позвать остальных'}
      </button>
    );
  }

  if (chain.status === 'pending' && me.state === 'pending') {
    return (
      <div className="col gap8">
        <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => onRespond(chain, true)}>
          <Icon name="check" size={20} color="#fff" />Согласиться
        </button>
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => onRespond(chain, false)}>
          Отказаться
        </button>
      </div>
    );
  }

  if (chain.status === 'pending') {
    return (
      <button className="btn btn-ghost btn-block btn-lg" disabled>
        <Icon name="clock" size={18} color="var(--ink-3)" />Ждём ответа остальных
      </button>
    );
  }

  if (chain.status === 'active' && chain.chatId) {
    return (
      <button className="btn btn-primary btn-block btn-lg" onClick={() => onOpenChat(chain.chatId)}>
        <Icon name="chat" size={20} color="#fff" />Открыть общий чат
      </button>
    );
  }

  return null;
}

// В тройке каждый везёт вещь не тому, от кого получает, поэтому
// подтверждений два: «отдал» на своём звене и «получил» на входящем.
function TransferPanel({ chain, onSent, onReceived, busy }) {
  const me = chain.me || {};
  return (
    <div className="col gap10">
      <span className="over">Передача</span>
      <div className="card col gap12" style={{ padding: 14 }}>
        {me.gives && (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <span className="title ellipsis">Отдать «{me.gives.title}»</span>
              <span className="cap">{chain.steps.find(s => s.isMe)?.toUser.name}</span>
            </div>
            {me.sent
              ? <span className="cap row gap4" style={{ color: 'var(--ok)' }}><Icon name="check" size={13} color="var(--ok)" />отмечено</span>
              : <button className="btn btn-ghost" disabled={busy} onClick={() => onSent(chain)}>Передал</button>}
          </div>
        )}
        <div className="divider" />
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="title ellipsis">Получить {me.receives ? `«${me.receives.title}»` : 'баллы'}</span>
            {/* «Вы» в имени получателя ставит сервер — это и есть входящее звено */}
            <span className="cap">от {chain.steps.find(s => s.toUser.name === 'Вы')?.user.name || 'участника'}</span>
          </div>
          {me.received
            ? <span className="cap row gap4" style={{ color: 'var(--ok)' }}><Icon name="check" size={13} color="var(--ok)" />отмечено</span>
            : <button className="btn btn-ghost" disabled={busy || !me.receives} onClick={() => onReceived(chain)}>Получил</button>}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, bold }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className={bold ? 'title' : 'sub'}>{label}</span>
      {value}
    </div>
  );
}
