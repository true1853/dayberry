'use client';
// App.jsx — root: navigation, phone frame scaling, tweaks
import React from 'react';
import { bootstrapAction, loadAuthedDataAction, logoutAction, createLotAction, updateLotAction, getWalletAction, listDealsAction, listChatsAction, getMatchesAction, createDealAction, confirmReceiptAction, confirmPartnerAction, cancelDealAction, createReviewAction, openDisputeAction, topUpAction, startChatAction, getDealChatAction, toggleFavoriteAction, listChainsAction, refreshChainsAction, startChainAction, respondChainAction, confirmChainSentAction, confirmChainReceivedAction, listNotificationsAction, markNotificationsReadAction, getArchivedLots, archiveLotAction, restoreLotAction, deleteLotAction } from './server/actions.js';
import { FeedList, FeedSwipe, CatRow, FavoritesScreen } from './screen-feed.jsx';
import { matchesQuery } from './data.js';
import { FeedChain, ChainDetail } from './screen-chain.jsx';
import { NotificationsSheet } from './screen-notifications.jsx';
import { LotDetail, OfferSheet } from './screen-lot.jsx';
import { DealStatus } from './screen-deal.jsx';
import { DealsList, ChatThread } from './screen-chat.jsx';
import { Wallet, CreditsInfo } from './screen-wallet.jsx';
import { Onboarding, CreateListing } from './screen-onboarding.jsx';
import { AuthScreen } from './screen-auth.jsx';
import { ProfileScreen, SettingsScreen, MyLotsScreen, FunnelScreen, BroadcastScreen, DisputesScreen, ResetsScreen, ReportsScreen, RulesScreen } from './screen-profile.jsx';
import WebApp from './web-app.jsx';
import { parseRoute, tabPath, screenPath, readPath } from './router.js';

