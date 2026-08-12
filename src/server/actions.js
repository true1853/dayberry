'use server';

import { prisma } from '../../lib/prisma';
import { analyzeListing, computeMatches, askWants } from '../../lib/ai';
import { vkAuthStart, yandexAuthStart } from '../../lib/oauth';
import { saveDataUrl, saveDataUrls, isStorableImage } from '../../lib/storage';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import * as rateLimit from '../../lib/rate-limit';
import {
  createSession,
  destroySession,
  getCurrentUser,
  serializeUser,
  mapLot,
  hashPassword,
  verifyPassword,
} from '../../lib/auth';

const MAX_LOT_PHOTOS = 6;
const MAX_PHOTOS_CHARS = 8_000_000;

export async function registerAction(input) {
  const { name, email, phone, password, city } = input || {};
  const key = (email || '').trim().toLowerCase();
  if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return { ok: false, error: 'Некорректный email' };
  if (!password || password.length < 6) return { ok: false, error: 'Пароль — минимум 6 символов' };
  if (!name || !name.trim()) return { ok: false, error: 'Введите имя' };

  // Регистрация тоже стоит одного bcrypt-хэша — ограничиваем частоту.
  const gate = rateLimit.hit(`register:${key}`, { max: 5 });
  if (!gate.ok) {
    return { ok: false, error: `Слишком много попыток. Попробуйте через ${Math.ceil(gate.retryAfterSec / 60)} мин.` };
  }

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

  // Проверка до bcrypt: иначе перебор паролей упирается только в CPU сервера.
  const gate = rateLimit.hit(`login:${key}`);
  if (!gate.ok) {
    return { ok: false, error: `Слишком много попыток входа. Попробуйте через ${Math.ceil(gate.retryAfterSec / 60)} мин.` };
  }

  const user = await prisma.user.findUnique({ where: { email: key } });
  if (!user) return { ok: false, error: 'Аккаунт не найден. Зарегистрируйтесь или проверьте email' };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { ok: false, error: 'Неверный пароль' };

  rateLimit.reset(`login:${key}`);
  await createSession(user.id);
  return { ok: true, user: serializeUser(user) };
}

export async function guestAction() {
  // Раньше все гости садились в один аккаунт guest@dayberry.app и видели
  // чужие сделки, чаты и кошелёк. Теперь каждый гость — отдельный аккаунт
  // со случайным адресом и неиспользуемым паролем.
  const token = randomUUID();
  const user = await prisma.user.create({
    data: {
      name: 'Гость',
      email: `guest-${token}@dayberry.local`,
      passwordHash: await hashPassword(randomUUID() + randomUUID()),
      city: 'Москва',
    },
  });
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

// ---------- bootstrap ----------
//
// Next.js выполняет server actions последовательно, поэтому Promise.all из
// десяти вызовов на клиенте давал десять round-trip'ов подряд, и каждый заново
// поднимал сессию (cookie + jwtVerify + SELECT User). Здесь запросы собраны в
// два экшена: сессия разрешается один раз, а параллелится уже работа с БД.
//
// Разделение на два — намеренное: критический путь (сессия + лента) не должен
// ждать кошелёк и переписки.

export async function bootstrapAction() {
  const user = await getCurrentUser();
  const [lots, chains] = await Promise.all([lotsFeed(user), chainsList()]);
  return { user, lots, chains };
}

export async function loadAuthedDataAction() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [myLots, profile, deals, wallet, chats, favorites] = await Promise.all([
    myLotsOf(user), profileOf(user), dealsOf(user),
    walletOf(user), chatsOf(user), favoritesOf(user),
  ]);
  return { myLots, profile, deals, wallet, chats, favorites };
}

export async function getProfileAction() {
  return profileOf(await getCurrentUser());
}

// ---------- отзывы и рейтинг ----------

const MAX_REVIEW_TEXT = 600;

