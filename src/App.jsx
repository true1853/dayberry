// App.jsx — root: navigation, phone frame scaling, tweaks
import React from 'react';
import { lot, MY_LOT, LOTS, ME } from './data.js';
import { getCurrentUser, setSession, clearSession, getMyLots, addLot } from './store.js';
import { FeedList, FeedSwipe, CatRow } from './screen-feed.jsx';
import { FeedChain, ChainDetail } from './screen-chain.jsx';
import { LotDetail, OfferSheet } from './screen-lot.jsx';
import { DealStatus } from './screen-deal.jsx';
import { DealsList, ChatThread } from './screen-chat.jsx';
import { Wallet, CreditsInfo } from './screen-wallet.jsx';
import { Onboarding, CreateListing } from './screen-onboarding.jsx';
import { AuthScreen } from './screen-auth.jsx';
import { ProfileScreen } from './screen-profile.jsx';

import { AppBar, IconBtn, TabBar, LotCard } from './ui.jsx';
import { Icon } from './icons.jsx';
import { useTweaks } from './tweaks-panel.jsx';

const TWEAK_DEFAULTS = {
  mechanic: 'list',
  accent: '#c1124f',
  showOnboarding: true,
  matchHints: true,
};

const ACCENTS = {
  '#c1124f': { berry900: '#5e0a29', berry700: '#8f0f3c', berry: '#c1124f', berry500: '#d6275f', b200: '#f2b8c6', b100: '#fbe2ea', b50: '#fef5f8' },
  '#6a4ad6': { berry900: '#2c1e5e', berry700: '#4a30a8', berry: '#6a4ad6', berry500: '#7d5fe0', b200: '#cbbcf2', b100: '#ece6fb', b50: '#f6f3fe' },
  '#1f8a5b': { berry900: '#0d3a26', berry700: '#176844', berry: '#1f8a5b', berry500: '#2aa56e', b200: '#aedcc4', b100: '#dcf0e6', b50: '#f1faf5' },
  '#e8541e': { berry900: '#6e2408', berry700: '#b53c12', berry: '#e8541e', berry500: '#f06a38', b200: '#f7c3aa', b100: '#fde6da', b50: '#fff6f1' },
};

function applyAccent(hex) {
  const a = ACCENTS[hex] || ACCENTS['#c1124f'];
  const r = document.documentElement.style;
  r.setProperty('--berry-900', a.berry900);
  r.setProperty('--berry-700', a.berry700);
  r.setProperty('--berry', a.berry);
  r.setProperty('--berry-500', a.berry500);
  r.setProperty('--berry-200', a.b200);
  r.setProperty('--berry-100', a.b100);
  r.setProperty('--berry-50', a.b50);
}


