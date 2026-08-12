// lib/auth.js — server-only: JWT session in httpOnly cookie + password hashing
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const COOKIE = 'dayberry_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const DEV_SECRET = 'dev-secret-change-me-in-prod';

// В проде дефолтный секрет означает, что любой желающий может подписать
// собственную сессию и войти под чужим id. Падаем громко, а не молча.
// Сборка исключена: там переменных окружения рантайма ещё нет.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
if (!isBuild && process.env.NODE_ENV === 'production' && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === DEV_SECRET)) {
  throw new Error('AUTH_SECRET не задан (или оставлен дефолтным) — сессии можно подделать. Задайте случайный секрет в окружении.');
}

const secretKey = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET || DEV_SECRET);

export async function createSession(userId) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey());
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getCurrentUser() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    return user ? serializeUser(user) : null;
  } catch {
    return null;
  }
}

export function serializeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    city: u.city,
    bio: u.bio || '',
    wants: u.wants || '',
    avatar: u.avatar || '',
    rating: u.rating,
    // нужен, чтобы отличать «оценок ещё нет» от «оценили на ноль»
    reviewsCount: u.reviewsCount ?? 0,
    dealsCount: u.dealsCount,
    balance: u.balance,
    notifyPush: u.notifyPush !== false,
    notifyEmail: u.notifyEmail !== false,
    notifyDeals: u.notifyDeals !== false,
  };
}

export function mapLot(l, ownerCity) {
  const urls = (l.lotPhotos || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(p => p.url)
    .filter(Boolean);
  const mainUrl = l.photoUrl || urls[0] || undefined;
  return {
    id: l.id,
    owner: l.ownerKey,
    ownerId: l.ownerId,
    city: ownerCity || l.owner?.city || '',
    ownerName: l.owner?.name || '',
    ownerAvatar: l.owner?.avatar || '',
    ownerCity: l.owner?.city || '',
    ownerRating: l.owner?.rating ?? 0,
    ownerReviews: l.owner?.reviewsCount ?? 0,
    ownerDeals: l.owner?.dealsCount ?? 0,
    cat: l.cat,
    title: l.title,
    desc: l.desc,
    wants: l.wants,
    value: l.value,
    aiLow: l.aiLow,
    aiHigh: l.aiHigh,
    valuationSource: l.valuationSource || 'manual',
    condition: l.condition,
    photo: l.photo,
    photoUrl: mainUrl,
    photoUrls: urls.length ? urls : (mainUrl ? [mainUrl] : []),
    views: l.views,
    hot: l.hot,
    posted: l.posted,
    createdAt: l.createdAt ? l.createdAt.toISOString() : null,
    photos: Math.max(1, urls.length || (mainUrl ? 1 : 1)),
  };
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