// Пересчитывает рейтинг получателя по всем его отзывам. Считаем агрегатом в БД,
// а не инкрементально: так значение не разъезжается, если отзыв удалят вручную.
async function recalcRating(tx, targetId) {
  const agg = await tx.review.aggregate({
    where: { targetId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.user.update({
    where: { id: targetId },
    data: {
      // округляем до десятых — в интерфейсе всё равно показываем «4.8»
      rating: Math.round((agg._avg.rating || 0) * 10) / 10,
      reviewsCount: agg._count._all,
    },
  });
}

export async function createReviewAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { dealId, rating, text } = input || {};
  const stars = Math.round(Number(rating));
  if (!(stars >= 1 && stars <= 5)) return { ok: false, error: 'Поставьте оценку от 1 до 5' };

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, userId: true, status: true, lot: { select: { ownerId: true } } },
  });
  if (!deal) return { ok: false, error: 'Сделка не найдена' };

  // оценивать можно только завершённый обмен и только его участнику
  const partnerId = deal.lot?.ownerId;
  const isInitiator = deal.userId === user.id;
  const isPartner = partnerId === user.id;
  if (!isInitiator && !isPartner) return { ok: false, error: 'Вы не участвовали в этой сделке' };
  if (deal.status !== 'done') return { ok: false, error: 'Оценить можно только завершённый обмен' };

  const targetId = isInitiator ? partnerId : deal.userId;
  if (!targetId || targetId === user.id) return { ok: false, error: 'Некого оценивать' };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          authorId: user.id,
          targetId,
          dealId: deal.id,
          rating: stars,
          text: (text || '').trim().slice(0, MAX_REVIEW_TEXT),
        },
      });
      await recalcRating(tx, targetId);
    });
  } catch (e) {
    // @@unique([dealId, authorId]) — второй отзыв по той же сделке
    if (e.code === 'P2002') return { ok: false, error: 'Вы уже оценили этот обмен' };
    throw e;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { rating: true, reviewsCount: true },
  });
  return { ok: true, rating: target.rating, reviewsCount: target.reviewsCount };
}

async function profileOf(user) {
  if (!user) return null;
  const reviews = await prisma.review.findMany({
    where: { targetId: user.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
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

  const { name, city, bio, wants, phone } = input || {};
  if (!name || !name.trim()) return { ok: false, error: 'Введите имя' };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: name.trim(),
      city: (city || '').trim() || 'Москва',
      bio: (bio || '').trim(),
      wants: (wants || '').trim(),
      phone: (phone || '').trim(),
    },
  });
  return { ok: true, user: serializeUser(updated) };
}

export async function changePasswordAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { currentPassword = '', newPassword = '' } = input || {};
  if (!currentPassword) return { ok: false, error: 'Введите текущий пароль' };
  if (!newPassword || newPassword.length < 6) return { ok: false, error: 'Новый пароль — минимум 6 символов' };

  const u = await prisma.user.findUnique({ where: { id: user.id } });
  const match = await verifyPassword(currentPassword, u.passwordHash);
  if (!match) return { ok: false, error: 'Неверный текущий пароль' };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  return { ok: true };
}

export async function updateSettingsAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { notifyPush, notifyEmail, notifyDeals } = input || {};
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      notifyPush: !!notifyPush,
      notifyEmail: !!notifyEmail,
      notifyDeals: !!notifyDeals,
    },
  });
  return { ok: true, user: serializeUser(updated) };
}

export async function updateAvatarAction(avatar) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const incoming = typeof avatar === 'string' ? avatar.trim() : '';

  if (incoming.length > 2_000_000) {
    return { ok: false, error: 'Фото слишком большое — выберите файл до 2 МБ' };
  }

  // Пустая строка = снять аватар; иначе кладём файл на диск и храним путь.
  // Аватар рендерится максимум в 120px — превью ему не нужно.
  const clean = incoming ? await saveDataUrl(incoming, { max: 256, thumb: false }) : '';

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatar: clean },
  });
  return { ok: true, user: serializeUser(updated) };
}

export async function listLots() {
  return lotsFeed(await getCurrentUser());
}

