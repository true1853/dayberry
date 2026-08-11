// lib/rate-limit.js — простой счётчик попыток в памяти процесса.
//
// Приложение крутится одним инстансом Node с SQLite, поэтому распределённое
// хранилище тут было бы лишним. Задача скромная: не дать перебирать пароли
// через loginAction — каждая проверка это bcrypt, то есть заметный кусок CPU
// единственного процесса.
//
// Ключ — email или IP. Окно скользящее, счётчик сбрасывается после успеха.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_KEYS = 10000;

const hits = new Map();

function prune(now) {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
  // страховка от роста при потоке уникальных ключей
  if (hits.size > MAX_KEYS) {
    const excess = hits.size - MAX_KEYS;
    let i = 0;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (++i >= excess) break;
    }
  }
}

/**
 * Регистрирует попытку. Возвращает { ok } или { ok: false, retryAfterSec }.
 */
export function hit(key, { max = MAX_ATTEMPTS, windowMs = WINDOW_MS } = {}) {
  if (!key) return { ok: true };
  const now = Date.now();
  if (hits.size > 64) prune(now);

  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  entry.count++;
  if (entry.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true };
}

/** Сброс после успешного входа — чтобы не наказывать за прошлые опечатки. */
export function reset(key) {
  if (key) hits.delete(key);
}
