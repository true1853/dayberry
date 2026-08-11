import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '../../../lib/prisma';
import { createSession, hashPassword } from '../../../lib/auth';
import { exchangeYandex, exchangeVk, APP_URL } from '../../../lib/oauth';

async function upsertUser(profile) {
  const email = (profile.email || '').toLowerCase().trim() || `${profile.provider}_${profile.externalId}@dayberry.app`;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: profile.name,
        email,
        passwordHash: await hashPassword(randomUUID() + Date.now()),
        city: 'Москва',
        avatar: profile.avatar || '',
      },
    });
  }
  return user;
}

export async function GET(req, { params }) {
  const { provider } = await params;
  const url = new URL(req.url);
  // NPM terminates TLS and proxies over http internally, so the scheme must
  // come from X-Forwarded-Proto to keep the OAuth redirect_uri on https.
  const proto = (req.headers.get('x-forwarded-proto') || url.protocol.replace(/:$/, '') || 'https').split(',')[0].trim();
  const base = `${proto}://${url.host}`;

  // On any OAuth failure redirect to the clean origin (no query params),
  // and signal the error via a short-lived cookie the client can read + clear.
  const fail = (msg) => {
    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set('oauth_error', msg, { maxAge: 60, path: '/' });
    return res;
  };

  try {
    if (provider === 'vk') {
      const code = url.searchParams.get('code');
      const deviceId = url.searchParams.get('device_id');
      const state = url.searchParams.get('state');
      if (!code || !deviceId) return fail('no code');

      const c = await cookies();
      const stored = c.get('vk_oauth')?.value;
      c.delete('vk_oauth');
      if (!stored) return fail('oauth state');
      let parsed;
      try { parsed = JSON.parse(stored); } catch { parsed = null; }
      if (!parsed || parsed.state !== state || !parsed.verifier) return fail('state mismatch');

      // Use the base the user authorized from so redirect_uri matches exactly.
      const vkBase = parsed.base || url.origin;
      const profile = await exchangeVk(code, deviceId, parsed.verifier, state, vkBase);
      const user = await upsertUser(profile);
      await createSession(user.id);
      return NextResponse.redirect(`${vkBase}/`);
    }

    if (provider === 'yandex') {
      const code = url.searchParams.get('code');
      if (!code) return fail('no code');
      const c = await cookies();
      const stored = c.get('yandex_oauth')?.value;
      c.delete('yandex_oauth');
      let yBase = url.origin;
      if (stored) { try { const p = JSON.parse(stored); if (p && p.base) yBase = p.base; } catch {} }
      const profile = await exchangeYandex(code, yBase);
      const user = await upsertUser(profile);
      await createSession(user.id);
      return NextResponse.redirect(`${yBase}/`);
    }

    return fail('bad provider');
  } catch (e) {
    console.error('[oauth]', provider, e);
    return fail('oauth failed');
  }
}