async function lotsFeed(user) {
  const where = { status: 'active' };
  if (user) where.ownerId = { not: user.id };
  const lots = await prisma.lot.findMany({
    where,
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function getMyLots() {
  return myLotsOf(await getCurrentUser());
}

async function myLotsOf(user) {
  if (!user) return [];
  const lots = await prisma.lot.findMany({
    where: { ownerId: user.id, status: 'active' },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

// Счётчик просмотров нигде не увеличивался — во всех карточках стоял ноль.
// Считаем открытие карточки лота; свои просмотры не учитываем, иначе
// счётчик накручивается автором.
export async function trackLotViewAction(lotId) {
  const user = await getCurrentUser();
  if (!lotId) return { ok: false };
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { ownerId: true } });
  if (!lot) return { ok: false };
  if (user && lot.ownerId === user.id) return { ok: true, skipped: true };
  const updated = await prisma.lot.update({
    where: { id: lotId },
    data: { views: { increment: 1 } },
    select: { views: true },
  });
  return { ok: true, views: updated.views };
}

export async function toggleFavoriteAction(lotId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };

  // deleteMany/create вместо find+delete: при быстрых кликах гонка между
  // чтением и записью роняла create на unique-констрейнте.
  const removed = await prisma.favorite.deleteMany({ where: { userId: user.id, lotId } });
  if (removed.count > 0) return { ok: true, fav: false };

  try {
    await prisma.favorite.create({ data: { userId: user.id, lotId } });
  } catch (e) {
    // параллельный запрос успел добавить — состояние всё равно «в избранном»
    if (e.code !== 'P2002') throw e;
  }
  return { ok: true, fav: true };
}

export async function listFavoritesAction() {
  return favoritesOf(await getCurrentUser());
}

async function favoritesOf(user) {
  if (!user) return [];
  const favs = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: {
      lot: {
        include: {
          owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } },
          lotPhotos: { orderBy: { order: 'asc' } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return favs.map(f => mapLot(f.lot, f.lot.owner?.city));
}

export async function createLotAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { title, cat, value, aiLow, aiHigh, photo, photoUrl, photos, wants, desc, kind, condition, valuationSource } = input || {};
  if (!title || !title.trim()) return { ok: false, error: 'Введите название' };
  if (!value || value <= 0) return { ok: false, error: 'Укажите оценку в баллах' };
  if (!wants || !wants.trim()) return { ok: false, error: 'Укажите, на что хотите обменять' };

  const incoming = Array.isArray(photos) ? photos.filter(isStorableImage) : [];
  if (incoming.length > MAX_LOT_PHOTOS) return { ok: false, error: `Можно добавить не больше ${MAX_LOT_PHOTOS} фото` };
  const totalChars = incoming.reduce((n, u) => n + u.length, 0);
  if (totalChars > MAX_PHOTOS_CHARS) return { ok: false, error: 'Фото слишком тяжёлые — добавьте меньше или выберите файлы поменьше' };

  // data-URL'ы уезжают на диск, в БД остаются пути /uploads/...
  const photoList = await saveDataUrls(incoming);
  const mainUrl = await saveDataUrl(photoUrl);

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
      valuationSource: valuationSource === 'ai' ? 'ai' : 'manual',
      photo: photo || '',
      photoUrl: mainUrl || photoList[0] || '',
      wants: wants.trim(),
      desc: desc || '',
      condition: condition || (kind === 'service' ? 'Услуга' : 'Новое или Б/У'),
      posted: 'только что',
      sortOrder: 0,
      ...(photoList.length ? {
        lotPhotos: {
          create: photoList.map((url, i) => ({ url, label: '', order: i })),
        },
      } : {}),
    },
  });
  const withOwner = await prisma.lot.findUnique({
    where: { id: lot.id },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
  });
  return { ok: true, lot: mapLot(withOwner || lot, user.city) };
}

export async function updateLotAction(lotId, input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.ownerId !== user.id) return { ok: false, error: 'Это не ваше объявление' };

  const { title, cat, value, aiLow, aiHigh, wants, desc, condition, valuationSource, photo, photoUrl, photos } = input || {};
  if (!title || !title.trim()) return { ok: false, error: 'Введите название' };
  if (!value || value <= 0) return { ok: false, error: 'Укажите оценку в баллах' };
  if (!wants || !wants.trim()) return { ok: false, error: 'Укажите, на что хотите обменять' };

  // При редактировании клиент присылает вперемешку новые data-URL'ы и уже
  // сохранённые пути — принимаем и то и другое, иначе правка заголовка
  // стирала бы существующие фото.
  const incoming = Array.isArray(photos) ? photos.filter(isStorableImage) : [];
  if (incoming.length > MAX_LOT_PHOTOS) return { ok: false, error: `Можно добавить не больше ${MAX_LOT_PHOTOS} фото` };
  const totalChars = incoming.reduce((n, u) => n + u.length, 0);
  if (totalChars > MAX_PHOTOS_CHARS) return { ok: false, error: 'Фото слишком тяжёлые — добавьте меньше или выберите файлы поменьше' };

  const photoList = await saveDataUrls(incoming);
  const mainUrl = photoUrl !== undefined ? await saveDataUrl(photoUrl) : undefined;

  const existingPhotos = await prisma.lotPhoto.findMany({
    where: { lotId },
    select: { url: true },
    orderBy: { order: 'asc' },
  });
  const photosChanged = Array.isArray(photos)
    && (existingPhotos.length !== photoList.length
      || existingPhotos.some((p, i) => p.url !== photoList[i]));

  const num = Math.round(Number(value));
  const updated = await prisma.lot.update({
    where: { id: lotId },
    data: {
      title: title.trim(),
      cat: cat || lot.cat,
      value: num,
      aiLow: aiLow || Math.round(num * 0.92),
      aiHigh: aiHigh || Math.round(num * 1.08),
      valuationSource: valuationSource === 'ai' ? 'ai' : 'manual',
      wants: wants.trim(),
      desc: desc || '',
      condition: condition || lot.condition,
      photo: photo !== undefined ? photo : lot.photo,
      photoUrl: mainUrl !== undefined ? mainUrl : (photoList[0] || ''),
      // Пересоздаём галерею только если набор или порядок фото реально
      // изменился: правка заголовка не должна трогать строки с картинками.
      ...(Array.isArray(photos) && photosChanged ? {
        lotPhotos: {
          deleteMany: {},
          create: photoList.map((url, i) => ({ url, label: '', order: i })),
        },
      } : {}),
    },
  });
  const withOwner = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
  });
  return { ok: true, lot: mapLot(withOwner || updated, user.city) };
}

