// web-app.jsx — desktop web layout (Airbnb-inspired)
import React from 'react';
import { CITIES, REMOTE, VLADIMIR_REGION } from './cities.js';
import { CAT, CAT_IDS, catOf, normalizeCat, matchesQuery } from './data.js';
import { Icon } from './icons.jsx';
import { fmt, Logo, Credit, Photo, Avatar, Stars, CatTag, AIBadge } from './ui.jsx';
import { EditProfileSheet, resizeImage, SettingsScreen, FunnelScreen, BroadcastScreen, DisputesScreen, ResetsScreen, ReportsScreen, RulesScreen } from './screen-profile.jsx';
import { updateAvatarAction, broadcastInfoAction } from './server/actions.js';
import { DealStatus } from './screen-deal.jsx';
import { ChatThread } from './screen-chat.jsx';
import { FeedChain, ChainDetail } from './screen-chain.jsx';

// Ссылки ведут в существующие разделы. Прежний набор («Карьера», «Блог»,
// «Арендовать на день») достался от шаблона: все двенадцать пунктов гасили
// клик и ничего не открывали.
const FOOTER_COLS = [
  { h: 'Обмен', links: [
    { label: 'Лента объявлений', to: 'home' },
    { label: 'Цепочки обмена', to: 'chains' },
    { label: 'Разместить объявление', act: 'create' },
  ] },
  { h: 'Правила и помощь', links: [
    { label: 'Правила сервиса', act: 'rules' },
    { label: 'Что нельзя менять', act: 'rules' },
    { label: 'Настройки аккаунта', act: 'settings', auth: true },
  ] },
  { h: 'Дайбери', links: [
    { label: 'Студия ПРИЗМАТИКА', href: 'https://prismatica.agency/' },
  ] },
];

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d} ${months[(m || 1) - 1]}`;
}

// ---------------- top nav ----------------
function WebNav({ view, setView, user, avatar, query, setQuery, onLogout, onCreate, authed = true, onAuthRequired, chatUnread = 0, unread = 0, onBell, isAdmin = false, onSettings, onBroadcast }) {
  const [menu, setMenu] = React.useState(false);
  const [q, setQ] = React.useState(query || '');
  const tabs = [
    { id: 'home', label: 'Обмен', title: 'Лента объявлений: вещи и услуги на обмен' },
    // «Цепочки» без пояснения читаются как жаргон: подпись объясняет механику
    { id: 'chains', label: 'Цепочки', title: 'Круговой обмен на троих, когда прямой не сходится' },
    { id: 'mylots', label: 'Мои объявления', title: 'Ваши товары и услуги', auth: true },
    { id: 'favorites', label: 'Избранное', auth: true },
    { id: 'deals', label: 'Сделки', badge: chatUnread, auth: true },
    // «Профиль» живёт в меню под аватаром — там его и ищут
  ];
  const goTab = (id) => {
    if (!authed && (id === 'deals' || id === 'profile' || id === 'favorites' || id === 'mylots')) {
      onAuthRequired && onAuthRequired('Войдите, чтобы открыть этот раздел');
      return;
    }
    setView(id);
    setMenu(false);
  };
  const submit = (e) => { e.preventDefault(); setQuery(q); setView('home'); };
  return (
    <nav className="web-nav">
      <div className="web-nav-inner">
        <div className="web-logo" onClick={() => goTab('home')}>
          <Logo size={30} />Дайбери
        </div>
        <div className="web-tabs">
          {tabs.filter(t => authed || !t.auth).map(t => (
            <button key={t.id} className={'web-tab' + (view === t.id ? ' is-on' : '')} title={t.title || ''} onClick={() => goTab(t.id)}>
              {t.label}
              {t.badge ? <span className="web-new" style={{ background: 'var(--berry)', color: '#fff' }}>{t.badge > 99 ? '99+' : t.badge}</span> : null}
            </button>
          ))}
        </div>
        {/* На главной большой поиск в шапке ленты — второе поле в навигации
            только съедало ширину строки и заставляло её разъезжаться. */}
        <form className="web-search-pill" onSubmit={submit} style={view === 'home' ? { display: 'none' } : undefined}>
          <Icon name="search" size={17} color="var(--ink-3)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Что ищете для обмена?" />
          <button type="submit" className="web-search-orb"><Icon name="search" size={17} color="#fff" /></button>
        </form>
        <div className="web-nav-right" style={{ position: 'relative' }}>
          <button className="btn btn-primary web-nav-create" onClick={onCreate}><Icon name="plus" size={18} color="#fff" />Разместить объявление</button>
          {/* Гостю аватар с буквой врал, что он уже вошёл, а после регистрации
              ничего не менялось. Теперь до входа тут кнопка, после — имя и фото. */}
          {authed ? (
            <>
              <button className="web-bell" onClick={onBell} aria-label="Уведомления" title="Уведомления">
                <Icon name="bell" size={19} color="var(--ink)" />
                {unread ? <span className="web-bell-badge">{unread > 99 ? '99+' : unread}</span> : null}
              </button>
              <button className="web-account" onClick={() => setMenu(m => !m)} title={user?.name || 'Аккаунт'}>
                <div className="web-account-avatar">
                  {avatar ? <img src={avatar} alt="" /> : (user?.name || '?').charAt(0).toUpperCase()}
                </div>
                <span className="web-account-name">{(user?.name || '').split(' ')[0]}</span>
                <Icon name="chevD" size={16} color="var(--ink-2)" />
              </button>
            </>
          ) : (
            <button className="btn btn-soft web-nav-login" onClick={() => onAuthRequired && onAuthRequired('Войдите или зарегистрируйтесь')}>
              <Icon name="user" size={17} color="var(--ink)" />Войти
            </button>
          )}
          {menu && authed && (
            <div className="web-drop">
              <button className="web-drop-item" onClick={() => goTab('profile')}><Icon name="user" size={17} color="var(--ink-2)" />Профиль</button>
              <button className="web-drop-item" onClick={() => goTab('mylots')}><Icon name="grid" size={17} color="var(--ink-2)" />Мои объявления</button>
              <button className="web-drop-item" onClick={() => goTab('deals')}><Icon name="chat" size={17} color="var(--ink-2)" />Мои сделки</button>
              <button className="web-drop-item" onClick={() => goTab('favorites')}><Icon name="heart" size={17} color="var(--ink-2)" />Избранное</button>
              <div className="web-drop-sep" />
              <button className="web-drop-item" onClick={() => { setMenu(false); onSettings && onSettings(); }}><Icon name="settings" size={17} color="var(--ink-2)" />Настройки</button>
              {isAdmin && (
                <button className="web-drop-item" onClick={() => { setMenu(false); onBroadcast && onBroadcast(); }}><Icon name="send" size={17} color="var(--ink-2)" />Рассылка</button>
              )}
              <div className="web-drop-sep" />
              <button className="web-drop-item danger" onClick={() => { setMenu(false); onLogout(); }}><Icon name="close" size={17} color="var(--berry-700)" />Выйти</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

// ---------------- footer ----------------
function WebFooter({ authed = true, onTab, onCreate, onRules, onSettings }) {
  const run = (l) => {
    if (l.to) return onTab && onTab(l.to);
    if (l.act === 'create') return onCreate && onCreate();
    if (l.act === 'rules') return onRules && onRules();
    if (l.act === 'settings') return onSettings && onSettings();
  };
  return (
    <footer className="web-footer">
      <div className="web-footer-inner">
        {FOOTER_COLS.map(c => (
          <div key={c.h} className="web-footer-col">
            <h3>{c.h}</h3>
            {c.links.filter(l => authed || !l.auth).map(l => (l.href
              ? <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>
              : <a key={l.label} href="#" onClick={e => { e.preventDefault(); run(l); }}>{l.label}</a>
            ))}
          </div>
        ))}
      </div>
      <div className="web-legal">
        <span className="row gap6" style={{ flexWrap: 'wrap' }}>
          © 2026 ООО «ПРИЗМАТИКА» · Условия · Конфиденциальность · разработано в студии{' '}
          <a href="https://prismatica.agency/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--berry)', fontWeight: 600 }}>ПРИЗМАТИКА</a>
        </span>
        <div className="web-legal-right">
          <span>🌐 Русский (RU)</span>
          <span>₽ RUB</span>
        </div>
      </div>
    </footer>
  );
}

// ---------------- home ----------------
const CATS = [['all', 'Всё'], ...CAT_IDS.map(id => [id, CAT[id].label])];
// иконку оставляем одну: девять разных значков в строке фильтров только шумят
const CAT_ICON = {};

const bigInputStyle = {
  display: 'block',
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontFamily: 'var(--font)',
  fontSize: 13,
  color: 'var(--ink)',
  padding: 0,
  margin: 0,
  cursor: 'text',
};

function WebLotCard({ L, onOpen, onEdit, fav = false, onToggleFav }) {
  return (
    <div className="web-lot" onClick={() => onOpen(L.id)}>
      <div className="web-lot-photo">
        {/* рамка карточки квадратная — обёртка фото должна её заполнить,
            иначе снизу остаётся полоса фона под широким кадром */}
        <Photo label={L.photo} url={L.photoUrl} cat={L.cat} style={{ position: 'absolute', inset: 0 }} />
        {/* «Хит» убран: флаг hot никто не выставляет — ни код, ни человек.
            Вернуть, когда появится критерий (просмотры, избранное, спрос). */}
        <span className="web-lot-badge" style={{ color: catOf(L.cat).color }}>{catOf(L.cat).label}</span>
        {onEdit && <button className="web-lot-heart" title="Редактировать" onClick={(e) => { e.stopPropagation(); onEdit(L); }}><Icon name="edit" size={15} color="var(--ink-2)" /></button>}
        {onToggleFav && (
          <button
            className="web-lot-heart"
            title={fav ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={fav}
            onClick={(e) => { e.stopPropagation(); onToggleFav(L); }}
          >
            <Icon name="heart" size={17} color={fav ? 'var(--berry)' : 'var(--ink-2)'} fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className="web-lot-meta">
        <span className="web-lot-title">{L.title}</span>
        {L.wants
          ? <span className="web-lot-sub row gap4" style={{ alignItems: 'center' }}><Icon name="swap" size={12} color="var(--ink-3)" /><span className="ellipsis">{L.wants}</span></span>
          : <span className="web-lot-sub">{L.condition}</span>}
        <span className="web-lot-sub row gap6" style={{ alignItems: 'center' }}>
          <Avatar user={L.ownerName} url={L.ownerAvatar} size={16} />
          <span className="ellipsis">{L.ownerCity || ''}</span>
        </span>
        <span className="web-lot-sub">{L.posted}</span>
        <div className="web-lot-price"><Credit n={L.value} size={17} coin={16} /><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>за обмен</span></div>
      </div>
    </div>
  );
}

// Плейсхолдер карточки, пока едет лента.
function WebLotSkeleton() {
  return (
    <div className="web-lot" aria-hidden="true">
      <div className="web-lot-photo"><div className="skel" style={{ position: 'absolute', inset: 0 }} /></div>
      <div className="web-lot-meta">
        <div className="skel" style={{ height: 15, width: '80%', borderRadius: 4 }} />
        <div className="skel" style={{ height: 13, width: '50%', borderRadius: 4 }} />
        <div className="skel" style={{ height: 17, width: '35%', borderRadius: 4, marginTop: 4 }} />
      </div>
    </div>
  );
}

// Шаги «как это работает». Без них главная не отвечала на вопрос
// «что это вообще за сайт»: бренда, который объясняет себя сам, у нас нет.
const HOW_STEPS = [
  { icon: 'plus', h: 'Выставляете вещь или услугу', p: 'ИИ подскажет категорию и справедливую оценку в баллах. 1 балл = 1 ₽.' },
  { icon: 'swap', h: 'Находите обмен', p: 'Прямой — или цепочка на троих, если напрямую не сходится.' },
  { icon: 'shield', h: 'Меняетесь под эскроу', p: 'Разница в цене замораживается в баллах и уходит продавцу после подтверждения.' },
];

function HomeView({ lots, lotsLoading = false, myLots = [], matches = [], query, setQuery, cat, setCat, city, setCity, onOpen, onChains, onCreate, authed = true, favIds, onToggleFav }) {
  const [cityOpen, setCityOpen] = React.useState(false);
  const [cityQ, setCityQ] = React.useState('');
  const cityBox = React.useRef(null);
  const q = (query || '').trim();
  const items = lots.filter(l => {
    const matchesCat = cat === 'all' || normalizeCat(l.cat) === cat;
    const lc = (l.city || '').toLowerCase();
    const matchesCity = city === 'all' || (city === REMOTE ? lc === REMOTE : (lc === city.toLowerCase() || lc === REMOTE || !lc));
    return matchesCat && matchesQuery(l, q) && matchesCity;
  });

  // Клик мимо выпадашки городов её закрывает: раньше она перекрывала ленту,
  // пока не выберешь город.
  React.useEffect(() => {
    if (!cityOpen) return undefined;
    const onDown = (e) => { if (cityBox.current && !cityBox.current.contains(e.target)) setCityOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [cityOpen]);

  const cityLabel = city === 'all' ? 'Везде' : (city === REMOTE ? 'Удалённо' : city);
  // Городов 79 — прокручивать список до «Ярославля» дольше, чем набрать «яр».
  const cityHits = CITIES.filter(c => c.toLowerCase().includes(cityQ.trim().toLowerCase()));
  const pickCity = (c) => { setCity(c); setCityOpen(false); setCityQ(''); };

  return (
    <>
      <div className="web-hero">
        <div className="web-hero-inner">
          <span className="web-hero-kicker">Бартер-площадка</span>
          <h1>Меняйтесь вещами и услугами — без денег</h1>
          <p>Отдали вещь — получили баллы, потратили на что угодно. Эскроу держит доплату, а цепочки собирают обмен, который напрямую не сходится.</p>
          <form className="web-bigsearch" onSubmit={e => { e.preventDefault(); setCityOpen(false); }}>
            <div className="web-bigsearch-seg" style={{ position: 'relative' }} ref={cityBox}>
              <label htmlFor="web-big-city" style={{ display: 'block' }}><b>Где</b></label>
              <input
                id="web-big-city"
                value={cityOpen ? cityQ : cityLabel}
                onChange={e => { setCityQ(e.target.value); setCityOpen(true); }}
                onFocus={() => { setCityOpen(true); setCityQ(''); }}
                placeholder="Город или «Везде»"
                style={bigInputStyle}
                autoComplete="off"
              />
              <Icon name="chevD" size={14} color="var(--ink-2)" style={{ position: 'absolute', right: 14, bottom: 22 }} />
              {cityOpen && (
                <div className="web-city-drop">
                  <button type="button" className={'web-city-item' + (city === 'all' ? ' is-on' : '')} onClick={() => pickCity('all')}><Icon name="map" size={15} color="var(--ink-3)" />Везде</button>
                  <button type="button" className={'web-city-item' + (city === REMOTE ? ' is-on' : '')} onClick={() => pickCity(REMOTE)}><Icon name="spark" size={15} color="var(--ink-3)" />Удалённо</button>
                  <div className="web-city-sep" />
                  {cityHits.length ? cityHits.map((c, i) => (
                    <React.Fragment key={c}>
                      {!cityQ.trim() && i === VLADIMIR_REGION.length && <div className="web-city-sep" />}
                      <button type="button" className={'web-city-item' + (city === c ? ' is-on' : '')} onClick={() => pickCity(c)}>{c}</button>
                    </React.Fragment>
                  )) : (
                    <span className="web-city-item" style={{ color: 'var(--ink-3)' }}>Такого города в списке нет</span>
                  )}
                </div>
              )}
            </div>
            <div className="web-bigsearch-seg grow-seg">
              <label htmlFor="web-big-q" style={{ display: 'block' }}><b>Что ищете</b></label>
              <input
                id="web-big-q"
                value={query || ''}
                onChange={e => setQuery(e.target.value)}
                placeholder="Велосипед, ремонт, фотоаппарат…"
                style={bigInputStyle}
              />
            </div>
            {/* сегмент «Кто · Добавить участников» был декорацией из шаблона
                бронирования: он ничего не делал и сбивал с толку */}
            <button type="submit" className="web-search-orb" style={{ width: 52, height: 52 }} aria-label="Найти"><Icon name="search" size={22} color="#fff" /></button>
          </form>
          <div className="web-hero-cta">
            <button className="btn btn-primary btn-lg" onClick={onCreate}>
              <Icon name="plus" size={19} color="#fff" />{authed ? 'Разместить объявление' : 'Начать — разместить объявление'}
            </button>
            <a className="web-hero-link" href="#how" onClick={(e) => { e.preventDefault(); const el = document.getElementById('how'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              Как это работает →
            </a>
          </div>
        </div>
      </div>

      <div id="how" className="web-container web-how">
        {HOW_STEPS.map((s, i) => (
          <div key={s.h} className="web-how-step">
            <div className="web-how-icon"><Icon name={s.icon} size={20} color="var(--berry)" /></div>
            <span className="web-how-num">Шаг {i + 1}</span>
            <h3>{s.h}</h3>
            <p>{s.p}</p>
          </div>
        ))}
      </div>

      <div className="web-container web-section-tight">
        <div className="web-cats">
          {CATS.map(([id, label]) => (
            <button key={id} className={'web-cat' + (cat === id ? ' is-on' : '')} onClick={() => setCat(id)}>
              <Icon name={CAT_ICON[id] || 'tag'} size={15} color={cat === id ? '#fff' : 'var(--ink-3)'} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="web-container web-section">
        <div className="web-head">
          <h2>{q ? `Результаты по «${query}»` : cat === 'all' ? (city === 'all' ? 'Свежие объявления' : `Обмены · ${cityLabel}`) : CATS.find(c => c[0] === cat)?.[1]}</h2>
          {(q || cat !== 'all' || city !== 'all') && (
            <a href="#" onClick={e => { e.preventDefault(); setQuery(''); setCat('all'); setCity('all'); }}>Сбросить фильтры →</a>
          )}
        </div>
        {lotsLoading && !items.length ? (
          <div className="web-grid">
            {Array.from({ length: 8 }, (_, i) => <WebLotSkeleton key={i} />)}
          </div>
        ) : items.length ? (
          <div className="web-grid">
            {items.map(L => <WebLotCard key={L.id} L={L} onOpen={onOpen} fav={favIds ? favIds.has(L.id) : false} onToggleFav={onToggleFav} />)}
          </div>
        ) : (
          <div className="web-empty"><Icon name="search" size={36} color="var(--ink-3)" /><span>Ничего не нашлось — попробуйте другой запрос</span></div>
        )}
      </div>

      {matches.length > 0 && (
        <div className="web-container web-section" style={{ paddingTop: 0 }}>
          <div className="web-head">
            <h2><AIBadge>Умный мэтчинг</AIBadge></h2>
            <a href="#" onClick={(e) => { e.preventDefault(); onChains(); }}>Цепочки →</a>
          </div>
          <div className="web-grid">
            {matches.map(m => {
              const L = lots.find(x => x.id === m.lot);
              if (!L) return null;
              const mine = myLots[0];
              return (
                <div key={m.id} className="web-lot" onClick={() => onOpen(L.id)}>
                  <div className="web-lot-photo">
                    {mine ? (
                      <Photo label={mine.photo} url={mine.photoUrl} cat={mine.cat} />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, background: 'var(--berry-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="swap" size={26} color="var(--berry)" /></div>
                    )}
                    <span className="web-lot-badge" style={{ right: 12, left: 'auto' }}><Icon name="swap" size={11} color="var(--berry)" /> {m.score}%</span>
                  </div>
                  <div className="web-lot-meta">
                    <span className="web-lot-title">{mine ? `Ваши ${mine.title.split(',')[0]}` : 'Ваша вещь'} ↔ {L.title}</span>
                    <span className="web-lot-sub">{m.why}</span>
                    <div className="web-lot-price"><Credit n={m.topup} size={16} coin={15} color={m.dir === 'you-pay' ? 'var(--ink)' : 'var(--ok)'} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- lot detail ----------------
function Valuation({ L }) {
  const pct = Math.max(6, Math.min(94, ((L.value - L.aiLow) / (L.aiHigh - L.aiLow)) * 100));
  const isAi = L.valuationSource === 'ai';
  return (
    <div className="card" style={{ border: '1px solid var(--berry-100)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="row gap6">{isAi ? <AIBadge>AI-оценка</AIBadge> : <span className="web-lot-badge">Оценка автора</span>}</span>
        <span className="row gap4" style={{ fontSize: 13, color: 'var(--ok)' }}><Icon name="checkCircle" size={14} color="var(--ok)" />ориентир</span>
      </div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <Credit n={L.value} size={28} coin={24} />
        <span className="sub">≈ ₽{fmt(L.value)}</span>
      </div>
      <span className="sub">{isAi ? 'Ориентир по похожим объявлениям — точную стоимость согласуйте в чате.' : 'Цену назначил автор объявления. Обсудите доплату баллами в чате.'}</span>
      <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'linear-gradient(90deg, var(--berry-100), var(--berry-200), var(--berry))', marginTop: 14 }}>
        <div style={{ position: 'absolute', top: -4, left: `${pct}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: 999, background: '#fff', border: '3px solid var(--berry)' }} />
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="cap">мин ₽{fmt(L.aiLow)}</span>
        <span className="cap">макс ₽{fmt(L.aiHigh)}</span>
      </div>
    </div>
  );
}

