// router.js — hash-based URL routing for the SPA.
// Every screen has its own address (#/deals, #/lot/:id, #/profile/settings, ...),
// so the browser back button, deep links and refresh work naturally.

export function readPath() {
  if (typeof window === 'undefined') return '/';
  const h = window.location.hash;
  return h && h.startsWith('#/') ? h.slice(1) : '/';
}

export function parseRoute(path) {
  const segs = String(path || '/').split('/').filter(Boolean);
  if (!segs.length) return { tab: 'search', stack: [] };
  const [a, b] = segs;
  switch (a) {
    case 'favorites':
      return { tab: 'favorites', stack: [] };
    case 'mylots':
      return { tab: 'mylots', stack: [] };
    case 'deals':
      return { tab: 'deals', stack: [] };
    case 'wallet':
      return { tab: 'wallet', stack: [] };
    case 'profile':
      if (b === 'settings') return { tab: 'profile', stack: [{ name: 'settings' }] };
      if (b === 'broadcast') return { tab: 'profile', stack: [{ name: 'settings' }, { name: 'broadcast' }] };
      if (b === 'disputes') return { tab: 'profile', stack: [{ name: 'settings' }, { name: 'disputes' }] };
      return { tab: 'profile', stack: [] };
    case 'lot':
      return { tab: 'search', stack: [{ name: 'lot', params: { lotId: b } }] };
    case 'deal':
      return { tab: 'deals', stack: [{ name: 'deal', params: { id: b } }] };
    case 'chat':
      return { tab: 'deals', stack: [{ name: 'chat', params: { id: b } }] };
    case 'chains':
      return { tab: 'search', stack: [{ name: 'chainfeed' }] };
    // у цепочки должен быть свой адрес: на неё ведут ссылки из уведомлений
    case 'chain':
      return { tab: 'search', stack: [{ name: 'chainfeed' }, { name: 'chain', params: { id: b } }] };
    default:
      return { tab: 'search', stack: [] };
  }
}

export function tabPath(id) {
  if (!id || id === 'search' || id === 'home') return '/';
  return '/' + id;
}

export function screenPath(name, params = {}) {
  switch (name) {
    case 'lot':
      return '/lot/' + encodeURIComponent(params.lotId || '');
    case 'deal':
      return '/deal/' + encodeURIComponent(params.id || '');
    case 'chat':
      return '/chat/' + encodeURIComponent(params.id || '');
    case 'chain':
      return '/chain/' + encodeURIComponent(params.id || '');
    case 'chainfeed':
      return '/chains';
    case 'settings':
      return '/profile/settings';
    case 'broadcast':
      return '/profile/broadcast';
    case 'disputes':
      return '/profile/disputes';
    default:
      return '/';
  }
}
