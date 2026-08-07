// store.js — localStorage persistence for auth, session and user listings
// (frontend-only prototype: no backend, data lives in the browser)

const LS = {
  users: 'dayberry_users',
  session: 'dayberry_session',
  lots: 'dayberry_lots',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full / unavailable — keep app working without persistence
  }
}

const norm = (s) => (s || '').trim().toLowerCase();

// ---------- users ----------
export function getUsers() {
  return read(LS.users, []);
}

export function registerUser({ name, email, phone, password, city }) {
  const users = getUsers();
  const key = norm(email);
  if (!key) return { ok: false, error: 'Введите email' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return { ok: false, error: 'Некорректный email' };
  if (!password || password.length < 6) return { ok: false, error: 'Пароль — минимум 6 символов' };
  if (!name || !name.trim()) return { ok: false, error: 'Введите имя' };
  if (users.some((u) => u.email === key)) return { ok: false, error: 'Этот email уже зарегистрирован — попробуйте войти' };

  const user = {
    id: 'u' + Date.now(),
    name: name.trim(),
    email: key,
    phone: (phone || '').trim(),
    password,
    city: (city || '').trim() || 'Москва',
    balance: 38000,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  write(LS.users, users);
  return { ok: true, user };
}

export function loginUser(email, password) {
  const users = getUsers();
  const key = norm(email);
  if (!key) return { ok: false, error: 'Введите email' };
  if (!password) return { ok: false, error: 'Введите пароль' };
  const user = users.find((u) => u.email === key);
  if (!user) return { ok: false, error: 'Аккаунт не найден. Зарегистрируйтесь или проверьте email' };
  if (user.password !== password) return { ok: false, error: 'Неверный пароль' };
  return { ok: true, user };
}

export function guestUser() {
  const existing = getUsers().find((u) => u.email === 'guest@dayberry.app');
  if (existing) return existing;
  const res = registerUser({ name: 'Гость', email: 'guest@dayberry.app', password: 'guest123', city: 'Москва' });
  return res.user;
}

// ---------- session ----------
export function getSession() {
  return read(LS.session, null);
}

export function setSession(email) {
  write(LS.session, norm(email));
}

export function clearSession() {
  try {
    localStorage.removeItem(LS.session);
  } catch {
    // ignore
  }
}

export function getCurrentUser() {
  const email = getSession();
  if (!email) return null;
  return getUsers().find((u) => u.email === email) || null;
}

// ---------- user listings ----------
export function getMyLots() {
  return read(LS.lots, []);
}

export function addLot(lot) {
  const lots = getMyLots();
  const entry = {
    ...lot,
    id: 'my' + Date.now(),
    owner: 'me',
    views: 0,
    posted: 'только что',
  };
  lots.unshift(entry);
  write(LS.lots, lots);
  return entry;
}

export function removeLot(id) {
  const lots = getMyLots().filter((l) => l.id !== id);
  write(LS.lots, lots);
  return lots;
}
