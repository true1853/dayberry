// web-app.jsx — desktop web layout (Airbnb-inspired)
import React from 'react';
import { lot, MY_LOT, MATCHES, U, CHAIN, CHATLIST, ME } from './data.js';
import { CITIES, REMOTE } from './cities.js';
import { Icon } from './icons.jsx';
import { fmt, Logo, Credit, Photo, Avatar, Stars, CatTag, AIBadge } from './ui.jsx';
import { EditProfileSheet } from './screen-profile.jsx';

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
];

const FOOTER_COLS = [
  { h: 'Поддержка', links: ['Справка', 'Безопасность', 'Центр доверия', 'Правила сообщества', 'Связь с нами'] },
  { h: 'Размещение', links: ['Стать участником', 'Арендовать на день', 'Бартер-бизнес', 'Гиды и промо', 'Опыт соседей'] },
  { h: 'Дай бери', links: ['Новости', 'Карьера', 'Блог', 'Благотворительность', 'Контакты'] },
];

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d} ${months[(m || 1) - 1]}`;
}

// ---------------- top nav ----------------
function WebNav({ view, setView, user, avatar, query, setQuery, onLogout, onCreate }) {
  const [menu, setMenu] = React.useState(false);
  const [q, setQ] = React.useState(query || '');
  const tabs = [
    { id: 'home', label: 'Обмен' },
    { id: 'chains', label: 'Цепочки', new: true },
    { id: 'deals', label: 'Сделки' },
    { id: 'profile', label: 'Профиль' },
  ];
  const goTab = (id) => { setView(id); setMenu(false); };
  const submit = (e) => { e.preventDefault(); setQuery(q); setView('home'); };
  return (
    <nav className="web-nav">
      <div className="web-nav-inner">
        <div className="web-logo" onClick={() => goTab('home')}>
          <Logo size={30} />Дай бери
        </div>
        <div className="web-tabs">
          {tabs.map(t => (
            <button key={t.id} className={'web-tab' + (view === t.id ? ' is-on' : '')} onClick={() => goTab(t.id)}>
              {t.label}
              {t.new && <span className="web-new">NEW</span>}
            </button>
          ))}
        </div>
        <form className="web-search-pill" onSubmit={submit}>
          <Icon name="search" size={17} color="var(--ink-3)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Что ищете для обмена?" />
          <button type="submit" className="web-search-orb"><Icon name="search" size={17} color="#fff" /></button>
        </form>
        <div className="web-nav-right" style={{ position: 'relative' }}>
          <button className="btn btn-primary web-nav-create" onClick={onCreate}><Icon name="plus" size={18} color="#fff" />Разместить объявление</button>
          <button className="web-account" onClick={() => setMenu(m => !m)}>
            <div className="web-account-avatar">
              {avatar ? <img src={avatar} alt="" /> : (user?.name || 'А').charAt(0)}
            </div>
            <Icon name="chevD" size={16} color="var(--ink-2)" />
          </button>
          {menu && (
            <div className="web-drop">
              <button className="web-drop-item" onClick={() => goTab('profile')}><Icon name="user" size={17} color="var(--ink-2)" />Профиль</button>
              <button className="web-drop-item" onClick={() => goTab('deals')}><Icon name="chat" size={17} color="var(--ink-2)" />Мои сделки</button>
              <button className="web-drop-item" onClick={() => goTab('home')}><Icon name="wallet" size={17} color="var(--ink-2)" />Кошелёк</button>
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
function WebFooter() {
  return (
    <footer className="web-footer">
      <div className="web-footer-inner">
        {FOOTER_COLS.map(c => (
          <div key={c.h} className="web-footer-col">
            <h3>{c.h}</h3>
            {c.links.map(l => <a key={l} href="#" onClick={e => e.preventDefault()}>{l}</a>)}
          </div>
        ))}
      </div>
      <div className="web-legal">
        <span>© 2026 Дай бери, Inc. · Условия · Конфиденциальность</span>
        <div className="web-legal-right">
          <span>🌐 Русский (RU)</span>
          <span>₽ RUB</span>
        </div>
      </div>
    </footer>
  );
}

// ---------------- home ----------------
const CATS = [['all', 'Всё'], ['gadget', 'Техника'], ['digital', 'Услуги'], ['eco', 'Вещи и эко']];
const CAT_ICON = { all: 'spark', gadget: 'tag', digital: 'spark', eco: 'heart' };

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

function WebLotCard({ L, onOpen, onOffer, onEdit }) {
  return (
    <div className="web-lot" onClick={() => onOpen(L.id)}>
      <div className="web-lot-photo">
        <Photo label={L.photo} url={L.photoUrl} cat={L.cat} />
        {L.hot && <span className="web-lot-badge"><Icon name="flame" size={11} color="var(--berry)" /> Хит</span>}
        {onEdit && <button className="web-lot-heart" title="Редактировать" onClick={(e) => { e.stopPropagation(); onEdit(L); }}><Icon name="edit" size={15} color="var(--ink-2)" /></button>}
        <button className="web-lot-heart" onClick={(e) => { e.stopPropagation(); onOffer && onOffer(L); }}><Icon name="heart" size={17} color="var(--ink-2)" /></button>
      </div>
      <div className="web-lot-meta">
        <span className="web-lot-title">{L.title}</span>
        <span className="web-lot-sub">{L.condition} · {(U[L.owner] || ME).city}</span>
        <span className="web-lot-sub">{L.posted}</span>
        <div className="web-lot-price"><Credit n={L.value} size={17} coin={16} /><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>за обмен</span></div>
      </div>
    </div>
  );
}

function HomeView({ lots, query, setQuery, cat, setCat, city, setCity, onOpen, onOffer, onChains }) {
  const [cityOpen, setCityOpen] = React.useState(false);
  const q = (query || '').toLowerCase();
  const items = lots.filter(l => {
    const matchesCat = cat === 'all' || l.cat === cat;
    const matchesQ = !q || l.title.toLowerCase().includes(q);
    const lc = (l.city || '').toLowerCase();
    const matchesCity = city === 'all' || (city === REMOTE ? lc === REMOTE : (lc === city.toLowerCase() || lc === REMOTE || !lc));
    return matchesCat && matchesQ && matchesCity;
  });
  const cityLabel = city === 'all' ? 'Везде' : (city === REMOTE ? 'Удалённо' : city);
  return (
    <>
      <div className="web-hero">
        <div className="web-hero-inner">
          <h1>Вдохновение для будущих обменов</h1>
          <p>Обмен без денег: бартер-кредиты, эскроу и честные сделки по всей России.</p>
          <form className="web-bigsearch" onSubmit={e => { e.preventDefault(); setCityOpen(false); }}>
            <div className="web-bigsearch-seg" style={{ position: 'relative' }} onClick={() => setCityOpen(o => !o)}>
              <b>Где</b><span className="web-city-label">{cityLabel}</span>
              <Icon name="chevD" size={14} color="var(--ink-2)" style={{ position: 'absolute', right: 14, bottom: 22 }} />
              {cityOpen && (
                <div className="web-city-drop">
                  <button type="button" className={'web-city-item' + (city === 'all' ? ' is-on' : '')} onClick={() => { setCity('all'); setCityOpen(false); }}><Icon name="map" size={15} color="var(--ink-3)" />Везде</button>
                  <button type="button" className={'web-city-item' + (city === REMOTE ? ' is-on' : '')} onClick={() => { setCity(REMOTE); setCityOpen(false); }}><Icon name="spark" size={15} color="var(--ink-3)" />Удалённо</button>
                  <div className="web-city-sep" />
                  {CITIES.map(c => (
                    <button key={c} type="button" className={'web-city-item' + (city === c ? ' is-on' : '')} onClick={() => { setCity(c); setCityOpen(false); }}>{c}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="web-bigsearch-seg grow-seg">
              <label htmlFor="web-big-q" style={{ display: 'block' }}><b>Что ищете</b></label>
              <input
                id="web-big-q"
                value={query || ''}
                onChange={e => setQuery(e.target.value)}
                placeholder="Техника, услуги, вещи…"
                style={bigInputStyle}
              />
            </div>
            <div className="web-bigsearch-seg"><b>Кто</b><span>Добавить участников</span></div>
            <button type="submit" className="web-search-orb" style={{ width: 52, height: 52 }} aria-label="Найти"><Icon name="search" size={22} color="#fff" /></button>
          </form>
        </div>
      </div>

      <div className="web-container web-section-tight">
        <div className="web-cats">
          {CATS.map(([id, label]) => (
            <button key={id} className={'web-cat' + (cat === id ? ' is-on' : '')} onClick={() => setCat(id)}>
              <Icon name={CAT_ICON[id]} size={15} color={cat === id ? '#fff' : 'var(--ink-3)'} />{label}
            </button>
          ))}
        </div>
      </div>

      <div className="web-container web-section">
        <div className="web-head">
          <h2>{q ? `Результаты по «${query}»` : cat === 'all' ? 'Обмены рядом' : CATS.find(c => c[0] === cat)?.[1]}</h2>
          <a href="#" onClick={e => e.preventDefault()}>Все объявления →</a>
        </div>
        {items.length ? (
          <div className="web-grid">
            {items.map(L => <WebLotCard key={L.id} L={L} onOpen={onOpen} onOffer={onOffer} />)}
          </div>
        ) : (
          <div className="web-empty"><Icon name="search" size={36} color="var(--ink-3)" /><span>Ничего не нашлось — попробуйте другой запрос</span></div>
        )}
      </div>

      <div className="web-container web-section" style={{ paddingTop: 0 }}>
        <div className="web-head">
          <h2><AIBadge>Умный мэтчинг</AIBadge></h2>
          <a href="#" onClick={(e) => { e.preventDefault(); onChains(); }}>Цепочки →</a>
        </div>
        <div className="web-grid">
          {MATCHES.map(m => {
            const L = lot(m.lot);
            return (
              <div key={m.id} className="web-lot" onClick={() => onOpen(L.id)}>
                <div className="web-lot-photo">
                  <Photo label={MY_LOT.photo} url={MY_LOT.photoUrl} cat={MY_LOT.cat} />
                  <span className="web-lot-badge" style={{ right: 12, left: 'auto' }}><Icon name="swap" size={11} color="var(--berry)" /> {m.score}%</span>
                </div>
                <div className="web-lot-meta">
                  <span className="web-lot-title">Ваши Apple Watch ↔ {L.title}</span>
                  <span className="web-lot-sub">{m.why}</span>
                  <div className="web-lot-price"><Credit n={m.topup} size={16} coin={15} color={m.dir === 'you-pay' ? 'var(--ink)' : 'var(--ok)'} /></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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

function ReservationRail({ L, onOffer }) {
  const [guests, setGuests] = React.useState(1);
  return (
    <div className="web-reserve">
      <div className="web-reserve-price"><b>Обмен</b><span>· {L.condition}</span></div>
      <div className="web-reserve-dates">
        <div className="web-reserve-date"><b>Прибытие</b><span>27 авг</span></div>
        <div className="web-reserve-date"><b>Отъезд</b><span>31 авг</span></div>
      </div>
      <div className="web-reserve-row"><span>Участники</span>
        <div className="row gap8">
          <button onClick={() => setGuests(g => Math.max(1, g - 1))} style={stepBtn}>−</button>
          <b>{guests}</b>
          <button onClick={() => setGuests(g => g + 1)} style={stepBtn}>+</button>
        </div>
      </div>
      <div className="row gap6" style={{ margin: '12px 0' }}>
        <Icon name="lock" size={15} color="var(--ok)" /><span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>Защищено эскроу — баллы заморозятся до подтверждения</span>
      </div>
      <button className="btn btn-primary btn-block btn-lg" onClick={() => onOffer(L)}>
        <Icon name="swap" size={19} color="#fff" />Предложить обмен
      </button>
      <div className="web-reserve-row" style={{ marginTop: 14 }}><span>AI-оценка лота</span><b><Credit n={L.value} size={14} coin={13} /></b></div>
      <div className="web-reserve-row"><span>Ваш лот</span><b><Credit n={MY_LOT.value} size={14} coin={13} /></b></div>
      <div className="web-reserve-row"><span>Разница</span><b style={{ color: 'var(--berry)' }}><Credit n={Math.max(0, L.value - MY_LOT.value)} size={14} coin={13} /></b></div>
      <div className="web-reserve-total row" style={{ justifyContent: 'space-between' }}><span>Итого доплата</span><Credit n={Math.max(0, L.value - MY_LOT.value)} size={15} coin={14} /></div>
    </div>
  );
}
const stepBtn = { width: 30, height: 30, borderRadius: 999, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)', fontSize: 18, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };

function LotView({ L, onBack, onOffer }) {
  const owner = L.owner === 'me' ? ME : (U[L.owner] || ME);
  const amenities = [
    ['Смартфон', 'Apple Watch, iPhone, Samsung'],
    ['Ноутбуки', 'MacBook, Lenovo, Dell'],
    ['Услуги', 'Лендинги, фото, таргет, ремонт'],
    ['Хобби', 'Велосипед, настолки, книги'],
  ];
  return (
    <>
      <div className="web-detail-hero">
        <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />Все объявления</button>
        <div className="row gap6" style={{ marginTop: 10 }}><CatTag cat={L.cat} /><span className="tag" style={{ background: 'var(--line-2)', color: 'var(--ink-2)' }}>{L.condition}</span>{L.hot && <span className="tag" style={{ background: 'var(--berry-50)', color: 'var(--berry)' }}><Icon name="flame" size={12} color="var(--berry)" />Хит</span>}</div>
        <h1 className="web-detail-title">{L.title}</h1>
        <div className="web-detail-meta">
          <span className="web-rating-row"><Icon name="star" size={14} color="var(--ink)" fill="star" />{owner.rating} · {owner.deals} сделок</span>
          <span><Icon name="eye" size={14} color="var(--ink-3)" />{L.views}</span>
          <span><Icon name="map" size={14} color="var(--ink-3)" />{owner.city}</span>
          <span>{L.posted}</span>
        </div>
      </div>

      <div className="web-detail-photos">
        <div className="ph"><Photo label={L.photo} url={L.photoUrl} cat={L.cat} /></div>
        <div className="ph"><Photo label={L.photo} url={L.photoUrl} cat={L.cat} /></div>
        <div className="ph"><Photo label={L.photo} url={L.photoUrl} cat={L.cat} /></div>
      </div>

      <div className="web-detail-main">
        <div className="web-detail-col">
          <Valuation L={L} />

          <div className="card">
            <div className="row gap8" style={{ marginBottom: 12 }}><Icon name="swap" size={19} color="var(--berry)" /><span style={{ fontSize: 16, fontWeight: 600 }}>Готов(а) обменять на</span></div>
            <span className="body">{L.wants}</span>
          </div>

          <div className="card">
            <span className="web-sec-label" style={{ display: 'block', marginBottom: 12 }}>Описание</span>
            <span className="body" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>{L.desc}</span>
          </div>

          <div className="card">
            <span className="web-sec-label" style={{ display: 'block', marginBottom: 6 }}>Что подойдёт для обмена</span>
            {amenities.map(([t, s], i) => (
              <div key={t} className="web-amenity">
                <div className="avatar" style={{ width: 40, height: 40, background: 'var(--berry-50)' }}><Icon name={i === 0 ? 'tag' : i === 1 ? 'tag' : 'spark'} size={18} color="var(--berry)" /></div>
                <div className="col" style={{ gap: 2 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{t}</span><span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{s}</span></div>
              </div>
            ))}
          </div>

          <div className="card row" style={{ padding: 16, cursor: 'pointer', gap: 14 }}>
            <Avatar user={L.owner} size={52} />
            <div className="grow col" style={{ gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{owner.name}</span>
              <span className="row gap6"><Stars value={owner.rating} /><span className="cap">{owner.rating} · {owner.deals} сделок</span></span>
            </div>
            <button className="btn btn-soft" style={{ padding: '11px 16px', fontSize: 14 }}><Icon name="chat" size={17} color="var(--ink)" />Связаться</button>
          </div>
        </div>

        <div className="web-detail-rail">
          <ReservationRail L={L} onOffer={onOffer} />
        </div>
      </div>
    </>
  );
}

// ---------------- chains ----------------
function ChainsView({ onBack, onOpenLot, onJoin }) {
  const [sel, setSel] = React.useState(null);
  const chain = sel ? CHAINS.find(c => c.id === sel) : null;
  if (chain) return <ChainDetailW chain={chain} onBack={() => setSel(null)} onJoin={onJoin} onOpenLot={onOpenLot} />;
  return (
    <div className="web-container web-section">
      <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />На главную</button>
      <div className="web-head" style={{ marginTop: 16 }}>
        <h2>Многосторонние обмены</h2>
        <AIBadge>Подобрано для вас</AIBadge>
      </div>
      <div className="web-grid">
        {CHAINS.map(c => (
          <div key={c.id} className="web-lot" onClick={() => setSel(c.id)}>
            <div className="web-lot-photo">
              <Photo label={MY_LOT.photo} url={MY_LOT.photoUrl} cat={MY_LOT.cat} />
              <span className="web-lot-badge" style={{ right: 12, left: 'auto' }}><Icon name="chain" size={11} color="var(--berry)" /> {c.score}%</span>
            </div>
            <div className="web-lot-meta">
              <span className="web-lot-title">Цепочка из {c.steps.length} участников</span>
              <span className="web-lot-sub">{c.note}</span>
              <span className="web-lot-sub">Вы получаете: {c.steps[c.steps.length - 1].gives}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChainDetailW({ chain, onBack, onJoin }) {
  const who = (id) => (id === 'me' ? { ...ME, name: 'Вы' } : U[id]);
  return (
    <div className="web-container web-section">
      <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />Все цепочки</button>
      <div className="web-head" style={{ marginTop: 16 }}>
        <h2>Цепочка · {chain.steps.length} участника</h2>
        <span className="tag" style={{ background: 'var(--berry)', color: '#fff', fontSize: 13, padding: '6px 12px' }}>{chain.score}% совпадение</span>
      </div>
      <div className="card" style={{ padding: 24, maxWidth: 720 }}>
        {chain.steps.map((s, i) => {
          const u = who(s.who);
          return (
            <div key={i}>
              <div className="row gap14" style={{ padding: '10px 0' }}>
                <Avatar user={s.who} size={46} />
                <div className="grow col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</span>
                  <span className="sub">отдаёт <b style={{ color: 'var(--ink)' }}>{s.gives}</b> → получает {who(s.to).name}</span>
                </div>
                <Credit n={s.value} size={15} coin={14} />
              </div>
              {i < chain.steps.length - 1 && <div style={{ width: 2, height: 22, marginLeft: 22, background: 'var(--berry-200)' }} />}
            </div>
          );
        })}
      </div>
      <div className="card" style={{ padding: 18, marginTop: 20, maxWidth: 720, background: 'var(--ok-soft)' }}>
        <div className="row gap10" style={{ alignItems: 'flex-start' }}>
          <Icon name="shield" size={22} color="var(--ok)" />
          <div className="col gap4">
            <span style={{ fontSize: 15, fontWeight: 600, color: '#15663f' }}>Цепочка под защитой эскроу</span>
            <span style={{ fontSize: 14, color: '#2c6a48', lineHeight: 1.5 }}>{chain.note} Сделка проходит, только если все участники подтвердят получение.</span>
          </div>
        </div>
      </div>
      <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={() => onJoin(chain)}><Icon name="chain" size={19} color="#fff" />Вступить в цепочку</button>
    </div>
  );
}

// ---------------- deals ----------------
function DealsView({ onBack, onOpenLot }) {
  return (
    <div className="web-container web-section">
      <button className="web-back" onClick={onBack}><Icon name="back" size={16} color="var(--ink-2)" />На главную</button>
      <div className="web-head" style={{ marginTop: 16 }}><h2>Сделки</h2></div>
      <div className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>
        {CHATLIST.map((c, i) => {
          const u = U[c.owner];
          return (
            <div key={c.id} className="row gap14" style={{ padding: '16px 20px', borderTop: i ? '1px solid var(--line-2)' : 'none', cursor: 'pointer' }}>
              <Avatar user={c.owner} size={48} />
              <div className="grow col" style={{ gap: 2 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</span>
                  <span className="cap">{c.t}</span>
                </div>
                <span className="sub">{c.deal}</span>
                <span className="cap ellipsis" style={{ maxWidth: 500 }}>{c.last}</span>
              </div>
              {c.unread > 0 && <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--berry)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- profile ----------------
function ProfileView({ user, profile, myLots, onOpenLot, onLogout, onProfileSaved, onWallet, onEditLot }) {
  const [editing, setEditing] = React.useState(false);
  const name = (user && user.name) || ME.name;
  const city = (user && user.city) || ME.city;
  const rating = (user && user.rating) || ME.rating;
  const deals = (user && user.dealsCount) || ME.deals;
  const balance = (user && user.balance) || 0;
  const bio = (profile && profile.bio) || (user && user.bio) || '';
  const avatar = (profile && profile.avatar) || (user && user.avatar) || '';
  const reviews = (profile && profile.reviews) || [];

  return (
    <>
      <div className="web-container web-section">
        <div className="row gap20" style={{ gap: 40, alignItems: 'flex-start' }}>
          <div className="col" style={{ alignItems: 'center', gap: 14, flex: 'none', width: 280 }}>
            {avatar ? (
              <div style={{ width: 120, height: 120, borderRadius: 999, overflow: 'hidden', boxShadow: 'var(--sh-2)' }}><img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
            ) : (
              <div style={{ width: 120, height: 120, borderRadius: 999, background: 'linear-gradient(135deg, var(--berry), var(--berry-500))', color: '#fff', fontSize: 48, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--sh-2)' }}>{name.charAt(0)}</div>
            )}
            <div className="col" style={{ alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{name}</span>
              <span className="sub"><Icon name="map" size={13} color="var(--ink-3)" /> {city}</span>
              <span className="web-rating-row"><Icon name="star" size={14} color="var(--ink)" /> {rating} · {deals} сделок</span>
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
            <div className="web-head"><h2>Объявления</h2><a href="#" onClick={e => e.preventDefault()}>Все →</a></div>
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
export default function WebApp({ lots, myLots, user, profile, onLogout, onProfileSaved, onOffer, onCreate, onEditLot }) {
  const [view, setView] = React.useState('home');
  const [cat, setCat] = React.useState('all');
  const [city, setCity] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [selLot, setSelLot] = React.useState(null);
  const avatar = (profile && profile.avatar) || (user && user.avatar) || '';
  const selected = selLot ? lots.find(l => l.id === selLot) || lot(selLot) || null : null;

  const goHome = () => { setView('home'); setSelLot(null); };

  return (
    <div className="web">
      <WebNav view={view} setView={setView} user={user} avatar={avatar} query={query} setQuery={setQuery} onLogout={onLogout} onCreate={onCreate} />
      <div className="web-body">
        {view === 'home' && <HomeView lots={lots} query={query} setQuery={setQuery} cat={cat} setCat={setCat} city={city} setCity={setCity} onOpen={(id) => { setSelLot(id); setView('lot'); }} onOffer={onOffer} onChains={() => setView('chains')} />}
        {view === 'lot' && selected && <LotView L={selected} onBack={goHome} onOffer={onOffer} />}
        {view === 'chains' && <ChainsView onBack={goHome} onJoin={() => { setView('deals'); }} />}
        {view === 'deals' && <DealsView onBack={goHome} />}
        {view === 'profile' && <ProfileView user={user} profile={profile} myLots={myLots} onOpenLot={(id) => { setSelLot(id); setView('lot'); }} onLogout={onLogout} onProfileSaved={onProfileSaved} onWallet={goHome} onEditLot={onEditLot} />}
      </div>
      <WebFooter />
    </div>
  );
}