import { Logo, AppBar, IconBtn, TabBar, SplashScreen, PullToRefresh, FabCreate } from './ui.jsx';
import { Icon } from './icons.jsx';
import { useTweaks } from './tweaks-panel.jsx';
import { registerServiceWorker, useInstallPrompt, InstallBanner } from './pwa.jsx';
import { trackGoal } from '../app/metrika.jsx';

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
const CHAIN_SCOPE_KEY = 'dayberry_chain_scope';

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
  const [justRegistered, setJustRegistered] = React.useState(false);
  const [authMsg, setAuthMsg] = React.useState('');
  const pendingActionRef = React.useRef(null);
  const [offerLot, setOfferLot] = React.useState(null);
  // Идентификатор команды создания сделки. Он остаётся тем же, пока не
  // изменились условия предложения: повтор после обрыва связи не должен
  // открыть вторую сделку и заморозить баллы дважды.
  const createCommandRef = React.useRef({ key: '', id: '' });
  const [deal, setDeal] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [editingLot, setEditingLot] = React.useState(null);
  const [chainStats, setChainStats] = React.useState(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [lots, setLots] = React.useState([]);
  const [lotsLoading, setLotsLoading] = React.useState(true);
  const [myLots, setMyLots] = React.useState([]);
  const [archivedLots, setArchivedLots] = React.useState([]);
  const [profile, setProfile] = React.useState(null);
  const [deals, setDeals] = React.useState([]);
  const [wallet, setWallet] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [chains, setChains] = React.useState([]);
  const [chainBusy, setChainBusy] = React.useState(false);
  const [chainsRefreshing, setChainsRefreshing] = React.useState(false);
  const [notifications, setNotifications] = React.useState({ items: [], unread: 0 });
  const [notifOpen, setNotifOpen] = React.useState(false);
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

  // Сервис-воркер: офлайн-заглушка вместо браузерной ошибки и приём push.
  React.useEffect(() => { registerServiceWorker(); }, []);
  const installPrompt = useInstallPrompt();

  const loadAuthedData = async () => {
    const d = await loadAuthedDataAction();
    if (!d) return;
    setMyLots(d.myLots || []);
    setProfile(d.profile);
    setDeals(d.deals || []);
    setWallet(d.wallet);
    setChats(d.chats || []);
    setFavorites(d.favorites || []);
    setNotifications(d.notifications || { items: [], unread: 0 });
    try { setArchivedLots(await getArchivedLots()); } catch (e) { console.error('archived lots failed', e); }
  };

  // ---- цепочки ----
  //
  // После любого ответа участника состояние меняется у всех сразу (согласие,
  // отказ, замена), поэтому перечитываем список целиком, а не патчим одну
  // карточку: локальная правка разъезжается с тем, что произошло на сервере.
  // Общее обновление по жесту «потянуть вниз»: лента и данные аккаунта
  // приезжали только при запуске приложения, и увидеть новое объявление
  // можно было лишь перезагрузив вкладку.
  const refreshAll = React.useCallback(async () => {
    try {
      const boot = await bootstrapAction();
      if (boot) setLots(boot.lots || []);
    } catch (e) {
      console.error('feed refresh failed', e);
    }
    if (authed) {
      try { await loadAuthedData(); } catch (e) { console.error('data refresh failed', e); }
    }
  }, [authed]);

  const reloadChains = async () => {
    try { setChains(await listChainsAction() || []); } catch (e) { console.error('chains reload failed', e); }
  };

  // Суммарный бейдж на вкладке «Сообщения». Обнуляем локально сразу после
  // открытия чата — ждать ответа сервера, чтобы погасить свой же счётчик,
  // незачем.
  const unreadChats = React.useMemo(() => chats.reduce((n, c) => n + (c.unread || 0), 0), [chats]);
  const markChatRead = React.useCallback((chatId) => {
    setChats(cs => cs.map(c => (c.id === chatId ? { ...c, unread: 0 } : c)));
  }, []);

  const reloadChats = React.useCallback(async () => {
    try { setChats(await listChatsAction() || []); } catch (e) { console.error('chats reload failed', e); }
  }, []);

  // Колокольчик обновляем сам: раньше счётчик приезжал только с загрузкой
  // приложения, и уведомление, пришедшее при открытом Дайбери, человек видел
  // в лучшем случае назавтра. В скрытой вкладке не опрашиваем.
  React.useEffect(() => {
    if (!authed) return undefined;
    const tick = () => { if (!document.hidden && !notifOpen) reloadNotifications(); };
    const id = setInterval(tick, 45000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [authed, notifOpen]);

  // Пока человек на вкладке сообщений — подтягиваем список: иначе новая
  // переписка и счётчик появятся только после перезагрузки приложения.
  React.useEffect(() => {
    if (!authed || tab !== 'deals') return undefined;
    const tick = () => { if (!document.hidden) reloadChats(); };
    const id = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [authed, tab, reloadChats]);

  const reloadNotifications = async () => {
    try { setNotifications(await listNotificationsAction()); } catch (e) { console.error('notifications failed', e); }
  };

  const runChainAction = async (fn, okMessage) => {
    setChainBusy(true);
    try {
      const res = await fn();
      if (!res?.ok) { showSnack(res?.error || 'Не удалось — обновите страницу и попробуйте ещё раз'); return null; }
      await Promise.all([reloadChains(), reloadNotifications(), refreshWallet()]);
      if (okMessage) showSnack(okMessage);
      return res;
    } catch (e) {
      console.error('chain action failed', e);
      showSnack('Не удалось — обновите страницу и попробуйте ещё раз');
      return null;
    } finally {
      setChainBusy(false);
    }
  };

  // Область поиска — выбор человека, и он должен пережить перезагрузку.
  const [chainScope, setChainScope] = React.useState('region');
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHAIN_SCOPE_KEY);
      if (saved === 'any' || saved === 'region') setChainScope(saved);
    } catch {}
  }, []);

  const searchChains = async (scope = chainScope) => {
    setChainsRefreshing(true);
    try {
      const res = await refreshChainsAction(scope);
      if (res?.chains) setChains(res.chains);
      if (res?.stats) setChainStats(res.stats);
      if (res?.ok && !res.chains?.length) showSnack('Подходящих цепочек пока не нашлось');
    } catch (e) {
      console.error('chains refresh failed', e);
    } finally {
      setChainsRefreshing(false);
    }
  };

  const changeChainScope = (scope) => {
    setChainScope(scope);
    try { window.localStorage.setItem(CHAIN_SCOPE_KEY, scope); } catch {}
    requireAuth('Искать цепочки можно после регистрации', () => searchChains(scope));
  };

  const openDispute = async (d, text) => {
    try {
      const res = await openDisputeAction(d.id, text);
      if (!res.ok) { showSnack(res.error || 'Не удалось открыть спор'); return; }
      setDeals(ds => ds.map(x => (x.id === res.deal.id ? res.deal : x)));
      showSnack('Спор открыт — мы разберёмся и вернёмся с решением');
    } catch (e) {
      console.error('dispute failed', e);
      showSnack('Не удалось открыть спор — обновите страницу');
    }
  };

  const openNotifications = async () => {
    setNotifOpen(true);
    if (notifications.unread > 0) {
      try {
        await markNotificationsReadAction();
        setNotifications(n => ({ items: n.items.map(x => ({ ...x, read: true })), unread: 0 }));
      } catch (e) { console.error('mark read failed', e); }
    }
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

  const handleAuth = async (user, opts = {}) => {
    setCurrentUser(user);
    setAuthed(true);
    setAuthOpen(false);
    // Приветственный экран показываем только что зарегистрировавшимся: тому,
    // кто просто вошёл с нового устройства, «С регистрацией!» — враньё.
    if (opts.registered) setJustRegistered(true);
    // Цели Метрики: без них в отчётах видно только «ходили по страницам»,
    // а нам нужна воронка до реального обмена.
    trackGoal('auth');
    // Ленту тоже перечитываем: до входа её отдавали как гостю — там лежат
    // собственные объявления человека, которых в ленте быть не должно.
    try {
      await Promise.all([
        loadAuthedData(),
        bootstrapAction().then(b => { if (b) setLots(b.lots || []); }),
      ]);
    } catch (e) { console.error('load after auth failed', e); }
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

  // ---- управление своими объявлениями: архив / восстановление / удаление ----
  const syncLotsAfterChange = (id) => {
    setLots(ls => ls.filter(x => x.id !== id));
    setFavorites(fs => fs.filter(x => x.id !== id));
  };

  const handleArchiveLot = async (L) => {
    if (!L) return;
    try {
      const res = await archiveLotAction(L.id);
      if (!res.ok) { showSnack(res.error || 'Не удалось архивировать'); return; }
      setMyLots(ms => ms.filter(x => x.id !== L.id));
      setArchivedLots(as => (as.some(x => x.id === L.id) ? as : [L, ...as]));
      syncLotsAfterChange(L.id);
      showSnack('Объявление в архиве');
    } catch (e) {
      console.error('archive failed', e);
      showSnack('Не удалось архивировать — обновите страницу');
    }
  };

  const handleRestoreLot = async (L) => {
    if (!L) return;
    try {
      const res = await restoreLotAction(L.id);
      if (!res.ok) { showSnack(res.error || 'Не удалось восстановить'); return; }
      setArchivedLots(as => as.filter(x => x.id !== L.id));
      setMyLots(ms => (ms.some(x => x.id === L.id) ? ms : [L, ...ms]));
      showSnack('Объявление снова в ленте');
    } catch (e) {
      console.error('restore failed', e);
      showSnack('Не удалось восстановить — обновите страницу');
    }
  };

  const handleDeleteLot = async (L) => {
    if (!L) return;
    try {
      const res = await deleteLotAction(L.id);
      if (!res.ok) { showSnack(res.error || 'Не удалось удалить'); return; }
      setMyLots(ms => ms.filter(x => x.id !== L.id));
      setArchivedLots(as => as.filter(x => x.id !== L.id));
      syncLotsAfterChange(L.id);
      showSnack(res.notice || 'Объявление удалено');
    } catch (e) {
      console.error('delete failed', e);
      showSnack('Не удалось удалить — обновите страницу');
    }
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
        trackGoal('lot_created', { cat: res.lot.cat });
      }
      setCreating(false);
      setEditingLot(null);
      // «Ни уведомления, ни бросило в окно с моими заявками — ощущение, что
      // глюкануло». Ведём туда, где объявление видно, и говорим, что вышло.
      if (lotData && lotData.id) {
        showSnack('Изменения сохранены');
      } else {
        showSnack('Объявление опубликовано — оно уже в ленте');
      }
      navigate(tabPath('mylots'));
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
      if (res.deal?.stage === 'done') trackGoal('deal_done', { credits: res.deal.credits });
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

  // Один и тот же колокольчик на всех вкладках: раньше он жил только на
  // экране поиска, и о непрочитанном узнавали случайно.
  const bell = <IconBtn name="bell" badge={notifications.unread || 0} onClick={openNotifications} />;

  const tabRoot = () => {
    if (tab === 'search') {
      return (
        <HomeTab
          t={t} go={go} tab={tab} setTab={guardedTab} onCreate={onCreate} authed={authed}
          lots={lots} lotsLoading={lotsLoading} myLots={myLots} matches={matches}
          chains={chains} favIds={favIds} onToggleFav={toggleFav}
          unread={notifications.unread || 0}
          chatUnread={unreadChats}
          onRefresh={refreshAll}
          onBell={openNotifications}
          chainProps={{
            authed,
            hasLots: myLots.length > 0,
            hasWants: !!(profile?.wants || currentUser?.wants),
            refreshing: chainsRefreshing,
            stats: chainStats,
            scope: chainScope,
            onScope: changeChainScope,
            onRefresh: () => requireAuth('Искать цепочки можно после регистрации', () => searchChains()),
          }}
        />
      );
    }
    if (tab === 'favorites') return (
      <div className="app"><div className="safe-top" />
        <FavoritesScreen lots={favorites} go={go} onToggleFav={toggleFav} bell={bell} onRefresh={refreshAll} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={unreadChats} />
      </div>
    );
    if (tab === 'mylots') return (
      <div className="app"><div className="safe-top" />
        <MyLotsScreen
          bell={bell}
          onRefresh={refreshAll}
          myLots={myLots}
          archivedLots={archivedLots}
          go={go}
          onCreate={onCreate}
          onEdit={(L) => requireAuth('Редактировать объявление можно после регистрации', () => setEditingLot(L))}
          onArchive={handleArchiveLot}
          onRestore={handleRestoreLot}
          onDelete={handleDeleteLot}
        />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={unreadChats} />
      </div>
    );
    if (tab === 'deals') return (
      <div className="app"><div className="safe-top" />
        <DealsList chats={chats} deals={deals} onOpen={(id) => go('chat', { id })} onOpenDeal={(id) => openDeal(id)} bell={bell} onRefresh={refreshAll} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={unreadChats} />
      </div>
    );
    if (tab === 'wallet') return (
      <div className="app"><div className="safe-top" />
        <Wallet bell={bell} onRefresh={refreshAll} wallet={wallet} onInfo={() => setInfoOpen(true)} onTopUp={async (amt) => {
          try {
            const res = await topUpAction(amt);
            if (res.ok) await refreshWallet();
            return res;
          } catch (e) {
            console.error('top up failed', e);
            return { ok: false, error: 'Не удалось пополнить — обновите страницу и попробуйте ещё раз' };
          }
        }} />
        <TabBar tab={tab} setTab={guardedTab} onCreate={onCreate} unread={unreadChats} />
      </div>
    );
    if (tab === 'profile') return (
      <ProfileScreen
        bell={bell}
        onRefresh={refreshAll}
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
        <LotDetail lots={lots} myLots={myLots} lotId={top.params.lotId} onOpenLot={(id) => go('lot', { lotId: id })} onEdit={(L) => setEditingLot(L)} fav={favIds.has(top.params.lotId)} onToggleFav={() => toggleFav(lots.find(x => x.id === top.params.lotId))} onBack={back} onOffer={(L) => requireAuth('Предложить обмен можно после регистрации', () => setOfferLot(L))} onOwnerChat={() => handleOwnerChat(lots.find(x => x.id === top.params.lotId))} />
      </div>
    );
    if (top.name === 'chainfeed') return (
      <div className="app"><div className="safe-top" />
        <AppBar
          sub="Многосторонний обмен" title="Цепочки"
          left={<IconBtn name="back" onClick={back} />}
          right={<IconBtn name="bell" badge={notifications.unread || 0} onClick={openNotifications} />}
        />
        <div className="app-scroll">
          <FeedChain
            chains={chains}
            authed={authed}
            hasLots={myLots.length > 0}
            hasWants={!!(profile?.wants || currentUser?.wants)}
            refreshing={chainsRefreshing}
            stats={chainStats}
            scope={chainScope}
            onScope={changeChainScope}
            onRefresh={() => requireAuth('Искать цепочки можно после регистрации', () => searchChains())}
            onOpenChain={(id) => go('chain', { id })}
          />
        </div>
      </div>
    );
    if (top.name === 'chain') return (
      <div className="app"><div className="safe-top" />
        <ChainDetail
          chainId={top.params.id}
          chains={chains}
          busy={chainBusy}
          onBack={back}
          onStart={(ch) => requireAuth('Вступить в цепочку можно после регистрации', () =>
            runChainAction(() => startChainAction(ch.id), 'Позвали остальных — ждём их ответа сутки'))}
          onRespond={async (ch, accept) => {
            const res = await runChainAction(
              () => respondChainAction(ch.id, accept),
              accept ? null : 'Отказ отправлен',
            );
            // Отказ уводит с экрана: цепочки в этом статусе больше нет,
            // а замена (если нашлась) придёт отдельным уведомлением.
            if (res && !accept) back();
          }}
          onSent={(ch) => runChainAction(() => confirmChainSentAction(ch.id), 'Отметили передачу')}
          onReceived={(ch) => runChainAction(() => confirmChainReceivedAction(ch.id), 'Отметили получение')}
          onOpenChat={(chatId) => go('chat', { id: chatId })}
        />
      </div>
    );
    if (top.name === 'deal') {
      const d = topDeal;
      if (!d) return null;
      return (
        <div className="app"><div className="safe-top" />
          <DealStatus deal={d} onBack={back} onConfirm={() => confirmDeal(d)} onCancel={async () => { const ok = await cancelDeal(d); if (ok) resetTo('deals'); }} onChat={() => openDealChat(d)} onDone={(where) => { setDeal(null); resetTo(where === 'home' ? 'home' : 'deals'); }} onRate={submitReview} onDispute={(text) => openDispute(d, text)} />
        </div>
      );
    }
    if (top.name === 'chat') return (
      <ChatThread chatId={top.params.id} onRead={markChatRead} onBack={() => { back(); reloadChats(); }} onOpenDeal={() => { const c = chats.find(x => x.id === top.params.id); openDeal(c && c.deal ? c.deal.id : undefined); }} />
    );
    if (top.name === 'rules') return (
      <div className="app"><div className="safe-top" />
        <RulesScreen onBack={back} />
      </div>
    );
    if (top.name === 'reports') return (
      <div className="app"><div className="safe-top" />
        <ReportsScreen onBack={back} />
      </div>
    );
    if (top.name === 'analytics') return (
      <div className="app"><div className="safe-top" />
        <FunnelScreen onBack={back} />
      </div>
    );
    if (top.name === 'resets') return (
      <div className="app"><div className="safe-top" />
        <ResetsScreen onBack={back} />
      </div>
    );
    if (top.name === 'disputes') return (
      <div className="app"><div className="safe-top" />
        <DisputesScreen onBack={back} />
      </div>
    );
    if (top.name === 'broadcast') return (
      <div className="app"><div className="safe-top" />
        <BroadcastScreen onBack={back} />
      </div>
    );
    if (top.name === 'settings') return (
      <div className="app"><div className="safe-top" />
        <SettingsScreen
          user={currentUser}
          profile={profile}
          onBack={back}
          onAnalytics={() => go('analytics')}
          onBroadcast={() => go('broadcast')}
          onDisputes={() => go('disputes')}
          onResets={() => go('resets')}
          onReports={() => go('reports')}
          onRules={() => go('rules')}
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
        <SplashScreen />
      </div>
    );
  }

  const appContent = (
    <>
      {isDesktop ? (
        <WebApp
          route={route}
          onTab={guardedTab}
          go={go}
          back={back}
          lots={lots}
          lotsLoading={lotsLoading}
          myLots={myLots}
          archivedLots={archivedLots}
          onArchiveLot={handleArchiveLot}
          onRestoreLot={handleRestoreLot}
          onDeleteLot={handleDeleteLot}
          notifications={notifications}
          onOpenNotifications={openNotifications}
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
          onChatRead={markChatRead}
          onChatsChanged={reloadChats}
          chains={chains}
          chainBusy={chainBusy}
          chainProps={{
            authed,
            hasLots: myLots.length > 0,
            hasWants: !!(profile?.wants || currentUser?.wants),
            refreshing: chainsRefreshing,
            stats: chainStats,
            scope: chainScope,
            onScope: changeChainScope,
            onRefresh: () => requireAuth('Искать цепочки можно после регистрации', () => searchChains()),
          }}
          chainActions={{
            onStart: (ch) => requireAuth('Вступить в цепочку можно после регистрации', () =>
              runChainAction(() => startChainAction(ch.id), 'Позвали остальных — ждём их ответа сутки')),
            onRespond: (ch, accept) => runChainAction(
              () => respondChainAction(ch.id, accept),
              accept ? null : 'Отказ отправлен',
            ),
            onSent: (ch) => runChainAction(() => confirmChainSentAction(ch.id), 'Отметили передачу'),
            onReceived: (ch) => runChainAction(() => confirmChainReceivedAction(ch.id), 'Отметили получение'),
          }}
          deals={deals}
          favorites={favorites}
          onToggleFav={toggleFav}
          onConfirmDeal={confirmDeal}
          onCancelDeal={cancelDeal}
          onRateDeal={submitReview}
          onDisputeDeal={openDispute}
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
          const payloadKey = `${L.id}:${credits}:${myLotId || ''}`;
          if (createCommandRef.current.key !== payloadKey) {
            createCommandRef.current = {
              key: payloadKey,
              id: (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
            };
          }
          const res = await createDealAction({
            lotId: L.id,
            credits,
            myLotId,
            clientCommandId: createCommandRef.current.id,
          });
          if (res?.ok) createCommandRef.current = { key: '', id: '' };
          if (res?.ok) trackGoal('deal_created', { credits });
          if (!res.ok) { showSnack(res.error || 'Не удалось создать сделку'); return; }
          const de = await listDealsAction();
          setDeals(de || []);
          const d = de.find(x => x.id === res.deal.id) || res.deal;
          setDeal(d);
          await refreshWallet();
          const ch = await listChatsAction();
          setChats(ch || []);
          // Инициатор сделки не получал вообще ничего: уведомление уходит
          // владельцу лота, а тому, кто нажал «Предложить обмен», казалось,
          // что ничего не произошло.
          showSnack(credits > 0
            ? `Предложение отправлено, ${credits} Б заморожены в эскроу. Ждём ответа владельца.`
            : 'Предложение отправлено — ждём ответа владельца.');
          go('deal', { id: d.id });
        } catch (e) {
          console.error('createDealAction failed', e);
          showSnack('Не удалось создать сделку — обновите страницу и попробуйте ещё раз');
        }
      }} />
      <CreditsInfo open={infoOpen} onClose={() => setInfoOpen(false)} />
      <NotificationsSheet
        open={notifOpen}
        items={notifications.items}
        onClose={() => setNotifOpen(false)}
        onOpenEntity={(n) => {
          setNotifOpen(false);
          if (n.entityType === 'chat') return go('chat', { id: n.entityId });
          if (n.entityType === 'deal') return openDeal(n.entityId);
          if (n.entityType === 'wallet') return navigate(tabPath('wallet'));
          if (n.entityType === 'profile') return navigate(tabPath('profile'));
          return go('chain', { id: n.entityId });
        }}
      />
      {snack && <div className="snack" role="alert" onClick={() => setSnack('')}><Icon name="info" size={16} color="#fff" />{snack}</div>}
      <InstallBanner {...installPrompt} />
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
        <Onboarding
          initialWants={(currentUser && currentUser.wants) || ''}
          welcomeName={justRegistered ? ((currentUser && currentUser.name) || '').split(' ')[0] : null}
          onDone={(wants) => {
            setOnboarded(true);
            setJustRegistered(false);
            if (typeof wants === 'string') {
              setCurrentUser(u => (u ? { ...u, wants } : u));
              setProfile(p => (p ? { ...p, wants } : p));
              // вишлист — основной вход мэтчинга, пересчитываем сразу
              loadMatches();
            }
            try { window.localStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
          }}
        />
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

// unread — колокольчик уведомлений, chatUnread — бейдж на вкладке сообщений
function HomeTab({ t, go, tab, setTab, onCreate, authed = true, lots, lotsLoading, matches, chains, myLots, favIds, onToggleFav, unread = 0, chatUnread = 0, onBell, onRefresh, chainProps = {} }) {
  const [cat, setCat] = React.useState('all');
  const [view, setView] = React.useState(t.mechanic || 'list');
  const [q, setQ] = React.useState('');
  const shown = lots.filter(l => matchesQuery(l, q));

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
        <IconBtn name="bell" badge={unread} onClick={onBell} />
      </div>
      {view !== 'chain' && <CatRow active={cat} setActive={setCat} />}
      <PullToRefresh onRefresh={onRefresh}>
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
        {view === 'list' && <FeedList cat={cat} lots={shown} loading={lotsLoading} matches={matches} hints={t.matchHints} myLots={myLots} myLot={myLots && myLots[0]} onOpen={(id) => go('lot', { lotId: id })} onChains={() => setView('chain')} favIds={favIds} onToggleFav={onToggleFav} />}
        {view === 'swipe' && <FeedSwipe cat={cat} lots={shown} myLot={myLots && myLots[0]} onOpen={(id) => go('lot', { lotId: id })} />}
        {view === 'chain' && <FeedChain chains={chains} onOpenChain={(id) => go('chain', { id })} {...chainProps} />}
        {/* место под кнопку «Разместить объявление»: без него она накрывает
            последний ряд карточек */}
        <div style={{ height: 64 }} aria-hidden="true" />
      </PullToRefresh>
      <FabCreate onClick={onCreate} authed={authed} />
      <TabBar tab={tab} setTab={setTab} onCreate={onCreate} unread={chatUnread} />
    </div>
  );
}
