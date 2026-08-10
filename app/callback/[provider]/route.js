import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { createSession, hashPassword } from '../../../lib/auth';
import { exchangeYandex, exchangeVk, parseState, APP_URL } from '../../../lib/oauth';

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
  const base = APP_URL() || url.origin;
  const fail = (msg) => NextResponse.redirect(`${base}/?oauth=error${msg ? '&m=' + encodeURIComponent(msg) : ''}`);

  try {
    if (provider !== 'yandex' && provider !== 'vk') return fail('bad provider');
    const code = url.searchParams.get('code');
    if (!code) return fail('no code');

    const profile = provider === 'yandex'
      ? await exchangeYandex(code)
      : await exchangeVk(code, parseState(url.searchParams.get('state')).deviceId);

    const user = await upsertUser(profile);
    await createSession(user.id);
    return NextResponse.redirect(`${base}/`);
  } catch (e) {
    console.error('[oauth]', provider, e);
    return fail('oauth failed');
  }
}