// ---------- deals ----------

const DEAL_STAGE_ORDER = ['created', 'meet', 'confirm', 'done'];

// Сигналы отката транзакции — не выносим наружу как 500.
class InsufficientFunds extends Error {}
class DealClosed extends Error {}

function dealWith() {
  return {
    lot: { include: { owner: { select: { id: true, name: true, city: true } }, lotPhotos: { orderBy: { order: 'asc' } } } },
    myLot: { include: { lotPhotos: { orderBy: { order: 'asc' } } } },
    // достаточно авторов, чтобы понять, оценил ли текущий пользователь обмен
    reviews: { select: { authorId: true } },
    user: { select: { name: true } },
  };
}

async function serializeDeal(d, currentUserId) {
  const partnerLot = d.lot ? mapLot(d.lot, d.lot.owner?.city) : null;
  return {
    id: d.id,
    lot: partnerLot,
    ownerName: d.lot?.owner?.name || '',
    credits: d.credits,
    stage: d.stage,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    myLot: d.myLot ? mapLot(d.myLot, d.myLot.owner?.city) : null,
    role: d.userId === currentUserId ? 'initiator' : 'partner',
    initiatorConfirmed: d.initiatorConfirmed,
    partnerConfirmed: d.partnerConfirmed,
    // кого оцениваем и оценивали ли уже — экран завершения решает по этим полям
    partnerName: (d.userId === currentUserId ? d.lot?.owner?.name : d.user?.name) || 'партнёр',
    reviewed: (d.reviews || []).some(r => r.authorId === currentUserId),
  };
}

// Расчёт по сделке: разморозка эскроу, начисление владельцу и счётчики.
// Всё одной транзакцией — иначе сбой в середине оставляет баллы висеть
// в эскроу, а у получателя их уже нет.
async function completeDeal(deal) {
  const held = await prisma.transaction.findFirst({
    where: { userId: deal.userId, kind: 'escrow-in', status: 'held' },
    orderBy: { createdAt: 'desc' },
  });

  const ops = [];
  if (held) {
    ops.push(prisma.transaction.update({ where: { id: held.id }, data: { status: 'done' } }));
  }
  if (deal.credits > 0) {
    ops.push(prisma.transaction.create({
      data: {
        userId: deal.lot.ownerId,
        kind: 'earn',
        title: `Обмен: «${deal.lot.title.split(',')[0]}»`,
        sub: 'Переведено из эскроу',
        amt: deal.credits,
        status: 'done',
      },
    }));
  }
  ops.push(prisma.user.update({ where: { id: deal.lot.ownerId }, data: { balance: { increment: deal.credits }, dealsCount: { increment: 1 } } }));
  ops.push(prisma.user.update({ where: { id: deal.userId }, data: { dealsCount: { increment: 1 } } }));

  await prisma.$transaction(ops);
}

