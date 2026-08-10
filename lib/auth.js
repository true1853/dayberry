// lib/auth.js — server-only: JWT session in httpOnly cookie + password hashing
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const COOKIE = 'dayberry_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const secretKey = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me-in-prod');

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
    dealsCount: u.dealsCount,
    balance: u.balance,
  };
}

export function mapLot(l, ownerCity) {
  return {
    id: l.id,
    owner: l.ownerKey,
    city: ownerCity || l.owner?.city || '',
    cat: l.cat,
    title: l.title,
    desc: l.desc,
    wants: l.wants,
    value: l.value,
    aiLow: l.aiLow,
    aiHigh: l.aiHigh,
    condition: l.condition,
    photo: l.photo,
    photoUrl: l.photoUrl || undefined,
    views: l.views,
    hot: l.hot,
    posted: l.posted,
    photos: 1,
  };
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
