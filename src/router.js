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
  if (!segs.length) return { tab: 'home', stack: [] };
  const [a, b] = segs;
  switch (a) {
    case 'search':
      return { tab: 'search', stack: [] };
    case 'deals':
      return { tab: 'deals', stack: [] };
    case 'wallet':
      return { tab: 'wallet', stack: [] };
    case 'profile':
      if (b === 'settings') return { tab: 'profile', stack: [{ name: 'settings' }] };
      return { tab: 'profile', stack: [] };
    case 'lot':
      return { tab: 'home', stack: [{ name: 'lot', params: { lotId: b } }] };
    case 'deal':
      return { tab: 'deals', stack: [{ name: 'deal', params: { id: b } }] };
    case 'chat':
      return { tab: 'deals', stack: [{ name: 'chat', params: { id: b } }] };
    case 'chains':
      return { tab: 'home', stack: [{ name: 'chainfeed' }] };
    default:
      return { tab: 'home', stack: [] };
  }
}

export function tabPath(id) {
  if (!id || id === 'home') return '/';
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
      return '/chains';
    case 'chainfeed':
      return '/chains';
    case 'settings':
      return '/profile/settings';
    default:
      return '/';
  }
}