export async function createDealAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { lotId, credits, myLotId } = input || {};
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot || lot.status !== 'active') return { ok: false, error: 'Объявление недоступно' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  const num = Math.max(0, Math.round(Number(credits) || 0));
  if (num > 0 && user.balance < num) {
    return { ok: false, error: 'Недостаточно баллов — пополните кошелёк' };
  }

  // Списание, сделка и чат — одной транзакцией. Списываем условным UPDATE
  // (balance >= num), а не по ранее прочитанному значению: иначе два
  // параллельных запроса проходят одну и ту же проверку и уводят баланс в минус.
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (num > 0) {
        const debited = await tx.user.updateMany({
          where: { id: user.id, balance: { gte: num } },
          data: { balance: { decrement: num } },
        });
        if (debited.count !== 1) throw new InsufficientFunds();

        await tx.transaction.create({
          data: {
            userId: user.id,
            kind: 'escrow-in',
            title: `Эскроу · ${lot.title.split(',')[0]}`,
            sub: 'Доплата заморожена до подтверждения',
            amt: num,
            status: 'held',
          },
        });
      }

      const deal = await tx.deal.create({
        data: {
          userId: user.id,
          lotId: lot.id,
          myLotId: myLotId || null,
          credits: num,
          stage: 'created',
          status: 'active',
        },
      });

      // chat with the lot owner
      const chat = await tx.chat.create({
        data: { userId: user.id, partnerId: lot.ownerId, dealId: deal.id },
      });
      await tx.message.create({
        data: { chatId: chat.id, text: `Открыл(а) сделку на «${lot.title}» — ${num} Б в эскроу.` },
      });

      return { dealId: deal.id, chatId: chat.id };
    });
  } catch (e) {
    if (e instanceof InsufficientFunds) return { ok: false, error: 'Недостаточно баллов — пополните кошелёк' };
    throw e;
  }

  const created = await prisma.deal.findUnique({ where: { id: result.dealId }, include: dealWith() });
  return { ok: true, deal: await serializeDeal(created, user.id), chatId: result.chatId };
}

export async function listDealsAction() {
  return dealsOf(await getCurrentUser());
}

async function dealsOf(user) {
  if (!user) return [];
  const deals = await prisma.deal.findMany({
    where: { OR: [{ userId: user.id }, { lot: { ownerId: user.id } }], status: { not: 'cancelled' } },
    include: dealWith(),
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(deals.map(d => serializeDeal(d, user.id)));
}

// Общая часть обоих подтверждений. Флаг ставится условным UPDATE (по ещё
// не выставленному флагу), поэтому две одновременные попытки не могут обе
// увидеть «второй уже подтвердил» и дважды провести расчёт по сделке.
async function confirmSide(dealId, user, side) {
  const mine = side === 'initiator' ? 'initiatorConfirmed' : 'partnerConfirmed';
  const other = side === 'initiator' ? 'partnerConfirmed' : 'initiatorConfirmed';

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWith() });
  const owns = side === 'initiator' ? deal?.userId === user.id : deal?.lot?.ownerId === user.id;
  if (!deal || !owns) return { ok: false, error: 'Сделка не найдена' };
  if (deal.stage === 'done') return { ok: false, error: 'Сделка уже завершена' };
  if (deal[mine]) return { ok: false, error: 'Вы уже подтвердили получение' };
  if (deal.status !== 'active') return { ok: false, error: 'Сделка уже закрыта' };

  const both = deal[other];
  const claimed = await prisma.deal.updateMany({
    where: { id: deal.id, status: 'active', [mine]: false, [other]: both },
    data: both
      ? { stage: 'done', status: 'done', [mine]: true }
      : { stage: 'confirm', [mine]: true },
  });
  if (claimed.count !== 1) return { ok: false, error: 'Статус сделки изменился — обновите страницу' };

  const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: dealWith() });
  if (both) await completeDeal(updated);
  return { ok: true, deal: await serializeDeal(updated, user.id) };
}

