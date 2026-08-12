// screen-wallet.jsx — barter-credit wallet
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Coin, Credit, Avatar, AppBar, IconBtn, Sheet } from './ui.jsx';

const TX_ICON = {
  'escrow-in': { icon: 'lock', c: 'var(--berry)', bg: 'var(--berry-50)' },
  spend: { icon: 'swap', c: 'var(--ink-2)', bg: 'var(--line-2)' },
  earn: { icon: 'arrowR', c: 'var(--ok)', bg: 'var(--ok-soft)' },
  bonus: { icon: 'gift', c: 'var(--c-digital)', bg: 'var(--c-digital-soft)' },
};

export function Wallet({ bell = null, wallet, onInfo, onTopUp }) {
  const [topUpOpen, setTopUpOpen] = React.useState(false);
  const w = wallet || { balance: 0, escrow: 0, delta30: 0, demurrageInDays: 0, tx: [] };
  return (
    <div className="app-scroll">
      <AppBar title="Кошелёк" big sub="Бартер-кредиты · 1 Б = 1 ₽" right={<span className="row gap8">{bell}<IconBtn name="info" onClick={onInfo} /></span>} />
      <div className="px col gap16" style={{ paddingBottom: 24 }}>
        <div className="card" style={{ padding: 18, background: 'linear-gradient(140deg, var(--berry), var(--berry-900))', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', right: 20, bottom: -50, width: 110, height: 110, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }} />
          <div className="row gap6" style={{ marginBottom: 6 }}><Coin size={18} /><span style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Бартер-кредиты</span></div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span className="amount" style={{ fontSize: 40, fontWeight: 700, color: '#fff', letterSpacing: '-0.04em' }}>{fmt(w.balance)}</span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Б</span>
          </div>
          <div className="row gap6" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>≈ ₽{fmt(w.balance)} · 1 Б = 1 ₽</span>
          </div>
          <div className="row gap8" style={{ marginTop: 16 }}>
            <div className="grow" style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 13, padding: '10px 12px' }}>
              <div className="row gap6" style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11.5, fontWeight: 600 }}><Icon name="lock" size={13} color="rgba(255,255,255,0.78)" />В эскроу</div>
              <span className="amount" style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmt(w.escrow)}</span>
            </div>
            <div className="grow" style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 13, padding: '10px 12px' }}>
              <div className="row gap6" style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11.5, fontWeight: 600 }}><Icon name="flame" size={13} color="rgba(255,255,255,0.78)" />За 30 дней</div>
              <span className="amount" style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>+{fmt(w.delta30)}</span>
            </div>
          </div>
        </div>

        <div className="row gap10">
          <button className="btn btn-soft grow" style={{ flexDirection: 'column', gap: 6, padding: '13px' }} onClick={() => setTopUpOpen(true)}><Icon name="plusCircle" size={22} color="var(--berry)" /><span style={{ fontSize: 12.5 }}>Пополнить</span></button>
          <button className="btn btn-soft grow" style={{ flexDirection: 'column', gap: 6, padding: '13px' }}><Icon name="send" size={22} color="var(--berry)" /><span style={{ fontSize: 12.5 }}>Перевести</span></button>
          <button className="btn btn-soft grow" style={{ flexDirection: 'column', gap: 6, padding: '13px' }}><Icon name="gift" size={22} color="var(--berry)" /><span style={{ fontSize: 12.5 }}>Пригласить</span></button>
        </div>

        <div className="card" style={{ padding: 13, background: 'var(--warn-soft)' }}>
          <div className="row gap10" style={{ alignItems: 'flex-start' }}>
            <Icon name="clock" size={20} color="var(--warn)" style={{ marginTop: 1 }} />
            <div className="col gap2">
              <span className="title" style={{ fontSize: 13.5, color: '#7a5410' }}>Баллы любят движение</span>
              <span className="sub" style={{ color: '#8a6320' }}>Неактивные баллы начнут таять через <b>{w.demurrageInDays} дней</b>. Потратьте их на обмен, чтобы сохранить полную ценность.</span>
            </div>
          </div>
        </div>

        <div className="col gap10">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="h3">История</span>
            <span className="cap" style={{ color: 'var(--berry)' }}>Все операции</span>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {(w.tx || []).map((t, i) => {
              const s = TX_ICON[t.kind] || TX_ICON.earn;
              return (
                <div key={t.id || i} className="row gap12" style={{ padding: '13px 14px', borderTop: i ? '1px solid var(--line)' : 'none', alignItems: 'center' }}>
                  <div className="avatar" style={{ width: 38, height: 38, background: s.bg }}><Icon name={s.icon} size={18} color={s.c} /></div>
                  <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
                    <span className="title ellipsis" style={{ fontSize: 14 }}>{t.title}</span>
                    <span className="cap ellipsis">{t.sub}</span>
                  </div>
                  <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <span className="amount" style={{ fontSize: 14.5, fontWeight: 700, color: t.amt > 0 ? (t.status === 'held' ? 'var(--berry)' : 'var(--ok)') : 'var(--ink)' }}>{t.status === 'held' ? '' : (t.amt > 0 ? '+' : '')}{fmt(t.amt)}</span>
                    <span className="cap" style={{ fontSize: 10.5 }}>{t.status === 'held' ? 'заморожено' : t.when}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <TopUpSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} onTopUp={onTopUp} balance={w.balance} />
    </div>
  );
}

const TOPUP_CHIPS = [5000, 10000, 25000, 50000];

export function TopUpSheet({ open, onClose, onTopUp, balance }) {
  const [amount, setAmount] = React.useState(10000);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => { if (open) { setError(''); setBusy(false); } }, [open]);

  const submit = async () => {
    if (busy) return;
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (n <= 0) return setError('Укажите сумму');
    setBusy(true);
    setError('');
    try {
      const res = await onTopUp(n);
      if (!res || !res.ok) { setError((res && res.error) || 'Не удалось пополнить'); setBusy(false); return; }
      onClose();
    } catch (e) {
      console.error('top up failed', e);
      setError('Не удалось пополнить — обновите страницу и попробуйте ещё раз');
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Пополнить кошелёк">
      <div className="px col gap14" style={{ paddingBottom: 10 }}>
        <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
          <span className="amount" style={{ fontSize: 34, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.03em' }}>{fmt(Number(amount) || 0)}</span>
          <span style={{ fontSize: 15, color: 'var(--ink-3)', fontWeight: 600 }}>Б ≈ ₽{fmt(Number(amount) || 0)}</span>
        </div>
        <div className="row gap8" style={{ flexWrap: 'wrap' }}>
          {TOPUP_CHIPS.map(c => (
            <div key={c} className={'chip chip-berry' + (Number(amount) === c ? ' is-on' : '')} onClick={() => { setAmount(String(c)); setError(''); }}>{fmt(c)} Б</div>
          ))}
        </div>
        <div className="col gap6">
          <label className="cap">Своя сумма</label>
          <input
            type="number" inputMode="numeric" min="0" step="500"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Например: 20000"
            style={{ width: '100%', padding: '13px 16px', border: '1.5px solid var(--line)', borderRadius: 14, fontSize: 15, fontFamily: 'var(--font)', background: '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div className="card" style={{ padding: 12, background: 'var(--berry-50)' }}>
          <span className="sub">Сейчас баллы начисляются сразу (тестовый режим). Подключение реальной оплаты — позже. Баланс после пополнения: <b className="amount">{fmt(balance + (Number(amount) || 0))} Б</b></span>
        </div>
        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--berry-50)', border: '1px solid var(--berry-200)', color: 'var(--berry-700)', fontSize: 13.5, fontWeight: 500 }}>{error}</div>}
        <button className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>
          {busy ? <><span className="spin" />Пополняем…</> : <><Icon name="plus" size={18} color="#fff" />Пополнить</>}
        </button>
      </div>
    </Sheet>
  );
}

export function CreditsInfo({ open, onClose }) {
  const rows = [
    { icon: 'shield', t: 'Обеспечены реально', d: '1 балл = 1 ₽ рыночной стоимости. Эмиссия только в момент реального обмена.' },
    { icon: 'lock', t: 'Защищены эскроу', d: 'Баллы замораживаются до подтверждения получения вещи.' },
    { icon: 'ai', t: 'AI-оценка', d: 'Ориентир по похожим объявлениям — точную стоимость договариваетесь в чате.' },
    { icon: 'gift', t: 'Бонусы лояльности', d: 'Юридически — программа лояльности (как Плюс или Спасибо), а не валюта.' },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Что такое бартер-кредиты">
      <div className="px col gap14" style={{ paddingBottom: 10 }}>
        {rows.map((r, i) => (
          <div key={i} className="row gap12" style={{ alignItems: 'flex-start' }}>
            <div className="avatar" style={{ width: 40, height: 40, background: 'var(--berry-50)', flex: 'none' }}><Icon name={r.icon} size={20} color="var(--berry)" /></div>
            <div className="col gap2"><span className="title">{r.t}</span><span className="sub">{r.d}</span></div>
          </div>
        ))}
        <button className="btn btn-primary btn-block btn-lg" onClick={onClose}>Понятно</button>
      </div>
    </Sheet>
  );
}
