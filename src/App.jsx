'use client';
// App.jsx — root: navigation, phone frame scaling, tweaks
import React from 'react';
import { bootstrapAction, loadAuthedDataAction, logoutAction, createLotAction, updateLotAction, getWalletAction, listDealsAction, listChatsAction, getMatchesAction, createDealAction, confirmReceiptAction, confirmPartnerAction, cancelDealAction, createReviewAction, topUpAction, joinChainAction, startChatAction, getDealChatAction, toggleFavoriteAction } from './server/actions.js';
import { FeedList, FeedSwipe, CatRow, FavoritesScreen } from './screen-feed.jsx';
import { FeedChain, ChainDetail } from './screen-chain.jsx';
import { LotDetail, OfferSheet } from './screen-lot.jsx';
import { DealStatus } from './screen-deal.jsx';
import { DealsList, ChatThread } from './screen-chat.jsx';
import { Wallet, CreditsInfo } from './screen-wallet.jsx';
import { Onboarding, CreateListing } from './screen-onboarding.jsx';
import { AuthScreen } from './screen-auth.jsx';
import { ProfileScreen, SettingsScreen, MyLotsScreen } from './screen-profile.jsx';
import WebApp from './web-app.jsx';
import { parseRoute, tabPath, screenPath, readPath } from './router.js';

import { Logo, AppBar, IconBtn, TabBar } from './ui.jsx';
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
  accent: '#4b2bc9',
  matchHints: true,
};

const ONBOARDED_KEY = 'dayberry_onboarded';

const ACCENTS = {
  // фирменный — совпадает со значениями в design.css
  '#4b2bc9': { berry900: '#2c1975', berry700: '#3e22b5', berry: '#4b2bc9', berry500: '#5b35e6', b200: '#b7b5f8', b100: '#e9e6f9', b50: '#f4f2fc' },
  '#1f8a5b': { berry900: '#0d3a26', berry700: '#176844', berry: '#1f8a5b', berry500: '#2aa56e', b200: '#aedcc4', b100: '#dcf0e6', b50: '#f1faf5' },
  '#e8541e': { berry900: '#6e2408', berry700: '#b53c12', berry: '#e8541e', berry500: '#f06a38', b200: '#f7c3aa', b100: '#fde6da', b50: '#fff6f1' },
};