export async function confirmReceiptAction(dealId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  return confirmSide(dealId, user, 'initiator');
}

export async function confirmPartnerAction(dealId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  return confirmSide(dealId, user, 'partner');
}

export async function cancelDealAction(dealId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWith() });
  if (!deal || (deal.userId !== user.id && deal.lot?.ownerId !== user.id)) return { ok: false, error: 'Сделка не найдена' };
  if (deal.status !== 'active') return { ok: false, error: 'Сделка уже закрыта' };
  if (deal.initiatorConfirmed || deal.partnerConfirmed) return { ok: false, error: 'Сделка подтверждена — отменить нельзя' };

  // Отмена и возврат из эскроу — атомарно. Сначала закрываем сделку условным
  // UPDATE: если её уже отменил параллельный запрос, count = 0 и вся
  // транзакция откатывается, поэтому баллы не вернутся дважды.
  try {
    await prisma.$transaction(async (tx) => {
      const closed = await tx.deal.updateMany({
        where: { id: deal.id, status: 'active' },
        data: { status: 'cancelled' },
      });
      if (closed.count !== 1) throw new DealClosed();

      if (deal.credits > 0) {
        await tx.user.update({ where: { id: deal.userId }, data: { balance: { increment: deal.credits } } });
        const held = await tx.transaction.findFirst({
          where: { userId: deal.userId, kind: 'escrow-in', status: 'held' },
          orderBy: { createdAt: 'desc' },
        });
        if (held) await tx.transaction.update({ where: { id: held.id }, data: { status: 'refunded' } });
      }
    });
  } catch (e) {
    if (e instanceof DealClosed) return { ok: false, error: 'Сделка уже закрыта' };
    throw e;
  }

  const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: dealWith() });
  return { ok: true, deal: await serializeDeal(updated, user.id) };
}

// ---------- wallet ----------

export async function topUpAction(amount) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const num = Math.max(0, Math.round(Number(amount) || 0));
  if (num <= 0) return { ok: false, error: 'Укажите сумму' };
  if (num > 200000) return { ok: false, error: 'Слишком большая сумма' };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { balance: { increment: num } },
  });
  await prisma.transaction.create({
    data: {
      userId: user.id,
      kind: 'bonus',
      title: 'Пополнение кошелька',
      sub: 'Баллы начислены',
      amt: num,
      status: 'done',
    },
  });
  return { ok: true, user: serializeUser(updated) };
}

export async function getWalletAction() {
  return walletOf(await getCurrentUser());
}

// История транзакций режется: суммы считаются агрегатами в БД,
// а в списке пользователю нужны последние операции, а не все за всё время.
const WALLET_TX_LIMIT = 50;

async function walletOf(user) {
  if (!user) return null;
  const [txs, heldSum, delta] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: WALLET_TX_LIMIT }),
    prisma.transaction.aggregate({ where: { userId: user.id, status: 'held' }, _sum: { amt: true } }),
    prisma.transaction.aggregate({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, status: 'done' },
      _sum: { amt: true },
    }),
  ]);
  return {
    balance: user.balance,
    escrow: heldSum._sum.amt || 0,
    delta30: delta._sum.amt || 0,
    demurrageInDays: 164,
    tx: txs.map(t => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      sub: t.sub,
      amt: t.amt,
      when: t.createdAt.toISOString(),
      status: t.status,
    })),
  };
}

// ---------- chat ----------

// Лимит переписки в открытом треде. Без него чат тянет всю историю целиком.
const THREAD_MESSAGE_LIMIT = 200;

const chatBase = {
  partner: { select: { id: true, name: true, city: true, avatar: true } },
  user: { select: { id: true, name: true, city: true, avatar: true } },
  deal: { select: { id: true, stage: true, credits: true, status: true, lot: { select: { title: true } } } },
};

// Открытый чат: последние N сообщений (забираем с конца, отдаём по возрастанию).
const chatWith = {
  ...chatBase,
  messages: { orderBy: { createdAt: 'desc' }, take: THREAD_MESSAGE_LIMIT },
};