function ReservationRail({ L, onOffer, isMine, onEdit, onShare }) {
  return (
    <div className="web-reserve">
      <div className="web-reserve-price"><b>Обмен</b><span>· {L.condition}</span></div>
      <div className="web-reserve-row"><span>Категория</span><b>{catOf(L.cat).label}</b></div>
      <div className="web-reserve-row"><span>Город</span><b>{L.ownerCity || '—'}</b></div>
      {!isMine && (
        <div className="row gap6" style={{ margin: '12px 0' }}>
          <Icon name="lock" size={15} color="var(--ok)" /><span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Защищено эскроу — баллы заморозятся до подтверждения</span>
        </div>
      )}
      {isMine ? (
        <button className="btn btn-soft btn-block btn-lg" onClick={() => onEdit && onEdit(L)}>
          <Icon name="edit" size={19} color="var(--ink)" />Редактировать
        </button>
      ) : (
        <button className="btn btn-primary btn-block btn-lg" onClick={() => onOffer(L)}>
          <Icon name="swap" size={19} color="#fff" />Предложить обмен
        </button>
      )}
      <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onShare}>
        <Icon name="send" size={17} color="var(--ink-2)" />Поделиться
      </button>
      <div className="web-reserve-row" style={{ marginTop: 14 }}><span>{L.valuationSource === 'ai' ? 'AI-оценка лота' : 'Оценка автора'}</span><b><Credit n={L.value} size={14} coin={13} /></b></div>
    </div>
  );
}

