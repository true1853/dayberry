'use client';
// App.jsx — root: navigation, phone frame scaling, tweaks
import React from 'react';
import { sessionAction, listLots, logoutAction, createLotAction, updateLotAction, getMyLots, getProfileAction, listDealsAction, getWalletAction, listChatsAction, listChainsAction, getMatchesAction, createDealAction, confirmReceiptAction, joinChainAction } from './server/actions.js';
import { FeedList, FeedSwipe, CatRow } from './screen-feed.jsx';
import { FeedChain, ChainDetail } from './screen-chain.jsx';
import { LotDetail, OfferSheet } from './screen-lot.jsx';
import { DealStatus } from './screen-deal.jsx';
import { DealsList, ChatThread } from './screen-chat.jsx';
import { Wallet, CreditsInfo } from './screen-wallet.jsx';
import { Onboarding, CreateListing } from './screen-onboarding.jsx';
import { AuthScreen } from './screen-auth.jsx';
import { ProfileScreen } from './screen-profile.jsx';
import WebApp from './web-app.jsx';

import { AppBar, IconBtn, TabBar, LotCard } from './ui.jsx';
import { Icon } from './icons.jsx';
import { useTweaks } from './tweaks-panel.jsx';

const useMediaQuery = (query) => {
  const [matches, setMatches] = React.useState(() => typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const TWEAK_DEFAULTS = {
  mechanic: 'list',
  accent: '#ff385c',
  matchHints: true,
};

const ONBOARDED_KEY = 'dayberry_onboarded';

const ACCENTS = {
  '#ff385c': { berry900: '#a90a33', berry700: '#e00b41', berry: '#ff385c', berry500: '#ff5c77', b200: '#ffd1da', b100: '#ffe6eb', b50: '#fff0f3' },
  '#6a4ad6': { berry900: '#2c1e5e', berry700: '#4a30a8', berry: '#6a4ad6', berry500: '#7d5fe0', b200: '#cbbcf2', b100: '#ece6fb', b50: '#f6f3fe' },
  '#1f8a5b': { berry900: '#0d3a26', berry700: '#176844', berry: '#1f8a5b', berry500: '#2aa56e', b200: '#aedcc4', b100: '#dcf0e6', b50: '#f1faf5' },
  '#e8541e': { berry900: '#6e2408', berry700: '#b53c12', berry: '#e8541e', berry500: '#f06a38', b200: '#f7c3aa', b100: '#fde6da', b50: '#fff6f1' },
};

function applyAccent(hex) {
  const a = ACCENTS[hex] || ACCENTS['#ff385c'];
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
  const [t] = useTweaks(TWEAK_DEFAULTS);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [authed, setAuthed] = React.useState(false);
  const [booting, setBooting] = React.useState(true);
  const [onboarded, setOnboarded] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return false; }
  });
  const [tab, setTabRaw] = React.useState('home');
  const [stack, setStack] = React.useState([]);
  const publishingRef = React.useRef(false);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authMsg, setAuthMsg] = React.useState('');
  const [offerLot, setOfferLot] = React.useState(null);
  const [deal, setDeal] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [editingLot, setEditingLot] = React.useState(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [lots, setLots] = React.useState([]);
  const [myLots, setMyLots] = React.useState([]);
  const [profile, setProfile] = React.useState(null);
  const [deals, setDeals] = React.useState([]);
  const [wallet, setWallet] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [chains, setChains] = React.useState([]);
  const [matches, setMatches] = React.useState([]);
  const isDesktop = useMediaQuery('(min-width: 1128px)');

  React.useEffect(() => { applyAccent(t.accent); }, [t.accent]);

  React.useEffect(() => {
    (async () => {
      try {
        const [u, ls, ml, pf, de, wa, ch, cn, ma] = await Promise.all([
          sessionAction(), listLots(), getMyLots(), getProfileAction(),
          listDealsAction(), getWalletAction(), listChatsAction(), listChainsAction(), getMatchesAction(),
        ]);
        if (u) { setCurrentUser(u); setAuthed(true); }
        setLots(ls);
        setMyLots(ml);
        setProfile(pf);
        setDeals(de || []);
        setWallet(wa);
        setChats(ch || []);
        setChains(cn || []);
        setMatches(ma || []);
      } catch (e) {
        console.error('bootstrap failed', e);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleAuth = (user) => {
    setCurrentUser(user);
    setAuthed(true);
    setAuthOpen(false);
  };

  const requireAuth = (msg) => {
    if (authed) return true;
    setAuthMsg(msg || 'Войдите или зарегистрируйтесь, чтобы продолжить');
    setAuthOpen(true);
    return false;
  };

  const guardedTab = (t) => {
    if (!authed && (t === 'deals' || t === 'wallet' || t === 'profile')) {
      requireAuth('Войдите, чтобы открыть этот раздел');
      return;
    }
    setStack([]);
    setTabRaw(t);
  };

  const handleLogout = () => {
    logoutAction();
    setCurrentUser(null);
    setAuthed(false);
    setAuthOpen(false);
    setTabRaw('home');
    setStack([]);
  };

  const publishLot = async (lotData) => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    try {
      const res = lotData && lotData.id
        ? await updateLotAction(lotData.id, lotData)
        : await createLotAction(lotData);
      if (res.ok) {
        if (lotData && lotData.id) {
          setLots(ls => ls.map(x => x.id === res.lot.id ? res.lot : x));
          setMyLots(ms => ms.map(x => x.id === res.lot.id ? res.lot : x));
        } else {
          setLots(ls => [res.lot, ...ls]);
          setMyLots(ms => [res.lot, ...ms]);
        }
      }
    } finally {
      publishingRef.current = false;
      setCreating(false);
      setEditingLot(null);
      resetTo('home');
    }
  };

  const top = stack[stack.length - 1];
  const go = (name, params = {}) => setStack(s => [...s, { name, params }]);
  const back = () => setStack(s => s.slice(0, -1));
  const setTab = (id) => { setStack([]); setTabRaw(id); };
  const resetTo = (id) => { setStack([]); setTabRaw(id); };

  const openDeal = (id) => {
    const d = deals.find(x => x.id === id) || deal || deals[0];
    setDeal(d);
    go('deal');
  };

  const confirmReceipt = async () => {
    if (!deal) return;
    const res = await confirmReceiptAction(deal.id);
    if (res.ok) {
      setDeal(res.deal);
      setDeals(ds => ds.map(x => x.id === res.deal.id ? res.deal : x));
      const wa = await getWalletAction();
      if (wa) setWallet(wa);
    }
  };

  const onCreate = () => { if (requireAuth('Создать объявление можно после регистрации')) setCreating(true); };

  const tabRoot = () => {
    if (tab === 'home') {
      return <HomeTab t={t} go={go} tab={tab} setTab={guardedTab} onCreate={onCreate} lots={lots} myLots={myLots} matches={matches} chains={chains} />;
    }
    if (tab === 'search') return <SearchScreen go={go} tab={tab} setTab={guardedTab} onCreate={onCreate} lots={lots} />;
    if (tab === 'deals') return (
      <div className="app"><div className="safe-top" />
        <DealsList chats={chats} deals={deals} onOpen={(id) => go('chat', { id })} onOpenDeal={(id) => openDeal(id)} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={0} />
      </div>
    );
    if (tab === 'wallet') return (
      <div className="app"><div className="safe-top" />
        <Wallet wallet={wallet} onInfo={() => setInfoOpen(true)} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={0} />
      </div>
    );
    if (tab === 'profile') return (
      <ProfileScreen
        tab={tab}
        setTab={guardedTab}
        onCreate={onCreate}
        onLogout={handleLogout}
        user={currentUser}
        profile={profile}
        myLots={myLots}
        onEditLot={(L) => setEditingLot(L)}
        onProfileSaved={(updated) => {
          setCurrentUser(updated);
          setProfile(p => (p ? { ...p, ...updated } : updated));
        }}
      />
    );
  };

  const overlay = () => {
    if (!top) return null;
    if (top.name === 'lot') return (
      <div className="app"><div className="safe-top" />
        <LotDetail lots={lots} myLots={myLots} lotId={top.params.lotId} onBack={back} onOffer={(L) => { if (requireAuth('Предложить обмен можно после регистрации')) setOfferLot(L); }} onOwnerChat={() => {
          if (!requireAuth('Войдите, чтобы написать владельцу')) return;
          const L = lots.find(x => x.id === top.params.lotId);
          const ownerName = L ? (L.ownerName || '') : '';
          const ch = chats.find(c => c.partner.name === ownerName);
          if (ch) go('chat', { id: ch.id });
        }} />
      </div>
    );
    if (top.name === 'chainfeed') return (
      <div className="app"><div className="safe-top" />
        <AppBar sub="Многосторонний обмен" title="Цепочки" left={<IconBtn name="back" onClick={back} />} />
        <div className="app-scroll"><FeedChain chains={chains} onOpenChain={(id) => go('chain', { id })} /></div>
      </div>
    );
    if (top.name === 'chain') return (
      <div className="app"><div className="safe-top" />
        <ChainDetail chainId={top.params.id} chains={chains} onBack={back} onJoin={async (ch) => {
          if (!requireAuth('Вступить в цепочку можно после регистрации')) return;
          const res = await joinChainAction(ch.id);
          const wa = await getWalletAction();
          if (wa) setWallet(wa);
          back();
          if (res.ok) { const de = await listDealsAction(); setDeals(de || []); const dl = de.find(x => x.id === res.dealId); setDeal(dl); go('deal'); }
        }} />
      </div>
    );
    if (top.name === 'deal') return (
      <div className="app"><div className="safe-top" />
        <DealStatus deal={deal} onBack={back} onConfirm={confirmReceipt} onChat={() => { const ch = chats.find(c => c.deal && c.deal.id === deal.id); go('chat', { id: ch ? ch.id : undefined }); }} onDone={(where) => { setDeal(null); resetTo(where === 'home' ? 'home' : 'deals'); }} />
      </div>
    );
    if (top.name === 'chat') return (
      <ChatThread chatId={top.params.id} onBack={back} onOpenDeal={() => { const c = chats.find(x => x.id === top.params.id); openDeal(c && c.deal ? c.deal.id : undefined); }} />
    );
  };

  if (booting) {
    return (
      <div className="app-root col" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="logo pop" style={{ width: 56, height: 56, fontSize: 26 }}>ДБ</div>
      </div>
    );
  }

  const appContent = (
    <>
      {isDesktop ? (
        <WebApp
          lots={lots}
          myLots={myLots}
          user={currentUser}
          profile={profile}
          authed={authed}
          onAuthRequired={(m) => requireAuth(m)}
          onLogout={handleLogout}
          onProfileSaved={(updated) => {
            setCurrentUser(updated);
            setProfile(p => (p ? { ...p, ...updated } : updated));
          }}
          onOffer={(L) => { if (requireAuth('Предложить обмен можно после регистрации')) setOfferLot(L); }}
          onCreate={onCreate}
          onEditLot={(L) => { if (requireAuth('Редактировать объявление можно после регистрации')) setEditingLot(L); }}
          matches={matches}
          chats={chats}
          chains={chains}
        />
      ) : (
        <>
          {tabRoot()}
          {top && <div className="overlay-layer">{overlay()}</div>}
        </>
      )}
      {(creating || editingLot) && <div className="overlay-layer"><CreateListing onClose={() => { setCreating(false); setEditingLot(null); }} onPublish={publishLot} initialWants={currentUser && currentUser.wants} editLot={editingLot} /></div>}
      <OfferSheet L={offerLot} myLot={(myLots && myLots[0]) || null} balance={wallet ? wallet.balance : 0} open={!!offerLot} onClose={() => setOfferLot(null)} onConfirm={async (L, credits) => {
        setOfferLot(null);
        const res = await createDealAction({ lotId: L.id, credits });
        if (res.ok) {
          const de = await listDealsAction();
          setDeals(de || []);
          const d = de.find(x => x.id === res.deal.id) || res.deal;
          setDeal(d);
          const wa = await getWalletAction();
          if (wa) setWallet(wa);
          const ch = await listChatsAction();
          setChats(ch || []);
          go('deal');
        }
      }} />
      <CreditsInfo open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );

  if (!authed) {
    return (
      <div className="app-root">
        {appContent}
        {authOpen && <div className="overlay-layer"><AuthScreen message={authMsg} onClose={() => setAuthOpen(false)} onDone={handleAuth} /></div>}
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="app-root">
        <Onboarding onDone={() => {
          setOnboarded(true);
          try { window.localStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
        }} />
      </div>
    );
  }

  return (
    <div className="app-root">
      {appContent}
    </div>
  );
}

const VIEW_MODES = [
  { id: 'list',  label: 'Карточки' },
  { id: 'swipe', label: 'Свайпы' },
  { id: 'chain', label: 'Цепочки' },
];

function HomeTab({ t, go, tab, setTab, onCreate, lots, matches, chains, myLots }) {
  const [cat, setCat] = React.useState('all');
  const [view, setView] = React.useState(t.mechanic || 'list');

  return (
    <div className="app">
      <div className="safe-top" />
      <AppBar
        big sub="Обмен без денег" title="Дай бери"
        left={<div className="logo" style={{ width: 38, height: 38, fontSize: 17 }}>ДБ</div>}
        right={<IconBtn name="bell" badge={0} />}
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
        {view === 'list' && <FeedList cat={cat} lots={lots} matches={matches} hints={t.matchHints} myLot={myLots && myLots[0]} onOpen={(id) => go('lot', { lotId: id })} onChains={() => setView('chain')} />}
        {view === 'swipe' && <FeedSwipe cat={cat} lots={lots} myLot={myLots && myLots[0]} onOpen={(id) => go('lot', { lotId: id })} />}
        {view === 'chain' && <FeedChain chains={chains} onOpenChain={(id) => go('chain', { id })} />}
      </div>
      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={0} />
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
      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={0} />
    </div>
  );
}