// Список чатов: нужен только последний текст для превью — вся история
// всех переписок раньше уезжала клиенту на каждой загрузке приложения.
const chatListWith = {
  ...chatBase,
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
};

async function serializeChat(c, currentUserId) {
  const ownerSide = c.userId === currentUserId;
  const u = ownerSide ? c.partner : c.user;
  return {
    id: c.id,
    partner: {
      id: u?.id || '',
      name: u?.name || '',
      city: u?.city || '',
      avatar: u?.avatar || '',
    },
    deal: c.deal ? {
      id: c.deal.id,
      stage: c.deal.stage,
      credits: c.deal.credits,
      status: c.deal.status,
      title: c.deal.lot?.title || '',
    } : null,
    // из БД приходят по убыванию (свежие сверху) — разворачиваем в хронологию
    messages: c.messages.slice().reverse().map(m => ({
      id: m.id,
      from: !m.fromId ? 'sys' : (m.fromId === currentUserId ? 'me' : 'them'),
      me: m.fromId ? m.fromId === currentUserId : false,
      text: m.text,
      t: m.createdAt.toISOString(),
    })),
    createdAt: c.createdAt.toISOString(),
  };
}

export async function listChatsAction() {
  return chatsOf(await getCurrentUser());
}

async function chatsOf(user) {
  if (!user) return [];
  const chats = await prisma.chat.findMany({
    where: { OR: [{ userId: user.id }, { partnerId: user.id }] },
    include: chatListWith,
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(chats.map(c => serializeChat(c, user.id)));
}

export async function startChatAction(lotId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  let chat = await prisma.chat.findFirst({
    where: {
      OR: [
        { userId: user.id, partnerId: lot.ownerId },
        { userId: lot.ownerId, partnerId: user.id },
      ],
    },
    include: chatWith,
  });
  if (!chat) {
    chat = await prisma.chat.create({
      data: { userId: user.id, partnerId: lot.ownerId },
      include: chatWith,
    });
  }
  return { ok: true, chat: await serializeChat(chat, user.id) };
}

export async function getChatAction(chatId) {
  const user = await getCurrentUser();
  if (!user) return null;
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, OR: [{ userId: user.id }, { partnerId: user.id }] },
    include: chatWith,
  });
  return chat ? serializeChat(chat, user.id) : null;
}

export async function getDealChatAction(dealId) {
  const user = await getCurrentUser();
  if (!user) return null;
  const chat = await prisma.chat.findFirst({
    where: { dealId, OR: [{ userId: user.id }, { partnerId: user.id }] },
    include: chatWith,
  });
  return chat ? serializeChat(chat, user.id) : null;
}

export async function sendMessageAction(chatId, text) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const msg = (text || '').trim();
  if (!msg) return { ok: false, error: 'Пустое сообщение' };
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, OR: [{ userId: user.id }, { partnerId: user.id }] },
  });
  if (!chat) return { ok: false, error: 'Чат не найден' };
  const saved = await prisma.message.create({
    data: { chatId: chat.id, fromId: user.id, text: msg },
  });
  return { ok: true, message: { id: saved.id, me: true, from: 'me', text: msg, t: saved.createdAt.toISOString() } };
}

// ---------- chains ----------

const chainWith = { steps: { orderBy: { order: 'asc' } } };

function serializeChain(c) {
  return {
    id: c.id,
    score: c.score,
    note: c.note,
    steps: c.steps.map(s => ({
      who: s.who, gives: s.gives, photoUrl: s.photoUrl, to: s.to, value: s.value,
    })),
  };
}

export async function listChainsAction() {
  return chainsList();
}

async function chainsList() {
  const chains = await prisma.chain.findMany({ where: { status: 'active' }, include: chainWith, orderBy: { score: 'desc' } });
  return chains.map(serializeChain);
}

