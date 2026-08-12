// screen-lot.jsx — lot detail + AI valuation + make-offer flow
import React from 'react';
import { Icon } from './icons.jsx';
import { fmt, Credit, Photo, Avatar, Stars, CatTag, AIBadge, IconBtn, Sheet, timeAgo, fmtDateTime } from './ui.jsx';
import { trackLotViewAction, reportLotAction } from './server/actions.js';
import { REPORT_REASONS } from './reports.js';

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

function AIValuation({ L }) {
  const pct = Math.max(6, Math.min(94, ((L.value - L.aiLow) / (L.aiHigh - L.aiLow)) * 100));
  const isAi = L.valuationSource === 'ai';
  return (
    <div className="card" style={{ padding: 15, border: '1px solid var(--berry-100)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="row gap6">{isAi ? <AIBadge>AI-оценка</AIBadge> : <span className="tag" style={{ background: 'var(--line-2)', color: 'var(--ink-2)' }}>Оценка автора</span>}</span>
        <span className="cap row gap4"><Icon name="checkCircle" size={13} color="var(--ok)" />ориентир</span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <Credit n={L.value} size={26} coin={22} />
        <span className="sub">≈ ₽{fmt(L.value)}</span>
      </div>
      <span className="sub">{isAi ? 'Ориентир по похожим объявлениям — точную стоимость согласуйте в чате.' : 'Цену назначил автор объявления. Обсудите доплату баллами в чате.'}</span>
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

// Ссылка на объявление — тот же адрес, по которому его открывает роутер.
function lotLink(lotId) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}#/lot/${encodeURIComponent(lotId)}`;
}

export function LotDetail({ lotId, onBack, onOffer, onOwnerChat, onOpenLot, onEdit, lots, myLots = [], fav = false, onToggleFav }) {
  // Лента не содержит собственных объявлений (listLots исключает свои), поэтому
  // при открытии своего лота из «Моих объявлений» карточка не находилась и
  // экран оставался пустым. Ищем в обоих списках.
  const L = (lots || []).find(l => l.id === lotId)
    || (myLots || []).find(l => l.id === lotId)
    || null;
  const isMine = !!L && (myLots || []).some(l => l.id === L.id);
  const [g, setG] = React.useState(0);
  const [views, setViews] = React.useState(null);
  const [shared, setShared] = React.useState('');
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportReason, setReportReason] = React.useState('forbidden');
  const [reportText, setReportText] = React.useState('');
  const [reportDone, setReportDone] = React.useState('');

  const share = async () => {
    const url = lotLink(lotId);
    const title = L ? L.title : 'Объявление';
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShared('Ссылка скопирована');
      setTimeout(() => setShared(''), 2000);
    } catch (e) {
      // отмена шаринга — не ошибка, показывать нечего
    }
  };

  // Просмотр засчитывается один раз на открытие карточки; свои лоты сервер
  // не считает, чтобы автор не накручивал себе счётчик.
  React.useEffect(() => {
    if (!lotId) return;
    let cancelled = false;
    trackLotViewAction(lotId)
      .then(r => { if (!cancelled && r && typeof r.views === 'number') setViews(r.views); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [lotId]);
  if (!L) return null;
  const urls = (L.photoUrls || []).filter(Boolean);
  const shownUrl = urls[Math.min(g, Math.max(0, urls.length - 1))] || L.photoUrl;
  // «Хочу взамен» автор пишет одной строкой через запятую — показываем чипами,
  // так видно сразу, подходит ли то, что есть у вас.
  const wants = (L.wants || '').split(/[,;]/).map(w => w.trim()).filter(Boolean).slice(0, 12);
  const ownerLots = (lots || [])
    .filter(x => x.ownerId && x.ownerId === L.ownerId && x.id !== L.id)
    .slice(0, 8);
  const owner = {
    name: L.ownerName || '',
    city: L.ownerCity || '',
    avatar: L.ownerAvatar || '',
    rating: L.ownerRating ?? 0,
    reviews: L.ownerReviews ?? 0,
    deals: L.ownerDeals ?? 0,
  };

  return (
    <div className="app-scroll">
      <div style={{ position: 'relative' }}>
        <div style={{ cursor: urls.length > 1 ? 'pointer' : 'default' }} onClick={() => urls.length > 1 && setG(x => (x + 1) % urls.length)}>
          <Photo label={L.photo} url={shownUrl} cat={L.cat} style={{ aspectRatio: '1/1' }} full fit="contain" />
        </div>
        <div style={{ position: 'absolute', top: 'calc(8px + 48px)', left: 14, right: 14 }} className="row" >
          <IconBtn name="back" onClick={onBack} />
          <div className="grow" />
          <div className="row gap8">
            <IconBtn name="heart" fill={fav ? 'currentColor' : 'none'} onClick={onToggleFav} />
            <IconBtn name="send" onClick={share} />
          </div>
        </div>
        {urls.length > 1 && (
          <div className="row gap6" style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)' }}>
            {urls.map((_, i) => (
              <span key={i} style={{ width: i === g ? 18 : 6, height: 6, borderRadius: 999, background: i === g ? 'var(--berry)' : 'rgba(255,255,255,0.8)', transition: 'all .2s', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setG(i); }} />
            ))}
          </div>
        )}
        {urls.length > 1 && (
          <span style={{ position: 'absolute', bottom: 12, right: 14, padding: '3px 9px', borderRadius: 999, background: 'rgba(28,12,18,0.55)', color: '#fff', fontSize: 11.5, fontWeight: 700, backdropFilter: 'blur(4px)' }}>{g + 1} / {urls.length}</span>
        )}
      </div>

      <div className="px col gap16" style={{ paddingTop: 16, paddingBottom: 20 }}>
        <div className="col gap8">
          <div className="row gap6"><CatTag cat={L.cat} /><span className="tag" style={{ background: 'var(--line-2)', color: 'var(--ink-2)' }}>{L.condition}</span>{L.hot && <span className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)' }}><Icon name="flame" size={12} color="var(--berry)" />Хит</span>}</div>
          <span className="h2">{L.title}</span>
          <div className="row gap10 cap"><span className="row gap4"><Icon name="eye" size={14} color="var(--ink-3)" />{views ?? L.views ?? 0}</span><span className="row gap4"><Icon name="map" size={14} color="var(--ink-3)" />{owner.city}</span><span title={fmtDateTime(L.createdAt)}>{timeAgo(L.createdAt) || L.posted}</span></div>
        </div>

        <AIValuation L={L} />

        <div className="card" style={{ padding: 14 }}>
          <div className="row gap8" style={{ marginBottom: 8 }}><Icon name="swap" size={18} color="var(--berry)" /><span className="title">Готов(а) обменять на</span></div>
          {wants.length ? (
            <div className="row gap6" style={{ flexWrap: 'wrap' }}>
              {wants.map(w => <span key={w} className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry-700)' }}>{w}</span>)}
            </div>
          ) : (
            <span className="sub">Автор не указал — предложите свой вариант в чате.</span>
          )}
        </div>

        <div className="col gap6">
          <span className="over">Описание</span>
          <span className="body" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{L.desc || 'Описания нет — спросите детали у автора.'}</span>
        </div>

        <div className="card" style={{ padding: 14 }} onClick={onOwnerChat}>
          <div className="row gap12">
            <Avatar user={owner.name} url={owner.avatar} size={46} />
            <div className="grow col" style={{ gap: 3 }}>
              <span className="title">{owner.name}</span>
              <span className="row gap6"><Stars value={owner.rating} count={owner.reviews} />{owner.reviews > 0 && <span className="cap">{owner.rating.toFixed(1)} · {owner.deals} сделок</span>}</span>
              <span className="cap">{owner.city}{ownerLots.length ? ` · ещё ${ownerLots.length} ${plural(ownerLots.length, 'объявление', 'объявления', 'объявлений')}` : ''}</span>
            </div>
            <Icon name="chevR" size={20} color="var(--ink-3)" />
          </div>
        </div>

        {ownerLots.length > 0 && (
          <div className="col gap8">
            <span className="over">Другие объявления автора</span>
            <div className="row gap10" style={{ overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
              {ownerLots.map(x => (
                <div key={x.id} className="card" style={{ flex: 'none', width: 132, overflow: 'hidden', cursor: 'pointer' }} onClick={() => onOpenLot && onOpenLot(x.id)}>
                  <Photo label={x.photo} url={x.photoUrl} cat={x.cat} style={{ width: '100%', aspectRatio: '1/1' }} />
                  <div className="col gap4" style={{ padding: '8px 9px 10px' }}>
                    <span className="cap ellipsis">{x.title}</span>
                    <Credit n={x.value} size={13} coin={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row gap10" style={{ padding: '0 2px' }}>
          <Icon name="shield" size={18} color="var(--ink-3)" style={{ flex: 'none' }} />
          <span className="cap" style={{ lineHeight: 1.5 }}>Договаривайтесь и платите только внутри Дайбери: доплата замораживается в эскроу и уходит партнёру после подтверждения обеими сторонами.</span>
        </div>

        {!isMine && (
          <button
            className="row gap6"
            onClick={() => { setReportDone(''); setReportOpen(true); }}
            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', alignSelf: 'flex-start', color: 'var(--ink-3)', fontFamily: 'var(--font)', fontSize: 13 }}
          >
            <Icon name="info" size={15} color="var(--ink-3)" />Пожаловаться на объявление
          </button>
        )}
      </div>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Пожаловаться">
        <div className="px col gap12" style={{ paddingBottom: 8 }}>
          {reportDone ? (
            <>
              <span className="body">{reportDone}</span>
              <button className="btn btn-primary btn-block btn-lg" onClick={() => setReportOpen(false)}>Понятно</button>
            </>
          ) : (
            <>
              <span className="sub" style={{ lineHeight: 1.5 }}>Мы посмотрим объявление. Если оно нарушает правила — скроем, а автору объясним причину.</span>
              <div className="col gap6">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setReportReason(r.id)}
                    className="row gap8"
                    style={{
                      padding: '11px 13px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      border: '1.5px solid ' + (reportReason === r.id ? 'var(--berry)' : 'var(--line)'),
                      background: reportReason === r.id ? 'var(--berry-50)' : '#fff',
                      fontFamily: 'var(--font)', fontSize: 14.5, color: 'var(--ink)',
                    }}
                  >
                    <Icon name={reportReason === r.id ? 'checkCircle' : 'info'} size={17} color={reportReason === r.id ? 'var(--berry)' : 'var(--ink-3)'} />
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                value={reportText}
                onChange={e => setReportText(e.target.value)}
                maxLength={600}
                rows={3}
                placeholder="Что именно не так — необязательно"
                style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', fontSize: 15, fontFamily: 'var(--font)', outline: 'none', background: 'var(--bg)', resize: 'vertical', lineHeight: 1.4 }}
              />
              <button
                className="btn btn-primary btn-block btn-lg"
                onClick={async () => {
                  const res = await reportLotAction(lotId, reportReason, reportText);
                  setReportText('');
                  setReportDone(res?.ok
                    ? (res.duplicate ? 'Вы уже жаловались на это объявление — мы помним.' : 'Спасибо, жалоба у нас. Посмотрим в ближайшее время.')
                    : (res?.error || 'Не получилось отправить'));
                }}
              >Отправить жалобу</button>
              <button className="btn btn-soft btn-block" onClick={() => setReportOpen(false)}>Отмена</button>
            </>
          )}
        </div>
      </Sheet>

      {shared && <div className="snack" role="status">{shared}</div>}

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px) + 28px)', background: 'linear-gradient(to top, var(--bg) 72%, transparent)', display: 'flex', gap: 10 }}>
        {isMine ? (
          <button className="btn btn-soft btn-block btn-lg" onClick={() => (onEdit ? onEdit(L) : onBack())}>
            <Icon name="edit" size={20} color="var(--ink)" />Редактировать объявление
          </button>
        ) : (
          <>
            <button className="btn btn-soft" style={{ flex: 'none', padding: '14px 16px' }} onClick={onOwnerChat}><Icon name="chat" size={20} color="var(--ink)" /></button>
            <button className="btn btn-primary grow btn-lg" onClick={() => onOffer(L)}><Icon name="swap" size={20} color="#fff" />Предложить обмен</button>
          </>
        )}
      </div>
    </div>
  );
}

export function OfferSheet({ L, myLots = [], balance = 0, open, onClose, onConfirm }) {
  const [selId, setSelId] = React.useState(null);
  const MY = (myLots || []).find(x => x.id === selId) || myLots[0] || null;
  const diff = L ? L.value - (MY ? MY.value : 0) : 0;
  const [credits, setCredits] = React.useState(0);
  React.useEffect(() => {
    if (L) {
      if (myLots.length && !myLots.some(x => x.id === selId)) setSelId(myLots[0].id);
      setCredits(Math.max(0, diff));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, MY && MY.value, myLots]);
  if (!L) return null;
  const balanced = (MY ? MY.value : 0) + credits;
  const ok = Math.abs(balanced - L.value) <= L.value * 0.12;
  const enough = credits <= balance;
  const canConfirm = enough && ok;

  return (
    <Sheet open={open} onClose={onClose} title="Предложить обмен">
      <div className="px col gap14" style={{ paddingBottom: 8 }}>

        {myLots.length > 1 && (
          <div className="col gap6">
            <span className="cap">Чем меняетесь</span>
            <div className="row gap8" style={{ overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
              {myLots.map(x => (
                <div key={x.id} onClick={() => { setSelId(x.id); setCredits(Math.max(0, L.value - x.value)); }}
                  style={{
                    flex: 'none', width: 84, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    border: '1.5px solid ' + (MY && MY.id === x.id ? 'var(--berry)' : 'var(--line)'),
                    background: MY && MY.id === x.id ? 'var(--berry-50)' : '#fff', transition: 'all .15s',
                  }}>
                  <Photo label={x.photo} url={x.photoUrl} cat={x.cat} style={{ width: '100%', aspectRatio: '1/1' }} />
                  <div className="col" style={{ padding: '6px 7px', gap: 2 }}>
                    <span className="cap ellipsis" style={{ fontSize: 10.5 }}>{x.title}</span>
                    <Credit n={x.value} size={12} coin={11} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <div className="card-line grow col gap6" style={{ padding: 10, alignItems: 'center' }}>
            {MY ? (
              <Photo label={MY.photo} url={MY.photoUrl} cat={MY.cat} style={{ width: '100%', aspectRatio: '4/3', borderRadius: 10 }} />
            ) : (
              <div className="col" style={{ width: '100%', aspectRatio: '4/3', borderRadius: 10, background: 'var(--line-2)', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Icon name="plus" size={22} color="var(--ink-3)" />
                <span className="cap" style={{ textAlign: 'center', padding: '0 8px' }}>нет своего объявления</span>
              </div>
            )}
            <span className="cap" style={{ textAlign: 'center' }}>Вы отдаёте</span>
            <span className="title" style={{ fontSize: 12.5, textAlign: 'center' }}>{MY ? MY.title : '—'}</span>
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
            <span className="cap" style={{ color: enough ? (ok ? 'var(--ok)' : 'var(--warn)') : 'var(--warn)' }}>
              {!enough ? 'недостаточно баллов' : (ok ? '✓ обмен сбалансирован' : 'разница великовата')}
            </span>
          </div>
        </div>

        <div className="row gap10" style={{ padding: '0 2px' }}>
          <Icon name="lock" size={18} color="var(--ink-3)" />
          <span className="sub">Ваши <b className="amount">{fmt(credits)} Б</b> спишутся с баланса и заморозятся в эскроу. Партнёр получит их только после подтверждения обеих сторон.</span>
        </div>

        <button className="btn btn-primary btn-block btn-lg" disabled={!canConfirm} onClick={() => onConfirm(L, credits, MY ? MY.id : null)} style={{ opacity: canConfirm ? 1 : 0.5 }}>
          <Icon name="shield" size={20} color="#fff" />Открыть сделку · заморозить <Credit n={credits} size={15} coin={14} color="#fff" />
        </button>
        {!enough && <span className="cap" style={{ textAlign: 'center', color: 'var(--warn)' }}>Пополните кошелёк, чтобы заблокировать доплату</span>}
      </div>
    </Sheet>
  );
}

const stepBtn = { width: 30, height: 30, borderRadius: 9, border: '1px solid var(--berry-200)', background: '#fff', color: 'var(--berry)', fontSize: 19, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
