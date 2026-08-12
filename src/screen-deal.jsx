// screen-deal.jsx — escrow deal status + confirm-receipt
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Credit, Photo, Avatar, AppBar, IconBtn, Sheet } from './ui.jsx';

const DEAL_STEPS = [
  { id: 'created', label: 'Сделка создана', sub: 'Баллы заморожены в эскроу' },
  { id: 'meet',    label: 'Передача вещей',  sub: 'Личная встреча или доставка' },
  { id: 'confirm', label: 'Подтверждение',  sub: 'Обе стороны подтверждают получение' },
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

export function DealStatus({ deal, onBack, onConfirm, onCancel, onChat, onDone, onRate }) {
  if (!deal) return null;
  const L = deal.lot || {};
  const { credits, stage, role } = deal;
  const owner = { name: deal.partnerName || deal.ownerName || '', avatar: deal.partnerAvatar || '' };
  const [confirming, setConfirming] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  if (stage === 'done') return <DealDone deal={deal} onDone={onDone} onRate={onRate} />;

  const isPartner = role === 'partner';
  const my = deal.myLot || { title: '', photo: '', photoUrl: '', cat: 'gadget' };
  const myConfirmed = isPartner ? deal.partnerConfirmed : deal.initiatorConfirmed;
  const partnerConfirmed = isPartner ? deal.initiatorConfirmed : deal.partnerConfirmed;
  const give = isPartner ? L : my;
  const receive = isPartner ? my : L;
  const giveEmpty = !give || !give.title;

  return (
    <div className="app-scroll">
      <AppBar sub="Сделка · эскроу" title="Обмен в работе" left={<IconBtn name="back" onClick={onBack} />} right={<IconBtn name="chat" onClick={onChat} />} />
      <div className="px col gap16" style={{ paddingBottom: 30 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Photo label={giveEmpty ? 'ВЕЩЬ' : give.photo} url={give.photoUrl} cat={give.cat || 'gadget'} style={{ width: 58, height: 58, borderRadius: 13 }} />
            <div className="col grow" style={{ gap: 2 }}><span className="cap">вы отдаёте</span><span className="title" style={{ fontSize: 13.5 }}>{giveEmpty ? 'без своего объявления' : give.title}</span></div>
          </div>
          <div className="row gap8" style={{ alignItems: 'center', margin: '10px 0' }}><div className="divider grow" /><Icon name="swap" size={18} color="var(--berry)" /><div className="divider grow" /></div>
          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <Photo label={receive.photo || 'ВЕЩЬ'} url={receive.photoUrl} cat={receive.cat || 'gadget'} style={{ width: 58, height: 58, borderRadius: 13 }} />
            <div className="col grow" style={{ gap: 2 }}><span className="cap" style={{ color: 'var(--ok)' }}>вы получаете</span><span className="title" style={{ fontSize: 13.5 }}>{receive.title || '—'}</span></div>
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
            {isPartner
              ? <>Партнёр отдаёт <b style={{ color: '#fff' }}>{fmt(credits)} Б</b> — они придут вам, когда обе стороны подтвердят получение.</>
              : <>Партнёр получит <b style={{ color: '#fff' }}>{fmt(credits)} Б</b> после подтверждения обеих сторон. Если вещь не та — откройте спор, и баллы вернутся вам.</>}
          </span>
        </div>

        <div className="card" style={{ padding: '16px 16px 2px' }}>
          <span className="over" style={{ display: 'block', marginBottom: 14 }}>Статус сделки</span>
          <Stepper active={stage} />
        </div>

        <div className="card" style={{ padding: 14 }}>
          <span className="over">Подтверждение обеих сторон</span>
          <div className="col gap8" style={{ marginTop: 10 }}>
            <div className="row gap8" style={{ alignItems: 'center' }}>
              <Icon name={myConfirmed ? 'checkCircle' : 'clock'} size={17} color={myConfirmed ? 'var(--ok)' : 'var(--ink-3)'} />
              <span className="sub" style={{ color: myConfirmed ? 'var(--ink)' : 'var(--ink-2)' }}>Вы — {myConfirmed ? 'подтвердили получение' : 'ещё не подтвердили'}</span>
            </div>
            <div className="row gap8" style={{ alignItems: 'center' }}>
              <Icon name={partnerConfirmed ? 'checkCircle' : 'clock'} size={17} color={partnerConfirmed ? 'var(--ok)' : 'var(--ink-3)'} />
              <span className="sub" style={{ color: partnerConfirmed ? 'var(--ink)' : 'var(--ink-2)' }}>{partnerConfirmed ? 'Партнёр подтвердил получение' : 'Партнёр ещё не подтвердил'}</span>
            </div>
          </div>
        </div>

        <div className="row gap12 card" style={{ padding: 12, alignItems: 'center' }} onClick={onChat}>
          <Avatar user={owner.name} url={owner.avatar} size={42} />
          <div className="col grow" style={{ gap: 2 }}><span className="title">{owner.name}</span><span className="cap">обычно отвечает за 5 минут</span></div>
          <button className="btn btn-ghost" style={{ padding: '10px 14px' }}><Icon name="chat" size={18} color="var(--berry)" />Чат</button>
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px) + 28px)', background: 'linear-gradient(to top, var(--bg) 72%, transparent)' }}>
        {myConfirmed ? (
          <button className="btn btn-block btn-lg" disabled style={{ background: 'var(--line-2)', color: 'var(--ink-3)', cursor: 'default' }}>
            <Icon name="clock" size={20} color="var(--ink-3)" />{partnerConfirmed ? 'Сделка завершена' : 'Ждём подтверждение партнёра'}
          </button>
        ) : partnerConfirmed ? (
          <>
            <div className="card" style={{ padding: 12, background: 'var(--ok-soft)', marginBottom: 10 }}>
              <span className="sub" style={{ color: '#15663f' }}><Icon name="checkCircle" size={16} color="var(--ok)" style={{ display: 'inline' }} /> Партнёр подтвердил получение. Подтвердите и вы — эскроу разморозится.</span>
            </div>
            <button className="btn btn-primary btn-block btn-lg" onClick={() => setConfirming(true)}>
              <Icon name="checkCircle" size={20} color="#fff" />Подтвердить получение
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-block btn-lg" onClick={() => setConfirming(true)}>
            <Icon name="checkCircle" size={20} color="#fff" />Подтвердить получение
          </button>
        )}
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Подтвердить получение?">
        <div className="px col gap14" style={{ paddingBottom: 8 }}>
          <span className="body">Подтверждайте, только когда получили и проверили вещь. После подтверждения обеими сторонами {isPartner ? <b>{fmt(credits)} Б</b> : <>эскроу разморозится и <b>{fmt(credits)} Б</b> уйдут партнёру</>}.</span>
          <div className="card" style={{ padding: 12, background: 'var(--warn-soft)' }}>
            <span className="row gap8 sub" style={{ color: '#7a5410' }}><Icon name="shield" size={18} color="var(--warn)" />Что-то не так? Откройте спор — баллы останутся замороженными до решения.</span>
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => { setConfirming(false); onConfirm(); }}><Icon name="check" size={20} color="#fff" />Да, всё получил(а)</button>
          <button className="btn btn-soft btn-block" onClick={() => { setConfirming(false); setCancelling(true); }}>Отменить сделку</button>
        </div>
      </Sheet>

      <Sheet open={cancelling} onClose={() => setCancelling(false)} title="Отменить сделку?">
        <div className="px col gap14" style={{ paddingBottom: 8 }}>
          <span className="body">Отмена возможна, пока никто не подтвердил получение. {credits > 0 ? <>Замороженные <b className="amount">{fmt(credits)} Б</b> вернутся на ваш баланс.</> : 'Доплаты нет — сделка просто закроется.'}</span>
          <div className="card" style={{ padding: 12, background: 'var(--warn-soft)' }}>
            <span className="row gap8 sub" style={{ color: '#7a5410' }}><Icon name="shield" size={18} color="var(--warn)" />Если вещь уже передана — лучше договориться в чате, а не отменять сделку.</span>
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => { setCancelling(false); onCancel(); }}><Icon name="close" size={20} color="#fff" />Да, отменить</button>
          <button className="btn btn-soft btn-block" onClick={() => setCancelling(false)}>Оставить сделку</button>
        </div>
      </Sheet>
    </div>
  );
}

