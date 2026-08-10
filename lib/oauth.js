// lib/oauth.js — Yandex ID + VK ID OAuth 2.0 (server-only)
// Requires env: NEXT_PUBLIC_VK_CLIENT_ID, VK_CLIENT_SECRET,
//               NEXT_PUBLIC_YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, APP_URL
import { randomUUID } from 'node:crypto';

export const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const rand = () => randomUUID().replace(/-/g, '');

export function getOAuthUrl(provider) {
  const base = APP_URL();
  if (provider === 'vk') {
    const clientId = process.env.NEXT_PUBLIC_VK_CLIENT_ID;
    if (!clientId || !process.env.VK_CLIENT_SECRET || !base) return null;
    const deviceId = randomUUID();
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${base}/callback/vk`,
      response_type: 'code',
      scope: 'email',
      state: `${rand()}.${deviceId}`,
      device_id: deviceId,
    });
    return { url: `https://id.vk.com/authorize?${p}` };
  }
  if (provider === 'yandex') {
    const clientId = process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID;
    if (!clientId || !process.env.YANDEX_CLIENT_SECRET || !base) return null;
    const p = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: `${base}/callback/yandex`,
      scope: 'login:email login:info',
      state: rand(),
    });
    return { url: `https://oauth.yandex.ru/authorize?${p}` };
  }
  return null;
}

export const parseState = (state) => {
  const [s, deviceId = ''] = String(state || '').split('.');
  return { s, deviceId };
};

export async function exchangeYandex(code) {
  const res = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID,
      client_secret: process.env.YANDEX_CLIENT_SECRET,
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

export async function exchangeVk(code, deviceId) {
  const res = await fetch('https://id.vk.com/oauth2/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.NEXT_PUBLIC_VK_CLIENT_ID,
      client_secret: process.env.VK_CLIENT_SECRET,
      device_id: deviceId || randomUUID(),
      code,
      redirect_uri: `${APP_URL()}/callback/vk`,
      state: '',
    }),
  });
  if (!res.ok) throw new Error(`vk token ${res.status}`);
  const tok = await res.json();
  const access = tok.access_token;
  if (!access) throw new Error('vk: no access_token');
  const info = await fetch(`https://api.vk.com/method/users.get?access_token=${access}&v=5.199&fields=photo_200`);
  if (!info.ok) throw new Error(`vk info ${info.status}`);
  const data = await info.json();
  const u = data.response && data.response[0];
  if (!u) throw new Error('vk: no user');
  return {
    provider: 'vk',
    externalId: String(u.id || ''),
    email: tok.email || '',
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'ВКонтакте-пользователь',
    avatar: u.photo_200 || '',
  };
}