export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [currentUser, setCurrentUser] = React.useState(getCurrentUser);
  const [authed, setAuthed] = React.useState(!!currentUser);
  const [onboarded, setOnboarded] = React.useState(!t.showOnboarding);
  const [tab, setTabRaw] = React.useState('home');
  const [stack, setStack] = React.useState([]);
  const [offerLot, setOfferLot] = React.useState(null);
  const [deal, setDeal] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [myLots, setMyLots] = React.useState(getMyLots);
  const allLots = React.useMemo(() => [...myLots, ...LOTS], [myLots]);

  const syncMe = (user) => {
    ME.name = user.name;
    ME.initials = (user.name || '?').trim().charAt(0).toUpperCase() || '?';
    ME.city = user.city || 'Москва';
  };

  React.useEffect(() => { if (currentUser) syncMe(currentUser); }, []); // restore "me" after reload
  React.useEffect(() => { applyAccent(t.accent); }, [t.accent]);
  React.useEffect(() => { if (t.showOnboarding) setOnboarded(false); }, [t.showOnboarding]);

  const handleAuth = (user) => {
    setSession(user.email);
    setCurrentUser(user);
    syncMe(user);
    setAuthed(true);
  };

  const handleLogout = () => {
    clearSession();
    setCurrentUser(null);
    setAuthed(false);
  };

  const publishLot = (lotData) => {
    addLot(lotData);
    setMyLots(getMyLots());
    setCreating(false);
    resetTo('home');
  };

  const top = stack[stack.length - 1];
  const go = (name, params = {}) => setStack(s => [...s, { name, params }]);
  const back = () => setStack(s => s.slice(0, -1));
  const setTab = (id) => { setStack([]); setTabRaw(id); };
  const resetTo = (id) => { setStack([]); setTabRaw(id); };

  const ensureDeal = () => {
    if (deal) return deal;
    const d = { L: lot('l1'), credits: 10000, stage: 'meet' };
    setDeal(d); return d;
  };

  const openDeal = () => { ensureDeal(); go('deal'); };
  const confirmReceipt = () => setDeal(d => ({ ...d, stage: 'done' }));

  const tabRoot = () => {
    if (tab === 'home') {
      return <HomeTab t={t} go={go} tab={tab} setTab={setTab} onCreate={() => setCreating(true)} lots={allLots} />;
    }
    if (tab === 'search') return <SearchScreen go={go} tab={tab} setTab={setTab} onCreate={() => setCreating(true)} lots={allLots} />;
    if (tab === 'deals') return (
      <div className="app"><div className="safe-top" />
        <DealsList onOpen={(id) => go('chat', { id })} onOpenDeal={openDeal} />
        <TabBar tab={tab} setTab={setTab} onCreate={() => setCreating(true)} unread={2} />
      </div>
    );
    if (tab === 'wallet') return (
      <div className="app"><div className="safe-top" />
        <Wallet onInfo={() => setInfoOpen(true)} />
        <TabBar tab={tab} setTab={setTab} onCreate={() => setCreating(true)} unread={2} />
      </div>
    );
    if (tab === 'profile') return (
      <ProfileScreen tab={tab} setTab={setTab} onCreate={() => setCreating(true)} onLogout={handleLogout} user={currentUser} myLots={myLots} />
    );
  };

  const overlay = () => {
    if (!top) return null;
    if (top.name === 'lot') return (
      <div className="app"><div className="safe-top" />
        <LotDetail lots={allLots} lotId={top.params.lotId} onBack={back} onOffer={(L) => setOfferLot(L)} onOwnerChat={() => go('chat', { id: 'c1' })} />
      </div>
    );
    if (top.name === 'chainfeed') return (
      <div className="app"><div className="safe-top" />
        <AppBar sub="Многосторонний обмен" title="Цепочки" left={<IconBtn name="back" onClick={back} />} />
        <div className="app-scroll"><FeedChain onOpenChain={(id) => go('chain', { id })} /></div>
      </div>
    );
    if (top.name === 'chain') return (
      <div className="app"><div className="safe-top" />
        <ChainDetail chainId={top.params.id} onBack={back} onJoin={(ch) => { const last = ch.steps[ch.steps.length - 1]; const myV = ch.steps.find(s => s.who === 'me').value; setDeal({ L: { ...lot('l3'), title: last.gives, photo: 'MACBOOK', cat: 'gadget', value: last.value, owner: last.who === 'me' ? 'dasha' : last.who }, credits: Math.max(0, last.value - myV) || 0, stage: 'created', chain: true }); go('deal'); }} />
      </div>
    );
    if (top.name === 'deal') return (
      <div className="app"><div className="safe-top" />
        <DealStatus deal={deal} onBack={back} onConfirm={confirmReceipt} onChat={() => go('chat', { id: 'c1' })} onDone={(where) => { setDeal(null); resetTo(where === 'home' ? 'home' : 'deals'); }} />
      </div>
    );
    if (top.name === 'chat') return (
      <ChatThread chatId={top.params.id} onBack={back} onOpenDeal={openDeal} />
    );
  };

  if (!authed) {
    return (
      <div className="app-root">
        <AuthScreen onDone={handleAuth} />
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="app-root">
        <Onboarding onDone={() => { setOnboarded(true); setTweak('showOnboarding', false); }} />
      </div>
    );
  }

  return (
    <div className="app-root">
      {tabRoot()}
      {top && <div className="overlay-layer">{overlay()}</div>}
      {creating && <div className="overlay-layer"><CreateListing onClose={() => setCreating(false)} onPublish={publishLot} /></div>}
      <OfferSheet L={offerLot} open={!!offerLot} onClose={() => setOfferLot(null)} onConfirm={(L, credits) => { setOfferLot(null); setDeal({ L, credits, stage: 'created' }); go('deal'); }} />
      <CreditsInfo open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

const VIEW_MODES = [
  { id: 'list',  label: 'Карточки' },
  { id: 'swipe', label: 'Свайпы' },
  { id: 'chain', label: 'Цепочки' },
];

function HomeTab({ t, go, tab, setTab, onCreate, lots }) {
  const [cat, setCat] = React.useState('all');
  const [view, setView] = React.useState(t.mechanic || 'list');

  return (
    <div className="app">
      <div className="safe-top" />
      <AppBar
        big sub="Обмен без денег" title="Дай бери"
        left={<div className="coin" style={{ width: 38, height: 38, fontSize: 21 }}>Б</div>}
        right={<IconBtn name="bell" badge={2} />}
      />
      {/* view switcher */}
      <div className="row gap6" style={{ padding: '0 18px 10px', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0 }}>
        {VIEW_MODES.map(m => (
          <button key={m.id} onClick={() => setView(m.id)} style={{
            padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all .15s',
            background: view === m.id ? 'var(--berry)' : 'var(--line-2)',
            color: view === m.id ? '#fff' : 'var(--ink-2)',
          }}>{m.label}</button>
        ))}
      </div>
      {view !== 'chain' && <CatRow active={cat} setActive={setCat} />}
      <div className="app-scroll">
        {view === 'list' && <FeedList cat={cat} lots={lots} hints={t.matchHints} onOpen={(id) => go('lot', { lotId: id })} onChains={() => setView('chain')} />}
        {view === 'swipe' && <FeedSwipe cat={cat} lots={lots} onOpen={(id) => go('lot', { lotId: id })} />}
        {view === 'chain' && <FeedChain onOpenChain={(id) => go('chain', { id })} />}
      </div>
      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={2} />
    </div>
  );
}

function SearchScreen({ go, tab, setTab, onCreate, lots }) {
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const items = lots.filter(l => (cat === 'all' || l.cat === cat) && (!q || l.title.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="app"><div className="safe-top" />
      <div className="appbar" style={{ paddingBottom: 8 }}>
        <div className="row gap8 grow" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px', boxShadow: 'var(--sh-1)' }}>
          <Icon name="search" size={20} color="var(--ink-3)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Что ищете для обмена?" style={{ border: 'none', outline: 'none', flex: 1, fontSize: 15, fontFamily: 'var(--font)', background: 'transparent' }} />
        </div>
        <IconBtn name="filter" />
      </div>
      <div className="row gap8" style={{ overflowX: 'auto', padding: '2px 18px 8px', scrollbarWidth: 'none' }}>
        {[['all', 'Всё'], ['gadget', 'Техника'], ['digital', 'Услуги'], ['eco', 'Вещи и эко']].map(([id, l]) => <div key={id} className={'chip chip-berry' + (cat === id ? ' is-on' : '')} onClick={() => setCat(id)}>{l}</div>)}
      </div>
      <div className="app-scroll px" style={{ paddingTop: 4, paddingBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {items.map(l => <LotCard key={l.id} lot={l} compact onClick={() => go('lot', { lotId: l.id })} />)}
        </div>
        {!items.length && <div className="col gap8" style={{ alignItems: 'center', padding: '50px 20px', textAlign: 'center' }}><Icon name="search" size={32} color="var(--ink-3)" /><span className="sub">Ничего не нашлось — попробуйте другой запрос</span></div>}
      </div>
      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={2} />
    </div>
  );
}