// Оценка партнёра после обмена. Без этого экрана рейтинг остаётся нулевым
// у всех: отзыв больше негде оставить.
export function RateSheet({ open, onClose, partnerName, onSubmit }) {
  const [stars, setStars] = React.useState(0);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) { setStars(0); setText(''); setError(''); setBusy(false); }
  }, [open]);

  const HINTS = ['', 'Всё плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];

  const send = async () => {
    if (!stars) return setError('Поставьте оценку');
    setBusy(true); setError('');
    const res = await onSubmit(stars, text);
    setBusy(false);
    if (res && !res.ok) return setError(res.error || 'Не удалось сохранить отзыв');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Как прошёл обмен с ${partnerName || 'партнёром'}?`}>
      <div className="px col gap14" style={{ paddingBottom: 10 }}>
        <div className="col gap6" style={{ alignItems: 'center' }}>
          <div className="row gap8">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                aria-label={`${s} из 5`}
                onClick={() => { setStars(s); setError(''); }}
                style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', lineHeight: 0 }}
              >
                <Icon name="star" size={34} color={s <= stars ? '#f5a623' : 'var(--line)'} />
              </button>
            ))}
          </div>
          <span className="cap" style={{ minHeight: 16 }}>{HINTS[stars]}</span>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Пара слов о партнёре — необязательно"
          rows={3}
          style={{
            width: '100%', resize: 'none', padding: '12px 14px', borderRadius: 14,
            border: '1px solid var(--line)', fontFamily: 'var(--font)', fontSize: 15,
            outline: 'none', background: '#fff', color: 'var(--ink)', boxSizing: 'border-box',
          }}
        />

        {error && <span className="cap" style={{ color: 'var(--berry)' }}>{error}</span>}

        <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={send}>
          {busy ? 'Отправляем…' : 'Отправить отзыв'}
        </button>
      </div>
    </Sheet>
  );
}

function DealDone({ deal, onDone, onRate }) {
  const { credits, role } = deal;
  const L = deal.lot || {};
  const my = deal.myLot || { title: '' };
  const receiveTitle = role === 'partner' ? my.title : L.title;
  const [rating, setRating] = React.useState(false);
  return (
    <div className="app-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="grow col" style={{ alignItems: 'center', justifyContent: 'center', padding: '40px 30px', textAlign: 'center', gap: 16 }}>
        <div className="pop" style={{ width: 96, height: 96, borderRadius: 999, background: 'var(--ok-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 70, height: 70, borderRadius: 999, background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={40} color="#fff" sw={2.6} /></div>
        </div>
        <div className="col gap8 fade-in">
          <span className="h1">Обмен завершён 🎉</span>
          <span className="sub" style={{ maxWidth: 300 }}>{role === 'partner'
            ? <>Вы получили <b style={{ color: 'var(--ink)' }}>{fmt(credits)} Б</b> из эскроу, а ваша вещь у партнёра.</>
            : <>Вы получили <b style={{ color: 'var(--ink)' }}>{receiveTitle || 'вещь'}</b>, а <b className="amount">{fmt(credits)} Б</b> переведены партнёру из эскроу.</>}</span>
        </div>
        <div className="card fade-in" style={{ padding: 14, width: '100%', maxWidth: 320 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Эскроу разморожен</span><Credit n={credits} size={15} coin={14} /></div>
          <div className="divider" style={{ margin: '10px 0' }} />
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Сделок в профиле</span><span className="title" style={{ fontSize: 13 }}>+1</span></div>
        </div>
      </div>
      <div className="px col gap10" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        {deal.reviewed ? (
          <div className="card row gap8" style={{ padding: 14, alignItems: 'center', justifyContent: 'center', background: 'var(--ok-soft)' }}>
            <Icon name="checkCircle" size={18} color="var(--ok)" />
            <span className="sub" style={{ color: '#15663f' }}>Спасибо, вы оценили партнёра</span>
          </div>
        ) : (
          <button className="btn btn-primary btn-block btn-lg" onClick={() => setRating(true)}><Icon name="star" size={18} color="#fff" />Оценить партнёра</button>
        )}
        <button className="btn btn-soft btn-block" onClick={() => onDone('home')}>Вернуться в ленту</button>
      </div>

      <RateSheet
        open={rating}
        onClose={() => setRating(false)}
        partnerName={deal.partnerName}
        onSubmit={(stars, text) => onRate(deal, stars, text)}
      />
    </div>
  );
}
