'use server';

import { prisma } from '../../lib/prisma';
import {
  createSession,
  destroySession,
  getCurrentUser,
  serializeUser,
  mapLot,
  hashPassword,
  verifyPassword,
} from '../../lib/auth';

export async function registerAction(input) {
  const { name, email, phone, password, city } = input || {};
  const key = (email || '').trim().toLowerCase();
  if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return { ok: false, error: 'Некорректный email' };
  if (!password || password.length < 6) return { ok: false, error: 'Пароль — минимум 6 символов' };
  if (!name || !name.trim()) return { ok: false, error: 'Введите имя' };

  const exists = await prisma.user.findUnique({ where: { email: key } });
  if (exists) return { ok: false, error: 'Этот email уже зарегистрирован — попробуйте войти' };

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: key,
      phone: (phone || '').trim(),
      city: (city || '').trim() || 'Москва',
      passwordHash: await hashPassword(password),
    },
  });
  await createSession(user.id);
  return { ok: true, user: serializeUser(user) };
}

export async function loginAction({ email, password } = {}) {
  const key = (email || '').trim().toLowerCase();
  if (!key) return { ok: false, error: 'Введите email' };
  if (!password) return { ok: false, error: 'Введите пароль' };

  const user = await prisma.user.findUnique({ where: { email: key } });
  if (!user) return { ok: false, error: 'Аккаунт не найден. Зарегистрируйтесь или проверьте email' };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { ok: false, error: 'Неверный пароль' };

  await createSession(user.id);
  return { ok: true, user: serializeUser(user) };
}

export async function guestAction() {
  let user = await prisma.user.findUnique({ where: { email: 'guest@dayberry.app' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Гость',
        email: 'guest@dayberry.app',
        passwordHash: await hashPassword('guest12345'),
        city: 'Москва',
      },
    });
  }
  await createSession(user.id);
  return { ok: true, user: serializeUser(user) };
}

export async function logoutAction() {
  await destroySession();
  return { ok: true };
}

export async function sessionAction() {
  return getCurrentUser();
}

export async function getProfileAction() {
  const user = await getCurrentUser();
  if (!user) return null;
  const reviews = await prisma.review.findMany({
    where: { targetId: user.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    ...user,
    bio: user.bio || '',
    reviews: reviews.map(r => ({
      id: r.id,
      author: r.author.name,
      rating: r.rating,
      text: r.text,
      date: r.createdAt.toISOString().slice(0, 10),
    })),
  };
}

export async function updateProfileAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { name, city, bio } = input || {};
  if (!name || !name.trim()) return { ok: false, error: 'Введите имя' };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: name.trim(),
      city: (city || '').trim() || 'Москва',
      bio: (bio || '').trim(),
    },
  });
  return { ok: true, user: serializeUser(updated) };
}

export async function updateAvatarAction(avatar) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const clean = typeof avatar === 'string' && avatar.startsWith('data:image/')
    ? avatar
    : (avatar || '').trim() || '';

  if (clean && clean.length > 2_000_000) {
    return { ok: false, error: 'Фото слишком большое — выберите файл до 2 МБ' };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatar: clean },
  });
  return { ok: true, user: serializeUser(updated) };
}

export async function listLots() {
  const lots = await prisma.lot.findMany({
    where: { status: 'active' },
    include: { owner: { select: { city: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function getMyLots() {
  const user = await getCurrentUser();
  if (!user) return [];
  const lots = await prisma.lot.findMany({
    where: { ownerId: user.id, status: 'active' },
    include: { owner: { select: { city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function createLotAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { title, cat, value, aiLow, aiHigh, photo, photoUrl, wants, desc, kind, condition } = input || {};
  if (!title || !title.trim()) return { ok: false, error: 'Введите название' };
  if (!value || value <= 0) return { ok: false, error: 'Укажите оценку в баллах' };
  if (!wants || !wants.trim()) return { ok: false, error: 'Укажите, на что хотите обменять' };

  const num = Math.round(Number(value));
  const lot = await prisma.lot.create({
    data: {
      ownerId: user.id,
      ownerKey: 'me',
      kind: kind || 'item',
      cat: cat || 'gadget',
      title: title.trim(),
      value: num,
      aiLow: aiLow || Math.round(num * 0.92),
      aiHigh: aiHigh || Math.round(num * 1.08),
      photo: photo || '',
      photoUrl: photoUrl || '',
      wants: wants.trim(),
      desc: desc || '',
      condition: condition || (kind === 'service' ? 'Услуга' : 'Новое или Б/У'),
      posted: 'только что',
      sortOrder: 0,
    },
  });
  return { ok: true, lot: mapLot(lot, user.city) };
}