function applyAccent(hex) {
  const a = ACCENTS[hex] || ACCENTS['#4b2bc9'];
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
  const [path, setPath] = React.useState(readPath);
  const publishingRef = React.useRef(false);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authMsg, setAuthMsg] = React.useState('');
  const pendingActionRef = React.useRef(null);
  const [offerLot, setOfferLot] = React.useState(null);
  const [deal, setDeal] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [editingLot, setEditingLot] = React.useState(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [lots, setLots] = React.useState([]);
  const [lotsLoading, setLotsLoading] = React.useState(true);
  const [myLots, setMyLots] = React.useState([]);
  const [profile, setProfile] = React.useState(null);
  const [deals, setDeals] = React.useState([]);
  const [wallet, setWallet] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [chains, setChains] = React.useState([]);
  const [matches, setMatches] = React.useState([]);
  const [favorites, setFavorites] = React.useState([]);
  const [snack, setSnack] = React.useState('');
  const snackTimer = React.useRef(null);
  const isDesktop = useMediaQuery('(min-width: 1128px)');

  const favIds = React.useMemo(() => new Set(favorites.map(f => f.id)), [favorites]);

  const showSnack = (msg) => {
    setSnack(msg);
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnack(''), 8000);
  };

  // URL routing (hash-based history): every screen has its own address,
  // browser back/forward and deep links work naturally.
  React.useEffect(() => {
    const onHash = () => setPath(readPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Serve over HTTPS: bounce http -> https (unless local dev).
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      window.location.replace('https://' + window.location.host + window.location.pathname + window.location.hash);
    }
  }, []);

  const navigate = (to, opts = {}) => {
    if (typeof window === 'undefined') return;
    const hash = to === '/' ? '' : '#' + to;
    if (opts.replace) {
      window.history.replaceState(null, '', hash);
      setPath(to);
    } else {
      window.location.hash = hash;
      setPath(to);
    }
  };

  const route = React.useMemo(() => parseRoute(path), [path]);
  const tab = route.tab;
  const stack = route.stack;
  const top = stack[stack.length - 1];

  const go = (name, params = {}) => navigate(screenPath(name, params));
  const back = () => {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) window.history.back();
    else navigate('/');
  };
  const setTab = (id) => { navigate(tabPath(id)); };
  const resetTo = (id) => { navigate(tabPath(id), { replace: true }); };

  React.useEffect(() => { applyAccent(t.accent); }, [t.accent]);

  const loadAuthedData = async () => {
    const d = await loadAuthedDataAction();
    if (!d) return;
    setMyLots(d.myLots || []);
    setProfile(d.profile);
    setDeals(d.deals || []);
    setWallet(d.wallet);
    setChats(d.chats || []);
    setFavorites(d.favorites || []);
  };

  // Баланс живёт в трёх местах: кошелёк, карточка пользователя и профиль.
  // Экраны читают его из разных источников (профиль — из currentUser), поэтому
  // после любой операции с баллами синхронизируем все три, иначе профиль
  // показывает сумму до списания, пока страницу не перезагрузят.
  const refreshWallet = async () => {
    const wa = await getWalletAction();
    if (!wa) return null;
    setWallet(wa);
    setCurrentUser(u => (u && u.balance !== wa.balance ? { ...u, balance: wa.balance } : u));
    setProfile(p => (p && p.balance !== wa.balance ? { ...p, balance: wa.balance } : p));
    return wa;
  };

  // Мэтчинг ходит во внешний AI — держим его вне критического пути загрузки.
  const loadMatches = async () => {
    try {
      const ma = await getMatchesAction();
      setMatches(ma || []);
    } catch (e) {
      console.error('matches failed', e);
    }
  };

  // Прогрессивная загрузка в три round-trip'а вместо десяти: сессия с лентой,
  // затем данные пользователя, и только в конце AI-мэтчи. Порядок здесь — это
  // и есть приоритет отрисовки, потому что server actions идут последовательно.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let u = null;
      try {
        const boot = await bootstrapAction();
        if (cancelled) return;
        u = boot.user;
        setLots(boot.lots || []);
        setChains(boot.chains || []);
        if (u) { setCurrentUser(u); setAuthed(true); } else { setAuthed(false); }
      } catch (e) {
        console.error('bootstrap failed', e);
      } finally {
        if (!cancelled) { setBooting(false); setLotsLoading(false); }
      }

      if (cancelled || !u) return;
      try { await loadAuthedData(); } catch (e) { console.error('authed data failed', e); }
      if (cancelled) return;
      loadMatches();
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAuth = async (user) => {
    setCurrentUser(user);
    setAuthed(true);
    setAuthOpen(false);
    try { await loadAuthedData(); } catch (e) { console.error('load after auth failed', e); }
    loadMatches();
    const next = pendingActionRef.current;
    pendingActionRef.current = null;
    if (next) next();
  };

  const requireAuth = (msg, action) => {
    if (authed) { if (action) action(); return true; }
    setAuthMsg(msg || 'Войдите или зарегистрируйтесь, чтобы продолжить');
    pendingActionRef.current = action || null;
    setAuthOpen(true);
    return false;
  };

  const guardedTab = (t) => {
    if (!authed && (t === 'deals' || t === 'wallet' || t === 'profile' || t === 'favorites' || t === 'mylots')) {
      requireAuth('Войдите, чтобы открыть этот раздел', () => { navigate(tabPath(t)); });
      return;
    }
    navigate(tabPath(t));
  };

  // Сердечко переключается сразу, не дожидаясь сервера: server actions идут
  // последовательно, и на живом соединении ответ может прийти через полсекунды —
  // тап по сердечку столько ждать не должен. При ошибке откатываем.
  const toggleFav = async (L) => {
    if (!L) return;
    requireAuth('Войдите, чтобы добавлять в избранное', async () => {
      const wasFav = favIds.has(L.id);
      setFavorites(fs => (wasFav ? fs.filter(x => x.id !== L.id) : (fs.some(x => x.id === L.id) ? fs : [L, ...fs])));
      try {
        const res = await toggleFavoriteAction(L.id);
        if (!res.ok) throw new Error(res.error || 'toggle failed');
        // сервер — источник истины: приводим состояние к его ответу
        setFavorites(fs => (res.fav
          ? (fs.some(x => x.id === L.id) ? fs : [L, ...fs])
          : fs.filter(x => x.id !== L.id)));
      } catch (e) {
        console.error('toggle fav failed', e);
        setFavorites(fs => (wasFav ? (fs.some(x => x.id === L.id) ? fs : [L, ...fs]) : fs.filter(x => x.id !== L.id)));
        showSnack('Не удалось сохранить в избранное — попробуйте ещё раз');
      }
    });
  };

  const handleLogout = () => {
    logoutAction();
    setCurrentUser(null);
    setAuthed(false);
    setAuthOpen(false);
    navigate('/');
  };

  const publishLot = async (lotData) => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    try {
      const res = lotData && lotData.id
        ? await updateLotAction(lotData.id, lotData)
        : await createLotAction(lotData);
      if (!res.ok) {
        showSnack(res.error || 'Не удалось сохранить объявление');
        throw new Error(res.error || 'Не удалось сохранить объявление');
      }
      if (lotData && lotData.id) {
        setLots(ls => ls.map(x => x.id === res.lot.id ? res.lot : x));
        setMyLots(ms => ms.map(x => x.id === res.lot.id ? res.lot : x));
      } else {
        setLots(ls => [res.lot, ...ls]);
        setMyLots(ms => [res.lot, ...ms]);
      }
      setCreating(false);
      setEditingLot(null);
      resetTo('home');
    } catch (e) {
      console.error('publish failed', e);
      if (!(e && e.message && e.message.indexOf('Не удалось сохранить объявление') === 0)) {
        showSnack('Не удалось сохранить объявление — обновите страницу и попробуйте ещё раз');
      }
      throw e;
    } finally {
      publishingRef.current = false;
    }
  };

  const topDeal = deal || (top && top.name === 'deal' && top.params && top.params.id ? deals.find(x => x.id === top.params.id) : null) || null;

  const openDeal = (id) => {
    const d = deals.find(x => x.id === id) || deal || deals[0];
    setDeal(d);
    go('deal', { id: d ? d.id : id });
  };

  const confirmDeal = async (d) => {
    const target = d || deal;
    if (!target) return;
    try {
      const res = target.role === 'partner' ? await confirmPartnerAction(target.id) : await confirmReceiptAction(target.id);
      if (!res.ok) { showSnack(res.error || 'Не удалось подтвердить'); return; }
      setDeal(res.deal);
      setDeals(ds => ds.map(x => x.id === res.deal.id ? res.deal : x));
      await refreshWallet();
    } catch (e) {
      console.error('confirm failed', e);
      showSnack('Не удалось подтвердить — обновите страницу и попробуйте ещё раз');
    }
  };

  const cancelDeal = async (d) => {
    const target = d || deal;
    if (!target) return false;
    try {
      const res = await cancelDealAction(target.id);
      if (!res.ok) { showSnack(res.error || 'Не удалось отменить сделку'); return false; }
      setDeal(res.deal);
      setDeals(ds => ds.map(x => x.id === res.deal.id ? res.deal : x));
      await refreshWallet();
      return true;
    } catch (e) {
      console.error('cancel deal failed', e);
      showSnack('Не удалось отменить — обновите страницу и попробуйте ещё раз');
      return false;
    }
  };

  // Отзыв о партнёре: после успеха помечаем сделку оценённой, чтобы экран
  // завершения сразу перестал предлагать оценить, и подтягиваем свой профиль —
  // в нём мог измениться собственный рейтинг, если партнёр оценил параллельно.
  const submitReview = async (target, stars, text) => {
    if (!target) return { ok: false, error: 'Сделка не найдена' };
    try {
      const res = await createReviewAction({ dealId: target.id, rating: stars, text });
      if (!res.ok) return res;
      setDeals(ds => ds.map(d => (d.id === target.id ? { ...d, reviewed: true } : d)));
      setDeal(d => (d && d.id === target.id ? { ...d, reviewed: true } : d));
      showSnack('Спасибо! Отзыв сохранён');
      return res;
    } catch (e) {
      console.error('review failed', e);
      return { ok: false, error: 'Не удалось сохранить отзыв — попробуйте ещё раз' };
    }
  };

  const onCreate = () => requireAuth('Создать объявление можно после регистрации', () => { setAuthOpen(false); setCreating(true); });

  const openChatWith = async (L) => {
    if (!L) return;
    const existing = chats.find(c => c.partner.id === L.ownerId);
    if (existing) { go('chat', { id: existing.id }); return; }
    const res = await startChatAction(L.id);
    if (res.ok) {
      setChats(cs => (res.chat ? [res.chat, ...cs] : cs));
      go('chat', { id: res.chat.id });
    }
  };
  const handleOwnerChat = (L) => requireAuth('Войдите, чтобы написать владельцу', () => openChatWith(L));

  const openDealChat = async (d) => {
    const target = d || deal;
    if (!target) return;
    const ch = chats.find(c => c.deal && c.deal.id === target.id);
    if (ch) { go('chat', { id: ch.id }); return; }
    try {
      const res = await getDealChatAction(target.id);
      if (res && res.id) {
        setChats(cs => (cs.some(x => x.id === res.id) ? cs : [res, ...cs]));
        go('chat', { id: res.id });
      } else {
        showSnack('Чат пока недоступен — обновите страницу и попробуйте ещё раз');
      }
    } catch (e) {
      console.error('deal chat open failed', e);
      showSnack('Не удалось открыть чат — обновите страницу и попробуйте ещё раз');
    }
  };

  const tabRoot = () => {
    if (tab === 'search') {
      return <HomeTab t={t} go={go} tab={tab} setTab={guardedTab} onCreate={onCreate} lots={lots} lotsLoading={lotsLoading} myLots={myLots} matches={matches} chains={chains} favIds={favIds} onToggleFav={toggleFav} />;
    }
    if (tab === 'favorites') return (
      <div className="app"><div className="safe-top" />
        <FavoritesScreen lots={favorites} go={go} onToggleFav={toggleFav} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={0} />
      </div>
    );
    if (tab === 'mylots') return (
      <div className="app"><div className="safe-top" />
        <MyLotsScreen myLots={myLots} go={go} onCreate={onCreate} onEdit={(L) => requireAuth('Редактировать объявление можно после регистрации', () => setEditingLot(L))} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={0} />
      </div>
    );
    if (tab === 'deals') return (
      <div className="app"><div className="safe-top" />
        <DealsList chats={chats} deals={deals} onOpen={(id) => go('chat', { id })} onOpenDeal={(id) => openDeal(id)} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={0} />
      </div>
    );
    if (tab === 'wallet') return (
      <div className="app"><div className="safe-top" />
        <Wallet wallet={wallet} onInfo={() => setInfoOpen(true)} onTopUp={async (amt) => {
          try {
            const res = await topUpAction(amt);
            if (res.ok) await refreshWallet();
            return res;
          } catch (e) {
            console.error('top up failed', e);
            return { ok: false, error: 'Не удалось пополнить — обновите страницу и попробуйте ещё раз' };
          }
        }} />
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
        onOpenLot={(id) => go('lot', { lotId: id })}
        onOpenSettings={() => go('settings')}
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
        <LotDetail lots={lots} myLots={myLots} lotId={top.params.lotId} fav={favIds.has(top.params.lotId)} onToggleFav={() => toggleFav(lots.find(x => x.id === top.params.lotId))} onBack={back} onOffer={(L) => requireAuth('Предложить обмен можно после регистрации', () => setOfferLot(L))} onOwnerChat={() => handleOwnerChat(lots.find(x => x.id === top.params.lotId))} />
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
        <ChainDetail chainId={top.params.id} chains={chains} onBack={back} onJoin={(ch) => requireAuth('Вступить в цепочку можно после регистрации', async () => {
          const res = await joinChainAction(ch.id);
          await refreshWallet();
          back();
          if (res.ok) { const de = await listDealsAction(); setDeals(de || []); const dl = de.find(x => x.id === res.dealId); setDeal(dl); go('deal', { id: res.dealId }); }
        })} />
      </div>
    );
    if (top.name === 'deal') {
      const d = topDeal;
      if (!d) return null;
      return (
        <div className="app"><div className="safe-top" />
          <DealStatus deal={d} onBack={back} onConfirm={() => confirmDeal(d)} onCancel={async () => { const ok = await cancelDeal(d); if (ok) resetTo('deals'); }} onChat={() => openDealChat(d)} onDone={(where) => { setDeal(null); resetTo(where === 'home' ? 'home' : 'deals'); }} onRate={submitReview} />
        </div>
      );
    }
    if (top.name === 'chat') return (
      <ChatThread chatId={top.params.id} onBack={back} onOpenDeal={() => { const c = chats.find(x => x.id === top.params.id); openDeal(c && c.deal ? c.deal.id : undefined); }} />
    );
    if (top.name === 'settings') return (
      <div className="app"><div className="safe-top" />
        <SettingsScreen
          user={currentUser}
          profile={profile}
          onBack={back}
          onLogout={handleLogout}
          onGoWallet={() => navigate(tabPath('wallet'))}
          onProfileSaved={(updated) => {
            setCurrentUser(updated);
            setProfile(p => (p ? { ...p, ...updated } : updated));
          }}
        />
      </div>
    );
  };

  if (booting) {
    return (
      <div className="app-root col" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="pop"><Logo size={56} /></div>
      </div>
    );
  }

  const appContent = (
    <>
      {isDesktop ? (
        <WebApp
          lots={lots}
          lotsLoading={lotsLoading}
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
          onOffer={(L) => requireAuth('Предложить обмен можно после регистрации', () => setOfferLot(L))}
          onCreate={onCreate}
          onEditLot={(L) => requireAuth('Редактировать объявление можно после регистрации', () => setEditingLot(L))}
          onOwnerChat={handleOwnerChat}
          matches={matches}
          chats={chats}
          chains={chains}
          deals={deals}
          favorites={favorites}
          onToggleFav={toggleFav}
          onConfirmDeal={confirmDeal}
          onCancelDeal={cancelDeal}
          onRateDeal={submitReview}
        />
      ) : (
        <>
          {tabRoot()}
          {top && <div className="overlay-layer">{overlay()}</div>}
        </>
      )}
      {(creating || editingLot) && <div className="overlay-layer"><CreateListing onClose={() => { setCreating(false); setEditingLot(null); }} onPublish={publishLot} initialWants={currentUser && currentUser.wants} editLot={editingLot} /></div>}
      <OfferSheet L={offerLot} myLots={myLots || []} balance={wallet ? wallet.balance : 0} open={!!offerLot} onClose={() => setOfferLot(null)} onConfirm={async (L, credits, myLotId) => {
        setOfferLot(null);
        try {
          const res = await createDealAction({ lotId: L.id, credits, myLotId });
          if (!res.ok) { showSnack(res.error || 'Не удалось создать сделку'); return; }
          const de = await listDealsAction();
          setDeals(de || []);
          const d = de.find(x => x.id === res.deal.id) || res.deal;
          setDeal(d);
          await refreshWallet();
          const ch = await listChatsAction();
          setChats(ch || []);
          go('deal', { id: d.id });
        } catch (e) {
          console.error('createDealAction failed', e);
          showSnack('Не удалось создать сделку — обновите страницу и попробуйте ещё раз');
        }
      }} />
      <CreditsInfo open={infoOpen} onClose={() => setInfoOpen(false)} />
      {snack && <div className="snack" role="alert" onClick={() => setSnack('')}><Icon name="info" size={16} color="#fff" />{snack}</div>}
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

function HomeTab({ t, go, tab, setTab, onCreate, lots, lotsLoading, matches, chains, myLots, favIds, onToggleFav }) {
  const [cat, setCat] = React.useState('all');
  const [view, setView] = React.useState(t.mechanic || 'list');
  const [q, setQ] = React.useState('');
  const shown = lots.filter(l => (!q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div className="app">
      <div className="safe-top" />
      {/* Шапка и поиск сведены в одну строку: заголовок «Дайбери» на всю ширину
          съедал 71px постоянного места на каждом экране, а кнопка «+» дублировала
          центральную кнопку таббара. */}
      <div className="appbar" style={{ paddingBottom: 10, gap: 10 }}>
        <Logo size={34} />
        <div className="row gap8 grow" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 13px', boxShadow: 'var(--sh-1)', minWidth: 0 }}>
          <Icon name="search" size={19} color="var(--ink-3)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Что ищете для обмена?" style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, fontSize: 15, fontFamily: 'var(--font)', background: 'transparent', color: 'var(--ink)' }} />
          {q ? <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><Icon name="close" size={18} color="var(--ink-3)" /></button> : null}
        </div>
        <IconBtn name="bell" badge={0} />
      </div>
      {view !== 'chain' && <CatRow active={cat} setActive={setCat} />}
      <div className="app-scroll">
        {/* Переключатель режимов уехал внутрь прокрутки: режим выбирают редко,
            а 40px постоянной высоты он занимал всегда. */}
        <div className="row gap6" style={{ padding: '2px 18px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {VIEW_MODES.map(m => (
            <button key={m.id} onClick={() => setView(m.id)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all .15s',
              background: view === m.id ? 'var(--berry)' : 'var(--line-2)',
              color: view === m.id ? '#fff' : 'var(--ink-2)',
            }}>{m.label}</button>
          ))}
        </div>
        {view === 'list' && <FeedList cat={cat} lots={shown} loading={lotsLoading} matches={matches} hints={t.matchHints} myLot={myLots && myLots[0]} onOpen={(id) => go('lot', { lotId: id })} onChains={() => setView('chain')} favIds={favIds} onToggleFav={onToggleFav} />}
        {view === 'swipe' && <FeedSwipe cat={cat} lots={shown} myLot={myLots && myLots[0]} onOpen={(id) => go('lot', { lotId: id })} />}
        {view === 'chain' && <FeedChain chains={chains} onOpenChain={(id) => go('chain', { id })} />}
      </div>
      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={0} />
    </div>
  );
}