export async function joinChainAction(chainId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const chain = await prisma.chain.findUnique({ where: { id: chainId }, include: chainWith });
  if (!chain) return { ok: false, error: 'Цепочка не найдена' };
  if (!chain.steps.length) return { ok: false, error: 'В цепочке нет шагов' };

  const last = chain.steps[chain.steps.length - 1];
  const myStep = chain.steps.find(s => s.who === 'me');
  const credits = Math.max(0, last.value - (myStep ? myStep.value : 0));

  // pick the lot I receive from the last step (best-effort by title, else first active)
  const received = await prisma.lot.findFirst({
    where: { status: 'active', ownerId: { not: user.id }, title: { contains: last.gives.split(' ')[0] } },
    orderBy: { sortOrder: 'asc' },
  });
  const target = received || await prisma.lot.findFirst({ where: { status: 'active', ownerId: { not: user.id } }, orderBy: { sortOrder: 'asc' } });
  // lotId — обязательная ссылка: раньше при отсутствии лота писалась пустая
  // строка и получалась сделка, указывающая в никуда.
  if (!target) return { ok: false, error: 'Нет доступных лотов для этой цепочки' };

  const deal = await prisma.$transaction(async (tx) => {
    const d = await tx.deal.create({
      data: { userId: user.id, lotId: target.id, credits, stage: 'created', status: 'active' },
    });
    const chat = await tx.chat.create({
      data: { userId: user.id, partnerId: target.ownerId, dealId: d.id },
    });
    await tx.message.create({
      data: { chatId: chat.id, text: `Вступил(а) в цепочку «${chain.note}» — ${credits} Б в эскроу.` },
    });
    return d;
  });
  return { ok: true, dealId: deal.id };
}

// ---------- OAuth (Yandex ID / VK ID) ----------

export async function getOAuthUrlAction(provider, origin) {
  const c = await cookies();
  const base = (typeof origin === 'string' && origin ? origin : '').replace(/\/$/, '');
  const baseFinal = base || process.env.APP_URL || '';
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  };
  if (provider === 'vk') {
    const r = vkAuthStart(baseFinal || undefined);
    if (!r) return { ok: false, error: 'OAuth VK не настроен — добавьте ключи в .env' };
    c.set('vk_oauth', JSON.stringify({ state: r.state, verifier: r.codeVerifier, base: baseFinal }), cookieOpts);
    return { ok: true, url: r.url };
  }
  if (provider === 'yandex') {
    const r = yandexAuthStart(baseFinal || undefined);
    if (!r) return { ok: false, error: 'OAuth Яндекса не настроен — добавьте ключи в .env' };
    c.set('yandex_oauth', JSON.stringify({ base: baseFinal }), cookieOpts);
    return { ok: true, url: r.url };
  }
  return { ok: false, error: 'Неизвестный провайдер' };
}

// ---------- AI listing analysis ----------

export async function askWantsAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  try {
    const context = Array.isArray(input?.context) ? input.context : [];
    const res = await askWants(context);
    return { ok: true, ...res };
  } catch (e) {
    console.error('[ai] askWantsAction failed:', e);
    return { ok: false, error: 'Не удалось получить ответ ИИ' };
  }
}

export async function analyzeListingAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  try {
    const draft = await analyzeListing({
      kind: input?.kind || 'item',
      title: (input?.title || '').trim(),
      photo: typeof input?.photo === 'string' ? input.photo : '',
      value: Number(input?.value) || 0,
      wants: (input?.wants || '').trim(),
      city: user.city || '',
    });
    return { ok: true, draft };
  } catch (e) {
    console.error('[ai] analyzeListingAction failed:', e);
    return { ok: false, error: 'Не удалось проанализировать объявление — попробуйте ещё раз' };
  }
}

// ---------- AI matching ----------

export async function getMatchesAction() {
  const user = await getCurrentUser();
  // Матчингу нужны только тексты и цены — фото не тянем: ответ содержит
  // лишь id лота, лента берёт карточку из уже загруженного listLots().
  const lots = await prisma.lot.findMany({
    where: { status: 'active' },
    select: {
      id: true, ownerId: true, cat: true, title: true, desc: true,
      wants: true, value: true, views: true, hot: true,
      owner: { select: { name: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  const myLots = user ? lots.filter(l => l.ownerId === user.id) : [];
  const others = lots.filter(l => !user || l.ownerId !== user.id);

  const matches = await computeMatches({ myLots, others, myWants: user?.wants || '' });
  return matches.map((m, i) => ({
    id: `m-${i}-${m.lot.id}`,
    lot: m.lot.id,
    // какой из моих лотов предлагается в обмен — лента показывала первый
    myLot: m.myLotId || null,
    score: m.score,
    why: m.why,
    topup: m.topup,
    dir: m.dir,
  }));
}