function LotView({ L, isMine = false, lots = [], onBack, onOffer, onOwnerChat, onEdit, onOpenLot }) {
  const [shared, setShared] = React.useState('');
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/lot/${encodeURIComponent(L.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: L.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShared('Ссылка скопирована');
      setTimeout(() => setShared(''), 2000);
    } catch (e) {
      // отмена шаринга — не ошибка
    }
  };
  const ownerLots = (lots || []).filter(x => x.ownerId && x.ownerId === L.ownerId && x.id !== L.id).slice(0, 4);
  // Оценка в баллах сама по себе ни о чём не говорит: рядом нужен ряд лотов
  // того же порядка цены — на них и меняются. Своя категория идёт первой,
  // потом всё остальное в коридоре ±35%.
  const priceLow = L.value * 0.65;
  const priceHigh = L.value * 1.35;
  const sameCat = normalizeCat(L.cat);
  const similar = (lots || [])
    .filter(x => x.id !== L.id && x.ownerId !== L.ownerId && x.value >= priceLow && x.value <= priceHigh)
    .sort((a, b) => {
      const ca = normalizeCat(a.cat) === sameCat ? 0 : 1;
      const cb = normalizeCat(b.cat) === sameCat ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return Math.abs(a.value - L.value) - Math.abs(b.value - L.value);
    })
    .slice(0, 4);
  const owner = {
    name: L.ownerName || '',
    city: L.ownerCity || '',
    avatar: L.ownerAvatar || '',
    rating: L.ownerRating ?? 0,
    reviews: L.ownerReviews ?? 0,
    deals: L.ownerDeals ?? 0,
  };
  const wants = (L.wants || '').split(/[,;]/).map(w => w.trim()).filter(Boolean).slice(0, 12);
  const urls = (L.photoUrls || []).filter(Boolean);
  // Раньше рамок всегда было три, и одна фотография размножалась в три копии —
  // выглядело как галерея, которой нет. Показываем ровно то, что загрузили.
  const webPhotos = urls.length ? urls.slice(0, 3) : (L.photoUrl ? [L.photoUrl] : []);
  return (
    <>
      <div className="web-detail-hero">
        <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />Все объявления</button>
        <div className="row gap6" style={{ marginTop: 10 }}><CatTag cat={L.cat} /><span className="tag" style={{ background: 'var(--line-2)', color: 'var(--ink-2)' }}>{L.condition}</span></div>
        <h1 className="web-detail-title">{L.title}</h1>
        <div className="web-detail-meta">
          <span className="web-rating-row"><Icon name="star" size={14} color="var(--ink)" fill="star" />{owner.rating} · {owner.deals} сделок</span>
          <span><Icon name="eye" size={14} color="var(--ink-3)" />{L.views}</span>
          <span><Icon name="map" size={14} color="var(--ink-3)" />{owner.city}</span>
          <span>{L.posted}</span>
        </div>
      </div>

      <div className={`web-detail-photos${webPhotos.length < 3 ? ` is-${webPhotos.length}` : ''}`}>
        {webPhotos.map((u, i) => (
          <div key={i} className="ph"><Photo label={L.photo} url={u} cat={L.cat} full fit="contain" style={{ position: 'absolute', inset: 0 }} /></div>
        ))}
      </div>

      <div className="web-detail-main">
        <div className="web-detail-col">
          <Valuation L={L} />

          <div className="card">
            <div className="row gap8" style={{ marginBottom: 12 }}><Icon name="swap" size={19} color="var(--berry)" /><span style={{ fontSize: 16, fontWeight: 600 }}>Готов(а) обменять на</span></div>
            {wants.length ? (
              <div className="row gap6" style={{ flexWrap: 'wrap' }}>
                {wants.map(w => <span key={w} className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry-700)' }}>{w}</span>)}
              </div>
            ) : (
              <span className="sub">Автор не указал — предложите свой вариант в чате.</span>
            )}
          </div>

          <div className="card">
            <span className="web-sec-label" style={{ display: 'block', marginBottom: 12 }}>Описание</span>
            <span className="body" style={{ color: 'var(--ink-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{L.desc || 'Описания нет — спросите детали у автора.'}</span>
          </div>

          <div className="card">
            <span className="web-sec-label" style={{ display: 'block', marginBottom: 12 }}>Как проходит обмен</span>
            {[
              ['swap', 'Вы предлагаете свою вещь', 'Выбираете, что отдаёте, и при разнице в оценке добавляете баллы.'],
              ['lock', 'Доплата замораживается в эскроу', 'Баллы списываются с баланса, но партнёр получает их не сразу.'],
              ['checkCircle', 'Обе стороны подтверждают', 'После подтверждения получения эскроу разморозится, а сделка попадёт в рейтинг.'],
            ].map(([icon, t, sub]) => (
              <div key={t} className="web-amenity">
                <div className="avatar" style={{ width: 40, height: 40, background: 'var(--berry-50)' }}><Icon name={icon} size={18} color="var(--berry)" /></div>
                <div className="col" style={{ gap: 2 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{t}</span><span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{sub}</span></div>
              </div>
            ))}
          </div>

          <div className="card row" style={{ padding: 16, cursor: 'pointer', gap: 14 }}>
            <Avatar user={owner.name} url={owner.avatar} size={52} />
            <div className="grow col" style={{ gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{owner.name}</span>
              <span className="row gap6"><Stars value={owner.rating} count={owner.reviews} />{owner.reviews > 0 && <span className="cap">{owner.rating.toFixed(1)} · {owner.deals} сделок</span>}</span>
              <span className="cap">{owner.city}{ownerLots.length ? ` · ещё ${ownerLots.length} в профиле` : ''}</span>
            </div>
            {isMine
              ? <span className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)' }}>Ваше объявление</span>
              : <button className="btn btn-soft" style={{ padding: '11px 16px', fontSize: 14 }} onClick={() => onOwnerChat && onOwnerChat(L)}><Icon name="chat" size={17} color="var(--ink)" />Связаться</button>}
          </div>
        </div>

        <div className="web-detail-rail">
          <ReservationRail L={L} onOffer={onOffer} isMine={isMine} onEdit={onEdit} onShare={share} />
        </div>
      </div>

      {similar.length > 0 && (
        <div className="web-container web-section" style={{ paddingTop: 0 }}>
          <div className="web-head">
            <h2>На это можно поменять</h2>
            <span className="cap">похожая оценка: {fmt(Math.round(priceLow))}–{fmt(Math.round(priceHigh))} Б</span>
          </div>
          <div className="web-grid">
            {similar.map(x => <WebLotCard key={x.id} L={x} onOpen={onOpenLot} />)}
          </div>
        </div>
      )}

      {ownerLots.length > 0 && (
        <div className="web-container web-section" style={{ paddingTop: 0 }}>
          <div className="web-head"><h2>Другие объявления автора</h2></div>
          <div className="web-grid">
            {ownerLots.map(x => <WebLotCard key={x.id} L={x} onOpen={onOpenLot} />)}
          </div>
        </div>
      )}
      {shared && <div className="snack" role="status">{shared}</div>}
    </>
  );
}

// ---------------- chains ----------------
// Десктоп переиспользует мобильные компоненты цепочки: экран редкий, а
// вторая вёрстка того же флоу разъезжается с первой при любой правке.
function ChainsView({ onBack, chains, onOpenChain, chainProps }) {
  return (
    <div className="web-container web-section">
      <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />На главную</button>
      <h2 style={{ margin: '4px 0 14px' }}>Многосторонние обмены</h2>
      <div style={{ maxWidth: 560 }}>
        <FeedChain chains={chains} onOpenChain={onOpenChain} {...chainProps} />
      </div>
    </div>
  );
}

// ---------------- deals ----------------
const fmtChatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

function FavoritesView({ lots = [], onBack, onOpen, onToggleFav }) {
  return (
    <div className="web-container web-section">
      <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />На главную</button>
      <div className="web-head" style={{ marginTop: 16 }}>
        <h2>Избранное</h2>
        <span className="cap">{lots.length ? `${lots.length} шт.` : ''}</span>
      </div>
      {lots.length ? (
        <div className="web-grid">
          {lots.map(L => <WebLotCard key={L.id} L={L} onOpen={onOpen} fav onToggleFav={onToggleFav} />)}
        </div>
      ) : (
        <div className="web-empty">
          <Icon name="heart" size={36} color="var(--ink-3)" />
          <span>Пока пусто — нажимайте на сердечко в объявлении, чтобы сохранить его сюда</span>
        </div>
      )}
    </div>
  );
}

function DealsView({ onBack, chats = [], deals = [], onOpenDeal, onOpenChat }) {
  // порядок задаёт сервер (по последнему сообщению) — вторая сортировка
  // на клиенте только расходилась с ним
  const sorted = chats;
  const activeDeals = deals.filter(d => d.status === 'active' && d.stage !== 'done');
  // подтвердивший первым не увидит экран завершения — даём ему вход в оценку отсюда
  const toRate = deals.filter(d => d.stage === 'done' && !d.reviewed);
  return (
    <div className="web-container web-section">
      <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />На главную</button>
      <div className="web-head" style={{ marginTop: 16 }}><h2>Сделки</h2></div>
      {toRate.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', maxWidth: 720, marginBottom: 16 }}>
          {toRate.map((d, i) => (
            <div key={d.id} className="row gap14" style={{ padding: '16px 20px', borderTop: i ? '1px solid var(--line-2)' : 'none', cursor: 'pointer', alignItems: 'center' }} onClick={() => onOpenDeal(d.id)}>
              <Avatar user={d.partnerName} url={d.partnerAvatar} size={44} />
              <div className="grow col" style={{ gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Оцените {d.partnerName || 'партнёра'}</span>
                <span className="sub ellipsis">Обмен «{(d.lot?.title || '').split(',')[0]}» завершён</span>
              </div>
              <Icon name="chevR" size={18} color="var(--ink-3)" />
            </div>
          ))}
        </div>
      )}
      {activeDeals.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>
          {activeDeals.map((d, i) => {
            const L = d.lot || {};
            const myConf = d.role === 'initiator' ? d.initiatorConfirmed : d.partnerConfirmed;
            const parConf = d.role === 'initiator' ? d.partnerConfirmed : d.initiatorConfirmed;
            const pct = myConf || parConf ? 75 : d.stage === 'meet' ? 50 : 25;
            return (
              <div key={d.id} className="row gap14" style={{ padding: '16px 20px', borderTop: i ? '1px solid var(--line-2)' : 'none', cursor: 'pointer', alignItems: 'center' }} onClick={() => onOpenDeal(d.id)}>
                <Avatar user={d.partnerName} url={d.partnerAvatar} size={44} />
                <div className="grow col" style={{ gap: 3 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{d.partnerName || 'Партнёр'} · эскроу</span>
                    <span className="cap">{fmt(d.credits)} Б в эскроу</span>
                  </div>
                  <span className="sub ellipsis">{d.role === 'partner' ? `Вы отдаёте «${(L.title || '').split(',')[0]}»` : `${(L.title || '').split(',')[0]} ↔ ваши вещи`}</span>
                  <div className="escrow-track" style={{ marginTop: 6 }}><div className="escrow-fill" style={{ width: pct + '%' }} /></div>
                </div>
                <Icon name="chevR" size={18} color="var(--ink-3)" />
              </div>
            );
          })}
        </div>
      )}

      <div className="web-head" style={{ marginTop: 24 }}><h2>Переписки</h2><span className="cap">{sorted.length} шт.</span></div>
      {sorted.length ? (
        <div className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>
          {sorted.map((c, i) => {
            const last = c.messages && c.messages[c.messages.length - 1];
            const dealTitle = c.deal ? c.deal.title : null;
            const credits = c.deal && c.deal.credits > 0 ? ` · ${c.deal.credits} Б` : '';
            return (
              <div key={c.id} className="row gap14" style={{ padding: '16px 20px', borderTop: i ? '1px solid var(--line-2)' : 'none', cursor: 'pointer' }} onClick={() => onOpenChat(c.id)}>
                {c.kind === 'chain'
                  ? <div className="avatar" style={{ width: 48, height: 48, flex: 'none', background: 'var(--berry-50)' }}><Icon name="chain" size={22} color="var(--berry)" /></div>
                  : <Avatar user={c.partner?.name} url={c.partner?.avatar} size={48} />}
                <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{c.partner.name}</span>
                    <span className="cap">{fmtChatTime(last?.t || c.createdAt)}</span>
                  </div>
                  <span className="sub">{dealTitle ? `${dealTitle}${credits}` : 'Обсуждение обмена'}</span>
                  {last && <span className="cap ellipsis" style={{ maxWidth: 500, fontWeight: c.unread ? 700 : 400, color: c.unread ? 'var(--ink)' : undefined }}>{last.me ? 'Вы: ' : ''}{last.text}</span>}
                </div>
                {c.unread ? <span style={{ flex: 'none', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--berry)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread > 99 ? '99+' : c.unread}</span> : null}
                <Icon name="chevR" size={18} color="var(--ink-3)" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="web-empty"><Icon name="chat" size={36} color="var(--ink-3)" /><span>Сделок пока нет — предложите обмен на объявлении</span></div>
      )}
    </div>
  );
}

// ---------------- my lots ----------------
// Свои объявления жили только внутри профиля, под аватаром, без адреса —
// «фиг найдёшь и непонятно». Теперь это отдельный раздел с архивом.
function MyLotsView({ myLots = [], archivedLots = [], onOpen, onCreate, onEdit, onArchive, onRestore, onDelete }) {
  const [tab, setTab] = React.useState('active');
  const items = tab === 'active' ? myLots : archivedLots;
  return (
    <div className="web-container web-section">
      <div className="web-head">
        <h2>Мои объявления</h2>
        <button className="btn btn-primary" style={{ padding: '11px 16px', fontSize: 14 }} onClick={onCreate}>
          <Icon name="plus" size={17} color="#fff" />Разместить объявление
        </button>
      </div>
      <div className="web-cats" style={{ marginBottom: 20 }}>
        <button className={'web-cat' + (tab === 'active' ? ' is-on' : '')} onClick={() => setTab('active')}>
          <Icon name="grid" size={15} color={tab === 'active' ? '#fff' : 'var(--ink-3)'} />В ленте · {myLots.length}
        </button>
        <button className={'web-cat' + (tab === 'archive' ? ' is-on' : '')} onClick={() => setTab('archive')}>
          <Icon name="archive" size={15} color={tab === 'archive' ? '#fff' : 'var(--ink-3)'} />Архив · {archivedLots.length}
        </button>
      </div>
      {items.length ? (
        <div className="web-grid">
          {items.map(L => (
            <div key={L.id} className="col gap8">
              <WebLotCard L={L} onOpen={onOpen} onEdit={tab === 'active' ? onEdit : undefined} />
              <div className="row gap8">
                {tab === 'active' ? (
                  <button className="btn btn-soft grow" style={{ padding: '9px 12px', fontSize: 13.5 }} onClick={() => onArchive && onArchive(L)}>
                    <Icon name="archive" size={15} color="var(--ink)" />В архив
                  </button>
                ) : (
                  <button className="btn btn-soft grow" style={{ padding: '9px 12px', fontSize: 13.5 }} onClick={() => onRestore && onRestore(L)}>
                    <Icon name="check" size={15} color="var(--ink)" />Вернуть в ленту
                  </button>
                )}
                <button className="btn btn-soft" style={{ padding: '9px 12px', fontSize: 13.5, color: 'var(--berry-700)' }} onClick={() => onDelete && onDelete(L)}>
                  <Icon name="close" size={15} color="var(--berry-700)" />Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="web-empty">
          <Icon name="tag" size={36} color="var(--ink-3)" />
          <span>{tab === 'active' ? 'Пока ни одного объявления — начните с того, что вам не нужно' : 'В архиве пусто'}</span>
          {tab === 'active' && <button className="btn btn-primary" onClick={onCreate}><Icon name="plus" size={17} color="#fff" />Разместить объявление</button>}
        </div>
      )}
    </div>
  );
}

// ---------------- profile ----------------
function ProfileView({ user, profile, myLots, onOpenLot, onLogout, onProfileSaved, onWallet, onEditLot, onAllLots }) {
  const [editing, setEditing] = React.useState(false);
  const avatarRef = React.useRef(null);
  const name = (user && user.name) || '';
  const city = (user && user.city) || '';
  const rating = user ? (user.rating ?? 0) : 0;
  const reviewsCount = (profile && profile.reviewsCount) ?? (user && user.reviewsCount) ?? 0;
  const deals = user ? (user.dealsCount ?? 0) : 0;
  const balance = (user && user.balance) || 0;
  const bio = (profile && profile.bio) || (user && user.bio) || '';
  const avatar = (profile && profile.avatar) || (user && user.avatar) || '';
  const reviews = (profile && profile.reviews) || [];

  const onAvatarFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(f);
      });
      const resized = await resizeImage(dataUrl, 256);
      const res = await updateAvatarAction(resized);
      if (res.ok && onProfileSaved) onProfileSaved(res.user);
    } catch (err) {
      console.error('avatar upload failed', err);
    }
  };

  return (
    <>
      <div className="web-container web-section">
        <div className="row gap20" style={{ gap: 40, alignItems: 'flex-start' }}>
          <div className="col" style={{ alignItems: 'center', gap: 14, flex: 'none', width: 280 }}>
            <div style={{ position: 'relative' }}>
              {avatar ? (
                <div style={{ width: 120, height: 120, borderRadius: 999, overflow: 'hidden', boxShadow: 'var(--sh-2)' }}><img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
              ) : (
                <div style={{ width: 120, height: 120, borderRadius: 999, background: 'linear-gradient(135deg, var(--berry), var(--berry-500))', color: '#fff', fontSize: 48, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--sh-2)' }}>{(name || '?').charAt(0)}</div>
              )}
              <button onClick={() => avatarRef.current && avatarRef.current.click()} title="Изменить фото" style={{ position: 'absolute', bottom: 2, right: 2, width: 34, height: 34, borderRadius: 999, background: 'var(--berry)', border: '2.5px solid #fff', boxShadow: 'var(--sh-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="camera" size={16} color="#fff" /></button>
              <input ref={avatarRef} type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
            </div>
            <div className="col" style={{ alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{name}</span>
              <span className="sub"><Icon name="map" size={13} color="var(--ink-3)" /> {city}</span>
              <span className="web-rating-row">{reviewsCount > 0
                ? <><Icon name="star" size={14} color="var(--ink)" /> {rating.toFixed(1)} · {reviewsCount} отзывов · {deals} сделок</>
                : <>Оценок пока нет · {deals} сделок</>}</span>
            </div>
            <button className="btn btn-soft" style={{ padding: '11px 18px', fontSize: 14 }} onClick={() => setEditing(true)}><Icon name="user" size={16} color="var(--ink)" />Редактировать</button>
            <div className="card row" style={{ width: '100%', padding: '14px 8px' }}>
              <div className="col" style={{ alignItems: 'center', flex: 1 }}><span style={{ fontSize: 20, fontWeight: 600 }}>{deals}</span><span className="cap">сделок</span></div>
              <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
              <div className="col" style={{ alignItems: 'center', flex: 1 }}><span style={{ fontSize: 20, fontWeight: 600 }}>{myLots.length}</span><span className="cap">объявлений</span></div>
              <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />
              <div className="col" style={{ alignItems: 'center', flex: 1 }}><span style={{ fontSize: 20, fontWeight: 600 }}><Credit n={balance} size={16} coin={14} /></span><span className="cap">баллов</span></div>
            </div>
            {bio && <div style={{ width: '100%', padding: '12px 14px', background: 'var(--berry-50)', borderRadius: 14, border: '1px solid var(--berry-100)', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5, textAlign: 'center' }}>{bio}</div>}
            <button className="btn btn-soft" style={{ padding: '11px 18px', fontSize: 14 }} onClick={onWallet}><Icon name="wallet" size={16} color="var(--ink)" />Кошелёк: <Credit n={balance} size={13} coin={12} /></button>
          </div>

          <div className="grow col" style={{ minWidth: 0 }}>
            <div className="web-head"><h2>Объявления</h2><a href="#" onClick={e => { e.preventDefault(); onAllLots && onAllLots(); }}>Все, включая архив →</a></div>
            {myLots.length ? (
              <div className="web-grid">
                {myLots.map(L => <WebLotCard key={L.id} L={L} onOpen={onOpenLot} onEdit={onEditLot} />)}
              </div>
            ) : (
              <div className="web-empty"><Icon name="tag" size={34} color="var(--ink-3)" /><span>Здесь появятся ваши товары и услуги</span></div>
            )}
            <div className="web-head" style={{ marginTop: 40 }}><h2>Отзывы</h2><span className="cap">{reviews.length} шт.</span></div>
            {reviews.length ? (
              <div className="web-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {reviews.map((r, i) => (
                  <div key={r.id || i} className="card" style={{ padding: 16 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{r.author}</span>
                      <span className="cap">{fmtDate(r.date)}</span>
                    </div>
                    <div className="row gap3" style={{ marginBottom: 8 }}>{[1,2,3,4,5].map(s => <Icon key={s} name="star" size={12} color={s <= r.rating ? 'var(--ink)' : 'var(--line)'} />)}</div>
                    <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="web-empty"><Icon name="star" size={34} color="var(--ink-3)" /><span>Отзывов пока нет</span></div>
            )}
          </div>
        </div>
      </div>
      <EditProfileSheet user={profile || user} open={editing} onClose={() => setEditing(false)} onSaved={onProfileSaved} />
    </>
  );
}

// ---------------- root ----------------
export default function WebApp({ route = { tab: 'search', stack: [] }, onTab, go, back, lots, lotsLoading = false, myLots, archivedLots = [], onArchiveLot, onRestoreLot, onDeleteLot, notifications = { unread: 0 }, onOpenNotifications, user, profile, onLogout, onProfileSaved, onOffer, onCreate, onEditLot, matches = [], chats = [], chains = [], deals = [], favorites = [], onToggleFav, onConfirmDeal, onCancelDeal, onRateDeal, onDisputeDeal, authed = true, onAuthRequired, onOwnerChat, onChatRead, onChatsChanged, chainProps = {}, chainActions = {}, chainBusy = false }) {
  // Экран десктопа выводится из адреса, а не из локального состояния: раньше
  // «Назад» в браузере уносило с сайта целиком, ссылка на объявление никуда
  // не вела, а переход из кода (`go('deal')` после создания сделки) на
  // десктопе просто ничего не открывал — сделка создавалась молча.
  const stack = route.stack || [];
  const top = stack[stack.length - 1] || null;
  const topName = top ? top.name : '';
  const view = topName === 'lot' ? 'lot'
    : (topName === 'chainfeed' || topName === 'chain') ? 'chains'
    : route.tab === 'search' ? 'home'
    : route.tab === 'wallet' ? 'profile'   // кошелька отдельным экраном на десктопе нет
    : route.tab;
  const setView = (id) => onTab && onTab(id === 'home' ? 'search' : id);
  const selLot = topName === 'lot' ? top.params.lotId : null;
  const selDeal = topName === 'deal' ? top.params.id : null;
  const selChat = topName === 'chat' ? top.params.id : null;
  const selChain = topName === 'chain' ? top.params.id : null;
  const openLot = (id) => go && go('lot', { lotId: id });
  const [cat, setCat] = React.useState('all');
  const [city, setCity] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const avatar = (profile && profile.avatar) || (user && user.avatar) || '';
  // Лента чужая — своих лотов в ней нет. Открытие карточки из профиля
  // искало только в ленте и отдавало пустой экран.
  const selected = selLot
    ? (lots.find(l => l.id === selLot) || (myLots || []).find(l => l.id === selLot) || null)
    : null;
  const selectedIsMine = !!selected && (myLots || []).some(l => l.id === selected.id);

  const favIds = React.useMemo(() => new Set((favorites || []).map(f => f.id)), [favorites]);
  const chatUnread = React.useMemo(() => (chats || []).reduce((n, c) => n + (c.unread || 0), 0), [chats]);
  // Настроек на десктопе не было вовсе — ни смены пароля, ни уведомлений,
  // ни рассылки. Переиспользуем мобильные экраны в модалке, как чат и сделку.
  const settingsOpen = topName === 'settings';
  const analyticsOpen = topName === 'analytics';
  const broadcastOpen = topName === 'broadcast';
  const disputesOpen = topName === 'disputes';
  const resetsOpen = topName === 'resets';
  const reportsOpen = topName === 'reports';
  const rulesOpen = topName === 'rules';
  const [isAdmin, setIsAdmin] = React.useState(false);
  React.useEffect(() => {
    if (!authed) { setIsAdmin(false); return; }
    broadcastInfoAction().then(r => setIsAdmin(!!r?.admin)).catch(() => {});
  }, [authed]);

  const goHome = () => setView('home');
  const closeTop = () => (back ? back() : goHome());
  const dealOpen = selDeal ? deals.find(x => x.id === selDeal) || null : null;

  return (
    <div className="web">
      <WebNav
        view={view} setView={setView} user={user} avatar={avatar} query={query} setQuery={setQuery}
        onLogout={onLogout} onCreate={onCreate} authed={authed} onAuthRequired={onAuthRequired}
        chatUnread={chatUnread} isAdmin={isAdmin}
        unread={notifications.unread || 0} onBell={onOpenNotifications}
        onSettings={() => go && go('settings')} onBroadcast={() => go && go('broadcast')}
      />
      <div className="web-body">
        {view === 'home' && <HomeView lots={lots} lotsLoading={lotsLoading} myLots={myLots} matches={matches} query={query} setQuery={setQuery} cat={cat} setCat={setCat} city={city} setCity={setCity} onOpen={openLot} onChains={() => setView('chains')} onCreate={onCreate} authed={authed} favIds={favIds} onToggleFav={onToggleFav} />}
        {view === 'favorites' && <FavoritesView lots={favorites} onBack={goHome} onOpen={openLot} onToggleFav={onToggleFav} />}
        {view === 'mylots' && <MyLotsView myLots={myLots} archivedLots={archivedLots} onOpen={openLot} onCreate={onCreate} onEdit={onEditLot} onArchive={onArchiveLot} onRestore={onRestoreLot} onDelete={onDeleteLot} />}
        {view === 'lot' && (selected
          ? <LotView L={selected} isMine={selectedIsMine} lots={lots} onBack={closeTop} onOffer={onOffer} onOwnerChat={onOwnerChat} onEdit={onEditLot} onOpenLot={(id) => { openLot(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          : <div className="web-container web-section"><div className="web-empty"><Icon name="tag" size={36} color="var(--ink-3)" /><span>Объявление не найдено — возможно, оно снято с публикации</span><button className="btn btn-soft" onClick={goHome}>На главную</button></div></div>)}
        {view === 'chains' && <ChainsView onBack={goHome} chains={chains} chainProps={chainProps} onOpenChain={(id) => go && go('chain', { id })} />}
        {view === 'deals' && <DealsView onBack={goHome} chats={chats} deals={deals} onOpenDeal={(id) => go && go('deal', { id })} onOpenChat={(id) => go && go('chat', { id })} />}
        {view === 'profile' && <ProfileView user={user} profile={profile} myLots={myLots} onOpenLot={openLot} onLogout={onLogout} onProfileSaved={onProfileSaved} onWallet={goHome} onEditLot={onEditLot} onAllLots={() => setView('mylots')} />}
      </div>
      <WebFooter authed={authed} onTab={setView} onCreate={onCreate} onRules={() => go && go('rules')} onSettings={() => go && go('settings')} />

      {settingsOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <SettingsScreen
              user={user}
              profile={profile}
              onBack={closeTop}
              onLogout={() => { closeTop(); onLogout(); }}
              onProfileSaved={onProfileSaved}
              onGoWallet={closeTop}
              onAnalytics={() => go && go('analytics')}
              onBroadcast={() => go && go('broadcast')}
              onDisputes={() => go && go('disputes')}
              onResets={() => go && go('resets')}
              onReports={() => go && go('reports')}
              onRules={() => go && go('rules')}
            />
          </div>
        </div>
      )}

      {analyticsOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <FunnelScreen onBack={closeTop} />
          </div>
        </div>
      )}

      {rulesOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <RulesScreen onBack={closeTop} />
          </div>
        </div>
      )}

      {reportsOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <ReportsScreen onBack={closeTop} />
          </div>
        </div>
      )}

      {resetsOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <ResetsScreen onBack={closeTop} />
          </div>
        </div>
      )}

      {disputesOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <DisputesScreen onBack={closeTop} />
          </div>
        </div>
      )}

      {broadcastOpen && (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <BroadcastScreen onBack={closeTop} />
          </div>
        </div>
      )}

      {selDeal && dealOpen ? (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <DealStatus
              deal={dealOpen}
              onBack={closeTop}
              onConfirm={() => onConfirmDeal(dealOpen)}
              onCancel={async () => { const ok = await onCancelDeal(dealOpen); if (ok) closeTop(); }}
              onChat={() => { const c = chats.find(x => x.deal && x.deal.id === selDeal); if (c && go) go('chat', { id: c.id }); }}
              onDone={closeTop}
              onRate={onRateDeal}
              onDispute={(text) => onDisputeDeal && onDisputeDeal(dealOpen, text)}
            />
          </div>
        </div>
      ) : selChat ? (
        <div className="web-modal">
          <ChatThread
            chatId={selChat}
            onRead={onChatRead}
            onBack={() => { closeTop(); onChatsChanged && onChatsChanged(); }}
            onOpenDeal={() => { const c = chats.find(x => x.id === selChat); if (c && c.deal && go) go('deal', { id: c.deal.id }); }}
          />
        </div>
      ) : selChain ? (
        <div className="web-modal">
          <div className="app">
            <div className="safe-top" />
            <ChainDetail
              chainId={selChain}
              chains={chains}
              busy={chainBusy}
              onBack={closeTop}
              onStart={chainActions.onStart}
              onRespond={async (ch, accept) => {
                await chainActions.onRespond?.(ch, accept);
                if (!accept) closeTop();
              }}
              onSent={chainActions.onSent}
              onReceived={chainActions.onReceived}
              onOpenChat={(chatId) => go && go('chat', { id: chatId })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
