// lib/oauth.js — Yandex ID + VK ID OAuth (server-only)
// VK ID: OAuth 2.1 (PKCE обязателен), endpoints на id.vk.ru
// Requires env: NEXT_PUBLIC_VK_CLIENT_ID, VK_CLIENT_SECRET (или VK_SERVICE_TOKEN),
//               NEXT_PUBLIC_YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, APP_URL
import { randomBytes, createHash } from 'node:crypto';

export const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const rand = (bytes = 24) => randomBytes(bytes).toString('base64url');

export function vkAuthStart(baseOverride) {
  const base = (baseOverride || APP_URL()).replace(/\/$/, '');
  const clientId = process.env.NEXT_PUBLIC_VK_CLIENT_ID;
  if (!clientId || !base) return null;
  const codeVerifier = rand(32); // 43 chars: a-z, A-Z, 0-9, _, -
  const state = rand(24);        // 32 chars, no punctuation (echoed back by VK)
  const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${base}/callback/vk`,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'email',
  });
  return { url: `https://id.vk.ru/authorize?${p}`, state, codeVerifier };
}

export function yandexAuthStart(baseOverride) {
  const base = (baseOverride || APP_URL()).replace(/\/$/, '');
  const clientId = process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID;
  if (!clientId || !process.env.YANDEX_CLIENT_SECRET || !base) return null;
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${base}/callback/yandex`,
    scope: 'login:email login:info',
    state: rand(24),
  });
  return { url: `https://oauth.yandex.ru/authorize?${p}` };
}

export async function exchangeVk(code, deviceId, codeVerifier, state, baseOverride) {
  const base = (baseOverride || APP_URL()).replace(/\/$/, '');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
    redirect_uri: `${base}/callback/vk`,
    code,
    client_id: process.env.NEXT_PUBLIC_VK_CLIENT_ID,
    device_id: deviceId,
    state,
  });
  // Confidential apps authenticate with service_token (Сервисный ключ); fallback: client_secret
  if (process.env.VK_SERVICE_TOKEN) body.set('service_token', process.env.VK_SERVICE_TOKEN);
  else if (process.env.VK_CLIENT_SECRET) body.set('client_secret', process.env.VK_CLIENT_SECRET);

  const res = await fetch('https://id.vk.ru/oauth2/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`vk token ${res.status}`);
  const tok = await res.json();
  const access = tok.access_token;
  if (!access) throw new Error('vk: no access_token ' + JSON.stringify(tok).slice(0, 160));

  const info = await fetch('https://id.vk.ru/oauth2/user_info', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_VK_CLIENT_ID,
      access_token: access,
    }),
  });
  if (!info.ok) throw new Error(`vk info ${info.status}`);
  const data = await info.json();
  const u = data.user || {};
  return {
    provider: 'vk',
    externalId: String(u.user_id || tok.user_id || ''),
    email: u.email || '',
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'ВКонтакте-пользователь',
    avatar: u.avatar || '',
  };
}

export async function exchangeYandex(code, baseOverride) {
  const base = (baseOverride || APP_URL()).replace(/\/$/, '');
  const res = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID,
      client_secret: process.env.YANDEX_CLIENT_SECRET,
      redirect_uri: `${base}/callback/yandex`,
    }),
  });
  if (!res.ok) throw new Error(`yandex token ${res.status}`);
  const tok = await res.json();
  const info = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { authorization: `OAuth ${tok.access_token}` },
  });
  if (!info.ok) throw new Error(`yandex info ${info.status}`);
  const u = await info.json();
  return {
    provider: 'yandex',
    externalId: String(u.id || ''),
    email: u.default_email || (Array.isArray(u.emails) && u.emails[0]) || '',
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Яндекс-пользователь',
    avatar: u.default_avatar ? `https://avatars.yandex.net/get-yapic/${u.default_avatar}/islands-200` : '',
  };
}
