'use server';

import { prisma } from '../../lib/prisma';
import { analyzeListing, computeMatches } from '../../lib/ai';
import { refreshChainCandidates, findReplacement, CHAIN_ACCEPT_WINDOW_MS } from '../../lib/chains';
import { notify, serializeNotification } from '../../lib/notify';
import { pushEnabled, pushPublicKey } from '../../lib/push';
import { vkAuthStart, yandexAuthStart } from '../../lib/oauth';
import { saveDataUrl, saveDataUrls, isStorableImage } from '../../lib/storage';
import { cookies } from 'next/headers';
import { randomUUID, randomBytes } from 'node:crypto';
import * as rateLimit from '../../lib/rate-limit';
import { REPORT_REASONS, reasonLabel } from '../reports.js';
import {
  cancelDealWithEscrow,
  confirmDealSide,
  createDealWithEscrow,
  EscrowError,
  openDealDispute,
  resolveDealDispute,
} from '../../lib/deals/escrow.js';
import { expandedDealReadInclude, serializeEscrowReadState } from '../../lib/deals/rollout.js';
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
  // Цепочки стали персональными: гостю показывать нечего, и лишний
  // запрос на критическом пути ленты ему не нужен.
  const [lots, chains] = await Promise.all([lotsFeed(user), chainsList(user)]);
  return { user, lots, chains };
}

export async function loadAuthedDataAction() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [myLots, profile, deals, wallet, chats, favorites, notifications] = await Promise.all([
    myLotsOf(user), profileOf(user), dealsOf(user),
    walletOf(user), chatsOf(user), favoritesOf(user), notificationsOf(user),
  ]);
  return { myLots, profile, deals, wallet, chats, favorites, notifications };
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

  // Отзыв меняет рейтинг — человек должен узнать об этом от нас, а не
  // случайно заметить в профиле.
  await notify({
    userId: targetId,
    type: 'review',
    title: `${user.name} оценил(а) обмен на ${stars} из 5`,
    body: (text || '').trim().slice(0, 160),
    entityType: 'profile',
    entityId: '',
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

// Отдельный экшен под вишлист: updateProfileAction требует имя и переписывает
// город, био и телефон — в онбординге этих полей нет, и затирать их нельзя.
export async function updateProfileWantsAction(wants) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { wants: String(wants || '').trim().slice(0, 300) },
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
  // hidden сюда не попадает по определению (ищем только active), а вот
  // лоты заблокированных надо отсекать явно: блокировка прячет их скопом,
  // но между блокировкой и размещением бывает гонка.
  const where = { status: 'active', owner: { is: { status: { not: 'blocked' } } } };
  if (user) where.ownerId = { not: user.id };
  const lots = await prisma.lot.findMany({
    where,
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
    // Порядок ленты — дата размещения, свежие сверху. Раньше первым ключом
    // шёл sortOrder «ручного закрепления», но его никто никогда не выставлял:
    // у всех лотов там ноль, и ключ только запутывал.
    orderBy: { createdAt: 'desc' },
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function getMyLots() {
  return myLotsOf(await getCurrentUser());
}

async function myLotsOf(user) {
  if (!user) return [];
  const lots = await prisma.lot.findMany({
    // in_chain — лот занят активной цепочкой: из ленты он ушёл, но у
    // владельца в «моих лотах» обязан остаться, иначе вещь просто исчезла
    where: { ownerId: user.id, status: { in: ['active', 'in_chain'] } },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function getArchivedLots() {
  const user = await getCurrentUser();
  if (!user) return [];
  const lots = await prisma.lot.findMany({
    where: { ownerId: user.id, status: { in: ['archived', 'hidden'] } },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, reviewsCount: true, dealsCount: true } }, lotPhotos: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

async function ownLotOrNull(lotId, userId) {
  if (!lotId || !userId) return null;
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  return lot && lot.ownerId === userId ? lot : null;
}

export async function archiveLotAction(lotId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const lot = await ownLotOrNull(lotId, user.id);
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  await prisma.lot.update({ where: { id: lotId }, data: { status: 'archived' } });
  return { ok: true, id: lotId, status: 'archived' };
}

export async function restoreLotAction(lotId) {
  // hidden — решение модератора, автор его не отменяет; ниже проверка статуса
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const lot = await ownLotOrNull(lotId, user.id);
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.status === 'hidden') {
    return { ok: false, error: 'Объявление скрыто модератором — напишите нам, чтобы вернуть его' };
  }
  if (user.status === 'blocked') return { ok: false, error: 'Аккаунт заблокирован' };
  await prisma.lot.update({ where: { id: lotId }, data: { status: 'active' } });
  return { ok: true, id: lotId, status: 'active' };
}

export async function deleteLotAction(lotId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const lot = await ownLotOrNull(lotId, user.id);
  if (!lot) return { ok: false, error: 'Объявление не найдено' };

  // Если на объявлении есть активные сделки — физически удалить нельзя
  // (сломаются сделки). Переносим в архив.
  const activeDeals = await prisma.deal.count({
    where: { OR: [{ lotId }, { myLotId: lotId }], status: 'active' },
  });
  if (activeDeals > 0) {
    await prisma.lot.update({ where: { id: lotId }, data: { status: 'archived' } });
    return { ok: true, id: lotId, status: 'archived', notice: 'На объявлении есть активные сделки — оно перемещено в архив' };
  }

  await prisma.lot.delete({ where: { id: lotId } });
  return { ok: true, id: lotId, status: 'deleted' };
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
    where: { userId: user.id, lot: { is: { status: 'active' } } },
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
  if (user.status === 'blocked') return { ok: false, error: 'Аккаунт заблокирован — размещать объявления нельзя' };

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
// userId нужен цепочке: там платят несколько человек, и в отказе важно
// назвать того, у кого не хватило.
class InsufficientFunds extends Error {
  constructor(userId) { super('insufficient funds'); this.userId = userId; }
}

function dealWith() {
  return {
    ...expandedDealReadInclude(),
    lot: { include: { owner: { select: { id: true, name: true, city: true, avatar: true } }, lotPhotos: { orderBy: { order: 'asc' } } } },
    myLot: { include: { lotPhotos: { orderBy: { order: 'asc' } } } },
    // достаточно авторов, чтобы понять, оценил ли текущий пользователь обмен
    reviews: { select: { authorId: true } },
    user: { select: { name: true, avatar: true } },
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
    partnerAvatar: (d.userId === currentUserId ? d.lot?.owner?.avatar : d.user?.avatar) || '',
    disputed: !!d.disputedAt,
    disputeNote: d.disputeNote || '',
    disputeMine: !!d.disputeById && d.disputeById === currentUserId,
    reviewed: (d.reviews || []).some(r => r.authorId === currentUserId),
    // Признак состояния эскроу появляется только при включённом флаге и
    // никогда не содержит идентификатора проводки.
    ...serializeEscrowReadState(d),
  };
}

// Ошибки домена переводятся в сообщения пользователю здесь и только здесь;
// неизвестные пробрасываются наверх как есть.
const ESCROW_MESSAGES = {
  INSUFFICIENT_FUNDS: 'Недостаточно баллов — пополните кошелёк',
  LOT_UNAVAILABLE: 'Объявление недоступно',
  OWN_LOT: 'Это ваше объявление',
  DEAL_NOT_FOUND: 'Сделка не найдена',
  DEAL_CLOSED: 'Сделка уже закрыта',
  ALREADY_CONFIRMED: 'Вы уже подтвердили получение',
  DISPUTE_OPEN: 'По сделке открыт спор — дождитесь решения',
  DISPUTE_NOT_FOUND: 'Спор не найден',
  STATE_CHANGED: 'Статус сделки изменился — обновите страницу',
  COMMAND_CONFLICT: 'Условия предложения изменились — откройте сделку заново',
  // Точная связь сделки с эскроу нарушена или отсутствует. Автоматически
  // такое не чинится: деньги трогает только оператор после разбора.
  ESCROW_MISMATCH: 'Сделка требует проверки оператором — баллы остаются в эскроу',
  ESCROW_ALREADY_SETTLED: 'Сделка требует проверки оператором — баллы остаются в эскроу',
  CHAIN_HOLD_REFUSED: 'Сделка требует проверки оператором — баллы остаются в эскроу',
};

function escrowFailure(error) {
  if (error instanceof EscrowError) {
    return { ok: false, error: ESCROW_MESSAGES[error.code] || 'Не удалось выполнить действие' };
  }
  throw error;
}

export async function createDealAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  if (user.status === 'blocked') return { ok: false, error: 'Аккаунт заблокирован — открывать сделки нельзя' };

  const { lotId, credits, myLotId, clientCommandId } = input || {};
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot || lot.status !== 'active') return { ok: false, error: 'Объявление недоступно' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  const num = Math.max(0, Math.round(Number(credits) || 0));
  if (num > 0 && user.balance < num) {
    return { ok: false, error: 'Недостаточно баллов — пополните кошелёк' };
  }

  let result;
  try {
    result = await createDealWithEscrow(prisma, {
      actorId: user.id,
      lotId: lot.id,
      credits: num,
      myLotId: myLotId || null,
      // Без клиентского идентификатора повтор запроса открыл бы вторую
      // сделку и заморозил баллы дважды.
      clientCommandId: String(clientCommandId || randomUUID()),
      attach: async (tx, deal) => {
        const chat = await tx.chat.create({
          data: {
            kind: 'direct',
            userId: user.id,
            partnerId: lot.ownerId,
            dealId: deal.id,
            members: { create: [{ userId: user.id }, { userId: lot.ownerId }] },
          },
        });
        await tx.message.create({
          data: { chatId: chat.id, text: `Открыл(а) сделку на «${lot.title}» — ${num} Б в эскроу.` },
        });
        return { chatId: chat.id };
      },
    });
  } catch (e) {
    return escrowFailure(e);
  }

  const created = await prisma.deal.findUnique({ where: { id: result.dealId }, include: dealWith() });
  const chatId = result.attached?.chatId
    || (await prisma.chat.findFirst({ where: { dealId: result.dealId }, select: { id: true } }))?.id
    || null;

  // Уведомление уходит только за настоящее создание и только после коммита:
  // на повторе запроса владелец лота не получает второе предложение.
  if (!result.replayed) {
    await notify({
      userId: lot.ownerId,
      type: 'deal_offer',
      title: `${user.name} предлагает обмен`,
      body: num > 0
        ? `За «${lot.title}» — вещь и ${num} Б в эскроу.`
        : `За «${lot.title}» — обмен вещь на вещь.`,
      entityType: 'deal',
      entityId: created.id,
    });
  }

  return { ok: true, deal: await serializeDeal(created, user.id), chatId };
}

export async function listDealsAction() {
  return dealsOf(await getCurrentUser());
}

async function dealsOf(user) {
  if (!user) return [];
  const deals = await prisma.deal.findMany({
    where: { OR: [{ userId: user.id }, { lot: { is: { ownerId: user.id } } }], status: { not: 'cancelled' } },
    include: dealWith(),
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(deals.map(d => serializeDeal(d, user.id)));
}

// Общая часть обоих подтверждений. Заявка на переход и денежный расчёт
// живут внутри одной транзакции домена; здесь остаётся только определение
// стороны, перевод ошибок и уведомления после коммита.
async function confirmSide(dealId, user, side) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWith() });
  const owns = side === 'initiator' ? deal?.userId === user.id : deal?.lot?.ownerId === user.id;
  if (!deal || !owns) return { ok: false, error: 'Сделка не найдена' };

  let outcome;
  try {
    outcome = await confirmDealSide(prisma, { dealId: deal.id, actorId: user.id });
  } catch (e) {
    return escrowFailure(e);
  }

  const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: dealWith() });
  const both = outcome.settled;

  // Второй стороне: либо «дождались, обмен закрыт», либо «ваш ход».
  const otherId = side === 'initiator' ? updated.lot?.ownerId : updated.userId;
  const title = (updated.lot?.title || '').split(',')[0];
  if (otherId) {
    await notify(both
      ? {
        userId: otherId,
        type: 'deal_done',
        title: 'Обмен завершён',
        body: `«${title}» — эскроу разморожен, обмен закрыт. Оставьте оценку партнёру.`,
        entityType: 'deal',
        entityId: updated.id,
      }
      : {
        userId: otherId,
        type: 'deal_confirm',
        title: `${user.name} подтвердил(а) получение`,
        body: `Подтвердите и вы — тогда эскроу по «${title}» разморозится.`,
        entityType: 'deal',
        entityId: updated.id,
      });
  }

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

  try {
    await cancelDealWithEscrow(prisma, { dealId: deal.id, actorId: user.id });
  } catch (e) {
    return escrowFailure(e);
  }

  const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: dealWith() });

  // Отменить может любая из сторон — сообщаем второй, а инициатору отдельно
  // про возврат: баллы ушли в эскроу с его баланса, и их возврат он должен
  // увидеть без похода в кошелёк.
  const otherId = deal.userId === user.id ? deal.lot?.ownerId : deal.userId;
  const dealTitle = (deal.lot?.title || '').split(',')[0];
  const news = [];
  if (otherId) {
    news.push({
      userId: otherId,
      type: 'deal_cancelled',
      title: 'Сделка отменена',
      body: `${user.name} отменил(а) обмен «${dealTitle}».`,
      entityType: 'deal',
      entityId: deal.id,
    });
  }
  if (deal.credits > 0 && deal.userId !== user.id) {
    news.push({
      userId: deal.userId,
      type: 'deal_refund',
      title: `Возврат ${deal.credits} Б из эскроу`,
      body: `Обмен «${dealTitle}» отменён, баллы вернулись на баланс.`,
      entityType: 'wallet',
      entityId: '',
    });
  }
  await notify(news);

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
  members: { select: { userId: true, lastReadAt: true, user: { select: { id: true, name: true, city: true, avatar: true } } } },
};

// Состав чата — в ChatMember, и для парного тоже: групповой чат цепочки
// в два столбца userId/partnerId не помещается.
const chatMemberOf = (userId) => ({ members: { some: { userId } } });

// Открытый чат: последние N сообщений (забираем с конца, отдаём по возрастанию).
const chatWith = {
  ...chatBase,
  messages: {
    orderBy: { createdAt: 'desc' },
    take: THREAD_MESSAGE_LIMIT,
    // в групповом чате «они» — это трое разных людей, нужно имя автора
    include: { from: { select: { id: true, name: true } } },
  },
};

// Список чатов: нужен только последний текст для превью — вся история
// всех переписок раньше уезжала клиенту на каждой загрузке приложения.
const chatListWith = {
  ...chatBase,
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { from: { select: { id: true, name: true } } },
  },
};

async function serializeChat(c, currentUserId) {
  const others = (c.members || [])
    .map(m => m.user)
    .filter(u => u && u.id !== currentUserId);
  const ownerSide = c.userId === currentUserId;
  // В парном чате собеседник один; в цепочке «партнёра» нет, и шапка
  // называет чат самой цепочкой — иначе пришлось бы выбирать одного из двух.
  const u = c.kind === 'chain'
    ? { id: '', name: `Цепочка · ${others.length + 1} участника`, city: '', avatar: '' }
    : (others[0] || (ownerSide ? c.partner : c.user));
  return {
    id: c.id,
    kind: c.kind || 'direct',
    chainId: c.chainId || null,
    members: others.map(m => ({ id: m.id, name: m.name, city: m.city, avatar: m.avatar || '' })),
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
      author: m.fromId && m.fromId !== currentUserId ? (m.from?.name || '') : '',
      text: m.text,
      t: m.createdAt.toISOString(),
    })),
    createdAt: c.createdAt.toISOString(),
    // список сортируется по активности переписки, а не по дате её заведения
    // из БД сообщения приходят по убыванию — свежее всегда первое
    lastAt: (c.messages && c.messages.length ? c.messages[0].createdAt : c.createdAt).toISOString(),
    unread: 0,
  };
}

export async function listChatsAction() {
  return chatsOf(await getCurrentUser());
}

async function chatsOf(user) {
  if (!user) return [];
  const chats = await prisma.chat.findMany({
    where: chatMemberOf(user.id),
    include: chatListWith,
  });
  const out = await Promise.all(chats.map(c => serializeChat(c, user.id)));

  // Непрочитанное — одним запросом на все переписки: у каждой свой порог
  // (когда этот участник её открывал), поэтому условия собираются в OR.
  const conds = chats
    .map(c => {
      const mine = (c.members || []).find(m => m.userId === user.id);
      return { chatId: c.id, createdAt: { gt: mine?.lastReadAt || new Date(0) } };
    });
  if (conds.length) {
    const rows = await prisma.message.groupBy({
      by: ['chatId'],
      where: { fromId: { not: user.id }, OR: conds },
      _count: { _all: true },
    });
    const byChat = new Map(rows.map(r => [r.chatId, r._count._all]));
    for (const c of out) c.unread = byChat.get(c.id) || 0;
  }

  // Сортировка по активности: чат, заведённый давно, но живой сегодня,
  // должен быть сверху — раньше список шёл по дате создания чата.
  out.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
  return out;
}

// Отметить переписку прочитанной. Порог живёт на участнике, поэтому
// в групповом чате отметка одного не гасит бейдж остальным.
export async function markChatReadAction(chatId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await prisma.chatMember.updateMany({
    where: { chatId, userId: user.id },
    data: { lastReadAt: new Date() },
  });
  return { ok: true };
}

// Догрузка новых сообщений открытого треда. Отдаём только то, что появилось
// после известной клиенту отметки — поллинг не должен возить историю целиком.
export async function getChatUpdatesAction(chatId, afterIso) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, messages: [] };
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, ...chatMemberOf(user.id) },
    select: { id: true, deal: { select: { id: true, stage: true, credits: true, status: true, lot: { select: { title: true } } } } },
  });
  if (!chat) return { ok: false, messages: [] };
  const after = afterIso ? new Date(afterIso) : new Date(0);
  const rows = await prisma.message.findMany({
    where: { chatId, createdAt: { gt: Number.isNaN(after.getTime()) ? new Date(0) : after } },
    orderBy: { createdAt: 'asc' },
    take: THREAD_MESSAGE_LIMIT,
    include: { from: { select: { id: true, name: true } } },
  });
  return {
    ok: true,
    messages: rows.map(m => ({
      id: m.id,
      from: !m.fromId ? 'sys' : (m.fromId === user.id ? 'me' : 'them'),
      me: m.fromId ? m.fromId === user.id : false,
      author: m.fromId && m.fromId !== user.id ? (m.from?.name || '') : '',
      text: m.text,
      t: m.createdAt.toISOString(),
    })),
    deal: chat.deal ? {
      id: chat.deal.id,
      stage: chat.deal.stage,
      credits: chat.deal.credits,
      status: chat.deal.status,
      title: chat.deal.lot?.title || '',
    } : null,
  };
}

export async function startChatAction(lotId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  let chat = await prisma.chat.findFirst({
    where: {
      kind: 'direct',
      OR: [
        { userId: user.id, partnerId: lot.ownerId },
        { userId: lot.ownerId, partnerId: user.id },
      ],
    },
    include: chatWith,
  });
  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        kind: 'direct',
        userId: user.id,
        partnerId: lot.ownerId,
        members: { create: [{ userId: user.id }, { userId: lot.ownerId }] },
      },
      include: chatWith,
    });
  }
  return { ok: true, chat: await serializeChat(chat, user.id) };
}

export async function getChatAction(chatId) {
  const user = await getCurrentUser();
  if (!user) return null;
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, ...chatMemberOf(user.id) },
    include: chatWith,
  });
  return chat ? serializeChat(chat, user.id) : null;
}

export async function getDealChatAction(dealId) {
  const user = await getCurrentUser();
  if (!user) return null;
  const chat = await prisma.chat.findFirst({
    where: { dealId, ...chatMemberOf(user.id) },
    include: chatWith,
  });
  return chat ? serializeChat(chat, user.id) : null;
}

// Потолок одного сообщения. Переписка — не место для мегабайтных вставок:
// список чатов тянет последнее сообщение на каждой загрузке приложения.
const MAX_MESSAGE_LEN = 2000;
// Поток сообщений в минуту с одного аккаунта. Живой человек столько не пишет,
// а скрипт — легко: каждое сообщение это запись в БД и уведомления соседям.
const MESSAGE_RATE = { max: 40, windowMs: 60 * 1000 };

export async function sendMessageAction(chatId, text) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const msg = (text || '').trim();
  if (!msg) return { ok: false, error: 'Пустое сообщение' };
  if (msg.length > MAX_MESSAGE_LEN) {
    return { ok: false, error: `Слишком длинное сообщение — максимум ${MAX_MESSAGE_LEN} символов` };
  }
  const gate = rateLimit.hit(`msg:${user.id}`, MESSAGE_RATE);
  if (!gate.ok) return { ok: false, error: 'Слишком много сообщений подряд — подождите минуту' };
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, ...chatMemberOf(user.id) },
    include: { members: { select: { userId: true } } },
  });
  if (!chat) return { ok: false, error: 'Чат не найден' };
  const saved = await prisma.message.create({
    data: { chatId: chat.id, fromId: user.id, text: msg },
  });

  // Своё сообщение прочитано по определению — иначе отправитель сам себе
  // зажигает бейдж непрочитанного.
  await prisma.chatMember.updateMany({
    where: { chatId: chat.id, userId: user.id },
    data: { lastReadAt: saved.createdAt },
  });

  // О сообщении узнают так же, как о сделках и цепочках — через колокольчик.
  const others = (chat.members || []).map(m => m.userId).filter(id => id !== user.id);
  await notify(others.map(userId => ({
    userId,
    type: 'message',
    title: `Сообщение от ${user.name}`,
    body: msg,
    entityType: 'chat',
    entityId: chat.id,
  })));

  return { ok: true, message: { id: saved.id, me: true, from: 'me', author: '', text: msg, t: saved.createdAt.toISOString() } };
}

// ---------- chains ----------
//
// Жизненный цикл: candidate → pending → active → done.
// Из pending можно уйти в failed (отказ) или expired (вышло время).
// Уведомления рассылает только смена состояния — молча статус не меняем
// никогда, иначе человек узнаёт о своей цепочке случайно.

const chainWith = {
  steps: {
    orderBy: { order: 'asc' },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      toUser: { select: { id: true, name: true, avatar: true } },
      lot: { select: { id: true, title: true, photoUrl: true, photo: true, value: true } },
    },
  },
  chat: { select: { id: true } },
};

function serializeChain(c, meId) {
  const steps = c.steps.map(s => ({
    order: s.order,
    user: { id: s.user.id, name: s.user.id === meId ? 'Вы' : s.user.name, avatar: s.user.avatar || '' },
    toUser: { id: s.toUser.id, name: s.toUser.id === meId ? 'Вы' : s.toUser.name },
    lot: s.lot ? { id: s.lot.id, title: s.lot.title, photoUrl: s.lot.photoUrl || s.lot.photo || '', value: s.lot.value } : null,
    value: s.value,
    topup: s.topup,
    edgeScore: s.edgeScore,
    state: s.state,
    sent: !!s.sentAt,
    received: !!s.receivedAt,
    isMe: s.user.id === meId,
  }));

  const mine = c.steps.find(s => s.userId === meId) || null;
  // что достаётся мне — вещь того, кто отдаёт в мою сторону
  const incoming = c.steps.find(s => s.toUserId === meId) || null;
  const accepted = c.steps.filter(s => s.state === 'accepted').length;

  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    score: c.score,
    note: c.note,
    city: c.city,
    chatId: c.chat?.id || null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    accepted,
    total: c.steps.length,
    steps,
    me: mine ? {
      state: mine.state,
      topup: mine.topup,
      gives: mine.lot ? { id: mine.lot.id, title: mine.lot.title, value: mine.lot.value, photoUrl: mine.lot.photoUrl || mine.lot.photo || '' } : null,
      receives: incoming?.lot ? { id: incoming.lot.id, title: incoming.lot.title, value: incoming.lot.value, photoUrl: incoming.lot.photoUrl || incoming.lot.photo || '' } : null,
      sent: !!mine.sentAt,
      received: !!incoming?.receivedAt,
      isInitiator: c.initiatorId === meId,
    } : null,
  };
}

const chainOf = (id) => prisma.chain.findUnique({ where: { id }, include: chainWith });

export async function listChainsAction() {
  return chainsList(await getCurrentUser());
}

async function chainsList(user) {
  if (!user) return [];
  await expireStaleChains();
  const chains = await prisma.chain.findMany({
    where: {
      steps: { some: { userId: user.id } },
      status: { in: ['candidate', 'pending', 'active'] },
    },
    include: chainWith,
    orderBy: [{ status: 'asc' }, { score: 'desc' }],
  });
  // В работе — выше кандидатов: незакрытое действие важнее новой возможности.
  const rank = { active: 0, pending: 1, candidate: 2 };
  return chains
    .map(c => serializeChain(c, user.id))
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (b.score - a.score));
}

export async function getChainAction(chainId) {
  const user = await getCurrentUser();
  if (!user) return null;
  const chain = await chainOf(chainId);
  if (!chain || !chain.steps.some(s => s.userId === user.id)) return null;
  return serializeChain(chain, user.id);
}

// Пересчёт кандидатов — тяжёлая фоновая операция (эмбеддинги + граф),
// поэтому не чаще раза в REFRESH_COOLDOWN на процесс.
const REFRESH_COOLDOWN_MS = 10 * 60000;
// Ключ — город: движок и так считает по городу, и общий кулдаун молча
// отказывал бы всем, кроме того, кто нажал первым.
const lastRefreshAt = new Map();
// Итоги последнего поиска — чтобы на пустом экране объяснить, чего не хватило.
const chainStats = new Map();

// Область поиска выбирает человек: вещь через полстраны не поедет, а дизайн,
// таргет или консультацию можно получить откуда угодно.
export async function refreshChainsAction(scope = 'region') {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const mode = scope === 'any' ? 'any' : 'region';
  const city = user.city || '';
  const key = `${city}|${mode}`;
  const lastStats = chainStats.get(key) || null;
  if (Date.now() - (lastRefreshAt.get(key) || 0) < REFRESH_COOLDOWN_MS) {
    return { ok: true, skipped: true, chains: await chainsList(user), stats: lastStats };
  }
  lastRefreshAt.set(key, Date.now());
  let stats = null;
  try {
    const res = await refreshChainCandidates({ city, scope: mode });
    stats = res?.stats || null;
    if (stats) chainStats.set(key, stats);
  } catch (e) {
    console.warn('[chains] refresh failed:', e.message);
  }
  return { ok: true, chains: await chainsList(user), stats };
}

// Просроченные pending снимаем лениво, на любом чтении цепочек: отдельного
// планировщика в проекте нет, а держать «живой» цепочку с истёкшим TTL —
// значит врать про таймер, который видят все участники.
async function expireStaleChains() {
  const stale = await prisma.chain.findMany({
    where: { status: 'pending', expiresAt: { lt: new Date() } },
    include: { steps: { select: { userId: true } } },
  });
  if (!stale.length) return;

  await prisma.chain.updateMany({
    where: { id: { in: stale.map(c => c.id) }, status: 'pending' },
    data: { status: 'expired' },
  });
  await notify(stale.flatMap(c => c.steps.map(s => ({
    userId: s.userId,
    type: 'chain_expired',
    title: 'Цепочка не собралась',
    body: 'Не все участники успели ответить за сутки. Доплаты не списывались.',
    entityType: 'chain',
    entityId: c.id,
  }))));
}

const chainNames = (chain, exceptId) => chain.steps
  .filter(s => s.userId !== exceptId)
  .map(s => s.user?.name)
  .filter(Boolean);

// Текст приглашения начинается с того, что человек получает: механика
// «кто кому что отдаёт» интересна вторым делом, а решение принимается по
// первой строке уведомления.
function inviteBody(chain, step) {
  const incoming = chain.steps.find(s => s.toUserId === step.userId);
  const gets = incoming?.lot?.title
    ? `Вам — «${incoming.lot.title}».`
    : `Вам — ${Math.abs(step.topup)} Б.`;
  const gives = step.lot?.title
    ? ` Ваш «${step.lot.title}» уходит к ${chain.steps.find(s => s.userId === step.toUserId)?.user?.name || 'участнику'}.`
    : '';
  const money = step.topup > 0
    ? ` Доплата: ${step.topup} Б.`
    : (step.topup < 0 ? ` Вам начислят ${Math.abs(step.topup)} Б.` : ' Без доплаты.');
  return `${gets}${gives}${money}`;
}

export async function startChainAction(chainId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const chain = await chainOf(chainId);
  if (!chain) return { ok: false, error: 'Цепочка не найдена' };
  const mine = chain.steps.find(s => s.userId === user.id);
  if (!mine) return { ok: false, error: 'Вы не участник этой цепочки' };
  if (chain.status !== 'candidate') return { ok: false, error: 'Цепочка уже запущена' };
  if (mine.topup > 0 && user.balance < mine.topup) {
    return { ok: false, error: `Не хватает ${mine.topup - user.balance} Б для доплаты — пополните кошелёк` };
  }

  const expiresAt = new Date(Date.now() + CHAIN_ACCEPT_WINDOW_MS);
  // Условный UPDATE: если двое нажали «я в деле» одновременно, запускает
  // цепочку только первый, второй получает её уже в pending.
  const claimed = await prisma.chain.updateMany({
    where: { id: chain.id, status: 'candidate' },
    data: { status: 'pending', initiatorId: user.id, expiresAt },
  });
  if (claimed.count !== 1) return { ok: false, error: 'Цепочку только что запустил другой участник — обновите страницу' };

  await prisma.chainStep.update({
    where: { id: mine.id },
    data: { state: 'accepted', respondedAt: new Date() },
  });

  await notify(chain.steps.filter(s => s.userId !== user.id).map(s => ({
    userId: s.userId,
    type: 'chain_invite',
    title: `${user.name} собирает цепочку — нужен ваш ответ`,
    body: `${inviteBody(chain, s)} Ответить нужно за 24 часа.`,
    entityType: 'chain',
    entityId: chain.id,
  })));

  return { ok: true, chain: serializeChain(await chainOf(chain.id), user.id) };
}

export async function respondChainAction(chainId, accept) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const chain = await chainOf(chainId);
  if (!chain) return { ok: false, error: 'Цепочка не найдена' };
  const mine = chain.steps.find(s => s.userId === user.id);
  if (!mine) return { ok: false, error: 'Вы не участник этой цепочки' };
  if (chain.status !== 'pending') return { ok: false, error: 'Цепочка больше не ждёт ответов' };
  if (mine.state !== 'pending') return { ok: false, error: 'Вы уже ответили' };

  if (!accept) return declineChain(chain, user);

  if (mine.topup > 0 && user.balance < mine.topup) {
    return { ok: false, error: `Не хватает ${mine.topup - user.balance} Б для доплаты — пополните кошелёк` };
  }

  const claimed = await prisma.chainStep.updateMany({
    where: { id: mine.id, state: 'pending' },
    data: { state: 'accepted', respondedAt: new Date() },
  });
  if (claimed.count !== 1) return { ok: false, error: 'Ответ уже записан — обновите страницу' };

  const fresh = await chainOf(chain.id);
  const waiting = fresh.steps.filter(s => s.state === 'pending');

  if (!waiting.length) {
    const res = await activateChain(fresh);
    if (!res.ok) return res;
    return { ok: true, chain: serializeChain(await chainOf(chain.id), user.id) };
  }

  if (waiting.length === 1) {
    // Последнему — отдельный текст: на нём одном держится вся цепочка,
    // и это самое сильное место во всей механике.
    const [last] = waiting;
    await notify({
      userId: last.userId,
      type: 'chain_last_call',
      title: `${chainNames(fresh, last.userId).join(' и ')} ждут только вас`,
      body: `${inviteBody(fresh, last)} Цепочка соберётся, как только вы подтвердите.`,
      entityType: 'chain',
      entityId: fresh.id,
    });
  } else {
    await notify(fresh.steps
      .filter(s => s.userId !== user.id && s.state === 'accepted')
      .map(s => ({
        userId: s.userId,
        type: 'chain_progress',
        title: `${user.name} в деле`,
        body: `Согласились ${fresh.steps.length - waiting.length} из ${fresh.steps.length}.`,
        entityType: 'chain',
        entityId: fresh.id,
      })));
  }

  return { ok: true, chain: serializeChain(fresh, user.id) };
}

// Отказ не должен ощущаться как «всё пропало»: сразу ищем замену
// отказавшемуся и предлагаем новую цепочку тем, кто уже был согласен.
async function declineChain(chain, user) {
  await prisma.$transaction([
    prisma.chainStep.updateMany({
      where: { id: chain.steps.find(s => s.userId === user.id).id, state: 'pending' },
      data: { state: 'declined', respondedAt: new Date() },
    }),
    prisma.chain.updateMany({
      where: { id: chain.id, status: 'pending' },
      data: { status: 'failed' },
    }),
  ]);

  const others = chain.steps.filter(s => s.userId !== user.id);
  let replacement = null;
  try {
    const found = await findReplacement({
      city: chain.city,
      keepUserId: chain.initiatorId || others[0]?.userId,
      excludeUserIds: [user.id],
    });
    if (found) replacement = await createReplacementChain(found, chain.id);
  } catch (e) {
    console.warn('[chains] replacement search failed:', e.message);
  }

  if (replacement) {
    await notify(replacement.steps.map(s => ({
      userId: s.userId,
      type: 'chain_replaced',
      title: 'Нашли замену — цепочка снова в сборе',
      body: `${inviteBody(replacement, s)} Один из участников отказался, состав пересобран.`,
      entityType: 'chain',
      entityId: replacement.id,
    })));
  } else {
    await notify(others.map(s => ({
      userId: s.userId,
      type: 'chain_failed',
      title: 'Цепочка распалась',
      body: `${user.name} отказался, замены пока нет. Доплаты не списывались — предложим новый вариант, как только он появится.`,
      entityType: 'chain',
      entityId: chain.id,
    })));
  }

  return { ok: true, declined: true, replacementId: replacement?.id || null };
}

async function createReplacementChain(found, replacesId) {
  try {
    const created = await prisma.chain.create({
      data: {
        kind: found.kind,
        score: found.score,
        note: found.note,
        city: found.city,
        status: 'pending',
        fingerprint: found.fingerprint,
        replacesId,
        expiresAt: new Date(Date.now() + CHAIN_ACCEPT_WINDOW_MS),
        steps: {
          create: found.steps.map(s => ({
            order: s.order, userId: s.userId, lotId: s.lotId, toUserId: s.toUserId,
            value: s.value, topup: s.topup, edgeScore: s.edgeScore, state: 'pending',
          })),
        },
      },
    });
    return chainOf(created.id);
  } catch (e) {
    // такой состав уже есть в БД — заменой он быть не может
    if (e?.code === 'P2002') return null;
    throw e;
  }
}

// Все согласились: блокируем лоты, замораживаем доплаты, открываем общий чат.
async function activateChain(chain) {
  const payers = chain.steps.filter(s => s.topup > 0);
  const lotIds = chain.steps.map(s => s.lotId).filter(Boolean);

  try {
    await prisma.$transaction(async (tx) => {
      for (const s of payers) {
        const debited = await tx.user.updateMany({
          where: { id: s.userId, balance: { gte: s.topup } },
          data: { balance: { decrement: s.topup } },
        });
        if (debited.count !== 1) throw new InsufficientFunds(s.userId);
        await tx.transaction.create({
          data: {
            userId: s.userId,
            kind: 'escrow-in',
            title: 'Эскроу · цепочка',
            sub: 'Доплата заморожена до подтверждения передач',
            amt: s.topup,
            status: 'held',
            refType: 'chain',
            refId: chain.id,
          },
        });
      }

      // Лот, ушедший в активную цепочку, исчезает из ленты: иначе на него
      // продолжают приходить прямые предложения по уже занятой вещи.
      await tx.lot.updateMany({ where: { id: { in: lotIds } }, data: { status: 'in_chain' } });

      const chat = await tx.chat.create({
        data: {
          kind: 'chain',
          chainId: chain.id,
          members: { create: chain.steps.map(s => ({ userId: s.userId })) },
        },
      });
      await tx.message.create({
        data: {
          chatId: chat.id,
          text: 'Цепочка собралась. Договоритесь о передаче: каждый отдаёт свою вещь следующему участнику и отмечает передачу в приложении.',
        },
      });

      // Шаг закрытия баллами передавать нечего — он закрыт сразу.
      await tx.chainStep.updateMany({
        where: { chainId: chain.id, lotId: null },
        data: { sentAt: new Date(), receivedAt: new Date() },
      });

      await tx.chain.update({ where: { id: chain.id }, data: { status: 'active' } });
    });
  } catch (e) {
    if (e instanceof InsufficientFunds) {
      await prisma.chain.updateMany({ where: { id: chain.id, status: 'pending' }, data: { status: 'failed' } });
      const brokeName = chain.steps.find(s => s.userId === e.userId)?.user?.name || 'один из участников';
      await notify(chain.steps.map(s => ({
        userId: s.userId,
        type: 'chain_failed',
        title: 'Цепочка не собралась',
        body: `У участника ${brokeName} не хватило баллов на доплату. Ничего не списано.`,
        entityType: 'chain',
        entityId: chain.id,
      })));
      return { ok: false, error: 'У одного из участников не хватило баллов — цепочка отменена' };
    }
    throw e;
  }

  const active = await chainOf(chain.id);
  await notify(active.steps.map(s => ({
    userId: s.userId,
    type: 'chain_active',
    title: 'Цепочка собралась!',
    body: `Все ${active.steps.length} участника согласились. Открыт общий чат — договоритесь о передаче.`,
    entityType: 'chain',
    entityId: active.id,
  })));
  return { ok: true };
}

// ---- передача вещей ----
//
// В паре обмен симметричный, в тройке каждый везёт вещь не тому, от кого
// получает. Поэтому подтверждений два на каждое звено: отдал и получил.

async function markTransfer(chainId, user, field) {
  const chain = await chainOf(chainId);
  if (!chain) return { ok: false, error: 'Цепочка не найдена' };
  if (chain.status !== 'active') return { ok: false, error: 'Цепочка не в работе' };

  const step = field === 'sentAt'
    ? chain.steps.find(s => s.userId === user.id)
    : chain.steps.find(s => s.toUserId === user.id);
  if (!step) return { ok: false, error: 'Вы не участник этой цепочки' };
  if (!step.lotId) return { ok: false, error: 'В этом звене вещь не передаётся' };
  if (field === 'receivedAt' && !step.sentAt) {
    return { ok: false, error: 'Отправитель ещё не отметил передачу' };
  }
  if (step[field]) return { ok: false, error: 'Уже отмечено' };

  const claimed = await prisma.chainStep.updateMany({
    where: { id: step.id, [field]: null },
    data: { [field]: new Date() },
  });
  if (claimed.count !== 1) return { ok: false, error: 'Статус изменился — обновите страницу' };

  const fresh = await chainOf(chainId);
  if (fresh.steps.every(s => s.sentAt && s.receivedAt)) await completeChain(fresh);

  return { ok: true, chain: serializeChain(await chainOf(chainId), user.id) };
}

export async function confirmChainSentAction(chainId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  return markTransfer(chainId, user, 'sentAt');
}

export async function confirmChainReceivedAction(chainId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  return markTransfer(chainId, user, 'receivedAt');
}

// Все передачи подтверждены: эскроу раскрывается, получатели доплат
// забирают баллы, лоты уходят из ленты.
async function completeChain(chain) {
  const receivers = chain.steps.filter(s => s.topup < 0);
  const lotIds = chain.steps.map(s => s.lotId).filter(Boolean);

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { refType: 'chain', refId: chain.id, status: 'held' },
      data: { status: 'done' },
    }),
    ...receivers.flatMap(s => [
      prisma.transaction.create({
        data: {
          userId: s.userId,
          kind: 'earn',
          title: 'Цепочка · разница в стоимости',
          sub: 'Переведено из эскроу',
          amt: -s.topup,
          status: 'done',
          refType: 'chain',
          refId: chain.id,
        },
      }),
      prisma.user.update({ where: { id: s.userId }, data: { balance: { increment: -s.topup } } }),
    ]),
    ...chain.steps.map(s => prisma.user.update({
      where: { id: s.userId },
      data: { dealsCount: { increment: 1 } },
    })),
    prisma.lot.updateMany({ where: { id: { in: lotIds } }, data: { status: 'traded' } }),
    prisma.chain.update({ where: { id: chain.id }, data: { status: 'done' } }),
  ]);

  await notify(chain.steps.map(s => ({
    userId: s.userId,
    type: 'chain_done',
    title: 'Цепочка закрыта',
    body: 'Все передачи подтверждены, баллы разморожены. Спасибо!',
    entityType: 'chain',
    entityId: chain.id,
  })));
}

// ---------- notifications ----------

const NOTIFICATIONS_LIMIT = 50;

// ---------- push ----------

// Публичный VAPID-ключ отдаём с сервера, а не через NEXT_PUBLIC_: иначе он
// вмораживается в сборку, и смена ключа требует пересборки образа.
export async function pushConfigAction() {
  return { enabled: pushEnabled(), publicKey: pushPublicKey() };
}

export async function savePushSubscriptionAction(sub) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!endpoint || !p256dh || !auth) return { ok: false, error: 'Некорректная подписка' };

  // Один и тот же endpoint может достаться другому аккаунту на общем
  // устройстве — тогда подписку перевешиваем, а не плодим вторую.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh, auth },
    create: { userId: user.id, endpoint, p256dh, auth },
  });
  return { ok: true };
}

export async function deletePushSubscriptionAction(endpoint) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await prisma.pushSubscription.deleteMany({ where: { endpoint: String(endpoint || ''), userId: user.id } });
  return { ok: true };
}

// ---------- рассылка ----------
//
// Список админов — в переменной окружения, а не в базе и не в коде: чтобы
// выдать или отобрать доступ, не нужен ни деплой, ни правка данных.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const isAdmin = (user) => !!user && ADMIN_EMAILS.includes((user.email || '').toLowerCase());

// Тестовые аккаунты не должны искажать воронку реального запуска. Админы
// исключаются автоматически; друзей и внутренние аккаунты можно добавить в
// ANALYTICS_TEST_EMAILS через запятую без миграции базы и нового деплоя кода.
const ANALYTICS_TEST_EMAILS = [...new Set([
  ...ADMIN_EMAILS,
  ...(process.env.ANALYTICS_TEST_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
])];

const BROADCAST_MAX_TITLE = 120;
const BROADCAST_MAX_BODY = 400;
// Рассылка уходит всем живым людям: пять штук в час — это уже много.
const BROADCAST_RATE = { max: 5, windowMs: 60 * 60 * 1000 };

async function audienceIds(audience) {
  const where = audience === 'with_lots'
    ? { lots: { some: { status: { in: ['active', 'in_chain'] } } } }
    : {};
  const rows = await prisma.user.findMany({ where, select: { id: true } });
  return rows.map(r => r.id);
}

// Экран рассылки спрашивает это при открытии: и права, и размер аудитории.
export async function broadcastInfoAction() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { admin: false };
  const [all, withLots] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { lots: { some: { status: { in: ['active', 'in_chain'] } } } } }),
  ]);
  return { admin: true, all, withLots };
}

const FUNNEL_PERIODS = new Set([7, 30]);

const addToSet = (set, value) => {
  if (value) set.add(value);
};

const intersectSets = (left, right) => new Set([...left].filter(id => right.has(id)));

// Когортная воронка: берём людей, зарегистрированных в выбранный период, и
// смотрим, какой последовательный путь они успели пройти после регистрации.
// Это не сумма событий: один активный человек считается на каждом шаге один раз.
export async function funnelAnalyticsAction(input = {}) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { admin: false };

  const requestedDays = Number(input?.days);
  const days = FUNNEL_PERIODS.has(requestedDays) ? requestedDays : 0;
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  const includeTest = input?.includeTest === true;
  const excludedEmails = includeTest ? [] : ANALYTICS_TEST_EMAILS;
  const createdAt = since ? { gte: since } : undefined;
  const cohortWhere = {
    ...(createdAt ? { createdAt } : {}),
    ...(excludedEmails.length ? { email: { notIn: excludedEmails } } : {}),
  };

  const cohort = await prisma.user.findMany({
    where: cohortWhere,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const cohortIds = cohort.map(row => row.id);

  const emptyFunnel = [
    { id: 'registered', label: 'Зарегистрировались', value: cohortIds.length },
    { id: 'listed', label: 'Разместили лот', value: 0 },
    { id: 'messaged', label: 'Написали сообщение', value: 0 },
    { id: 'deal', label: 'Открыли сделку', value: 0 },
    { id: 'done', label: 'Завершили обмен', value: 0 },
  ];

  const testUserWhere = {
    ...(createdAt ? { createdAt } : {}),
    ...(ANALYTICS_TEST_EMAILS.length ? { email: { in: ANALYTICS_TEST_EMAILS } } : { id: '__none__' }),
  };
  const entityDate = createdAt ? { createdAt } : {};
  const nonTestUser = excludedEmails.length ? { email: { notIn: excludedEmails } } : {};

  const [
    cohortLots,
    cohortMessages,
    cohortDeals,
    excludedUsers,
    lotsTotal,
    lotsWithoutViews,
    dealsTotal,
    dealsDone,
    dealsActive,
    dealsCancelled,
    disputesOpen,
    chainsTotal,
    chainsCandidate,
    chainsPending,
    chainsActive,
    chainsDone,
    chainsFailed,
  ] = await Promise.all([
    cohortIds.length
      ? prisma.lot.findMany({ where: { ownerId: { in: cohortIds } }, select: { ownerId: true } })
      : [],
    cohortIds.length
      ? prisma.message.findMany({ where: { fromId: { in: cohortIds } }, select: { fromId: true } })
      : [],
    cohortIds.length
      ? prisma.deal.findMany({ where: { userId: { in: cohortIds } }, select: { userId: true, status: true, stage: true } })
      : [],
    includeTest ? 0 : prisma.user.count({ where: testUserWhere }),
    prisma.lot.count({ where: { ...entityDate, owner: { is: nonTestUser } } }),
    prisma.lot.count({ where: { ...entityDate, views: 0, owner: { is: nonTestUser } } }),
    prisma.deal.count({ where: { ...entityDate, user: { is: nonTestUser }, lot: { is: { owner: { is: nonTestUser } } } } }),
    prisma.deal.count({ where: { ...entityDate, status: 'done', user: { is: nonTestUser }, lot: { is: { owner: { is: nonTestUser } } } } }),
    prisma.deal.count({ where: { ...entityDate, status: 'active', user: { is: nonTestUser }, lot: { is: { owner: { is: nonTestUser } } } } }),
    prisma.deal.count({ where: { ...entityDate, status: 'cancelled', user: { is: nonTestUser }, lot: { is: { owner: { is: nonTestUser } } } } }),
    prisma.deal.count({ where: { ...entityDate, status: 'active', disputedAt: { not: null }, user: { is: nonTestUser }, lot: { is: { owner: { is: nonTestUser } } } } }),
    prisma.chain.count({ where: { ...entityDate, ...(excludedEmails.length ? { steps: { none: { user: { is: { email: { in: excludedEmails } } } } } } : {}) } }),
    prisma.chain.count({ where: { ...entityDate, status: 'candidate', ...(excludedEmails.length ? { steps: { none: { user: { is: { email: { in: excludedEmails } } } } } } : {}) } }),
    prisma.chain.count({ where: { ...entityDate, status: 'pending', ...(excludedEmails.length ? { steps: { none: { user: { is: { email: { in: excludedEmails } } } } } } : {}) } }),
    prisma.chain.count({ where: { ...entityDate, status: 'active', ...(excludedEmails.length ? { steps: { none: { user: { is: { email: { in: excludedEmails } } } } } } : {}) } }),
    prisma.chain.count({ where: { ...entityDate, status: 'done', ...(excludedEmails.length ? { steps: { none: { user: { is: { email: { in: excludedEmails } } } } } } : {}) } }),
    prisma.chain.count({ where: { ...entityDate, status: { in: ['failed', 'expired'] }, ...(excludedEmails.length ? { steps: { none: { user: { is: { email: { in: excludedEmails } } } } } } : {}) } }),
  ]);

  let funnel = emptyFunnel;
  if (cohortIds.length) {
    const registered = new Set(cohortIds);
    const listedRaw = new Set();
    const messagedRaw = new Set();
    const dealRaw = new Set();
    const doneRaw = new Set();
    cohortLots.forEach(row => addToSet(listedRaw, row.ownerId));
    cohortMessages.forEach(row => addToSet(messagedRaw, row.fromId));
    cohortDeals.forEach(row => {
      addToSet(dealRaw, row.userId);
      if (row.status === 'done' || row.stage === 'done') addToSet(doneRaw, row.userId);
    });

    const listed = intersectSets(registered, listedRaw);
    const messaged = intersectSets(listed, messagedRaw);
    const openedDeal = intersectSets(messaged, dealRaw);
    const completed = intersectSets(openedDeal, doneRaw);
    funnel = [
      { id: 'registered', label: 'Зарегистрировались', value: registered.size },
      { id: 'listed', label: 'Разместили лот', value: listed.size },
      { id: 'messaged', label: 'Написали сообщение', value: messaged.size },
      { id: 'deal', label: 'Открыли сделку', value: openedDeal.size },
      { id: 'done', label: 'Завершили обмен', value: completed.size },
    ];
  }

  return {
    admin: true,
    period: { days, since: since?.toISOString() || null },
    filters: {
      includeTest,
      excludedUsers,
      testFilterConfigured: ANALYTICS_TEST_EMAILS.length > 0,
    },
    funnel,
    totals: {
      lots: lotsTotal,
      lotsWithoutViews,
      deals: dealsTotal,
      dealsDone,
      dealsActive,
      dealsCancelled,
      disputesOpen,
      chains: chainsTotal,
      chainsCandidate,
      chainsPending,
      chainsActive,
      chainsDone,
      chainsFailed,
    },
  };
}

export async function broadcastAction(input) {
  const user = await getCurrentUser();
  // Проверка на сервере, а не в интерфейсе: спрятанная кнопка защитой не является.
  if (!isAdmin(user)) return { ok: false, error: 'Недостаточно прав' };

  const title = String(input?.title || '').trim().slice(0, BROADCAST_MAX_TITLE);
  const body = String(input?.body || '').trim().slice(0, BROADCAST_MAX_BODY);
  if (!title) return { ok: false, error: 'Нужен заголовок' };

  const gate = rateLimit.hit(`broadcast:${user.id}`, BROADCAST_RATE);
  if (!gate.ok) return { ok: false, error: 'Слишком часто — попробуйте позже' };

  const ids = await audienceIds(input?.audience);
  if (!ids.length) return { ok: false, error: 'Некому отправлять' };

  const sent = await notify(ids.map(userId => ({
    userId,
    type: 'system',
    title,
    body,
    entityType: '',
    entityId: '',
  })));
  console.log(`[broadcast] ${user.email} → ${sent} получателей: ${title}`);
  return { ok: true, sent };
}

export async function listNotificationsAction() {
  const user = await getCurrentUser();
  return notificationsOf(user);
}

async function notificationsOf(user) {
  if (!user) return { items: [], unread: 0 };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATIONS_LIMIT,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items: rows.map(serializeNotification), unread };
}

export async function markNotificationsReadAction(ids) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const list = Array.isArray(ids) ? ids.filter(Boolean) : null;
  await prisma.notification.updateMany({
    // без списка помечаем всё: это «открыл колокольчик»
    where: { userId: user.id, readAt: null, ...(list ? { id: { in: list } } : {}) },
    data: { readAt: new Date() },
  });
  return { ok: true };
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
    orderBy: { createdAt: 'desc' },
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

// ---------- спор по сделке ----------
//
// Механика без спора зависала: эскроу размораживается только когда получение
// подтвердили обе стороны, а отменить сделку после первого подтверждения уже
// нельзя. Если вещь пришла не та, второй участник просто не подтверждал — и
// баллы висели замороженными вечно, без выхода. Спор даёт выход: сделка
// замирает, а решение принимает администратор.

const MAX_DISPUTE_NOTE = 600;

export async function openDisputeAction(dealId, text) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWith() });
  if (!deal || (deal.userId !== user.id && deal.lot?.ownerId !== user.id)) {
    return { ok: false, error: 'Сделка не найдена' };
  }

  const note = String(text || '').trim().slice(0, MAX_DISPUTE_NOTE);
  try {
    await openDealDispute(prisma, { dealId: deal.id, actorId: user.id, note, maxNote: MAX_DISPUTE_NOTE });
  } catch (e) {
    return escrowFailure(e);
  }

  const otherId = deal.userId === user.id ? deal.lot?.ownerId : deal.userId;
  const title = (deal.lot?.title || '').split(',')[0];
  const news = [];
  if (otherId) {
    news.push({
      userId: otherId,
      type: 'dispute',
      title: `${user.name} открыл(а) спор по обмену`,
      body: note ? `«${title}»: ${note}` : `«${title}» — сделка заморожена до решения.`,
      entityType: 'deal',
      entityId: deal.id,
    });
  }
  // Администраторам — чтобы спор не ждал, пока кто-то случайно заглянет.
  const admins = ADMIN_EMAILS.length
    ? await prisma.user.findMany({ where: { email: { in: ADMIN_EMAILS } }, select: { id: true } })
    : [];
  for (const a of admins) {
    if (a.id === user.id || a.id === otherId) continue;
    news.push({
      userId: a.id,
      type: 'dispute',
      title: 'Новый спор по сделке',
      body: `${user.name} · «${title}» · ${deal.credits} Б в эскроу`,
      entityType: 'deal',
      entityId: deal.id,
    });
  }
  await notify(news);

  const updated = await prisma.deal.findUnique({ where: { id: deal.id }, include: dealWith() });
  return { ok: true, deal: await serializeDeal(updated, user.id) };
}

export async function listDisputesAction() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { admin: false, items: [] };
  const deals = await prisma.deal.findMany({
    where: { disputedAt: { not: null }, status: 'active' },
    include: dealWith(),
    orderBy: { disputedAt: 'asc' },
  });
  const items = await Promise.all(deals.map(async (d) => {
    const by = d.disputeById
      ? await prisma.user.findUnique({ where: { id: d.disputeById }, select: { name: true } })
      : null;
    return {
      id: d.id,
      title: d.lot?.title || '',
      credits: d.credits,
      note: d.disputeNote,
      openedBy: by?.name || '',
      openedAt: d.disputedAt?.toISOString() || null,
      initiator: d.user?.name || '',
      owner: d.lot?.owner?.name || '',
      myLot: d.myLot?.title || '',
    };
  }));
  return { admin: true, items };
}

/**
 * Решение по спору. 'refund' — вернуть доплату инициатору и закрыть сделку,
 * 'release' — считать обмен состоявшимся и отдать баллы владельцу лота.
 */
export async function resolveDisputeAction(dealId, outcome) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, error: 'Недостаточно прав' };
  if (outcome !== 'refund' && outcome !== 'release') return { ok: false, error: 'Неизвестное решение' };

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWith() });
  if (!deal || !deal.disputedAt) return { ok: false, error: 'Спор не найден' };

  const title = (deal.lot?.title || '').split(',')[0];

  // Модерация ходит тем же доменным путём, что и участники: отдельной
  // дороги к деньгам у администратора нет.
  try {
    await resolveDealDispute(prisma, { dealId: deal.id, outcome, actorId: user.id });
  } catch (e) {
    return escrowFailure(e);
  }

  const both = [deal.userId, deal.lot?.ownerId].filter(Boolean);
  await notify(both.map(userId => ({
    userId,
    type: 'dispute_resolved',
    title: outcome === 'refund' ? 'Спор решён: баллы возвращены' : 'Спор решён: обмен засчитан',
    body: outcome === 'refund'
      ? `«${title}» — сделка отменена, ${deal.credits} Б вернулись отправителю.`
      : `«${title}» — эскроу разморожен в пользу владельца объявления.`,
    entityType: 'deal',
    entityId: deal.id,
  })));

  return { ok: true };
}

// ---------- сброс пароля ----------
//
// Почтового сервера у сервиса нет, поэтому классического «письма со ссылкой»
// не будет. Человек оставляет заявку, администратор видит её в админке и
// выдаёт временный пароль — передать его можно тем каналом, по которому
// они и так общаются. Взамен письма это даёт то же самое: доступ к аккаунту
// не теряется навсегда из-за забытого пароля.

const RESET_RATE = { max: 3, windowMs: 60 * 60 * 1000 };
const TEMP_PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function tempPassword(len = 10) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  return out;
}

export async function requestPasswordResetAction(email) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || !mail.includes('@')) return { ok: false, error: 'Укажите почту, на которую регистрировались' };

  const gate = rateLimit.hit(`reset:${mail}`, RESET_RATE);
  if (!gate.ok) return { ok: false, error: 'Слишком много попыток — попробуйте позже' };

  const user = await prisma.user.findUnique({ where: { email: mail }, select: { id: true, name: true } });
  // Заявку создаём только на существующий аккаунт, но наружу об этом не
  // сообщаем: ответ одинаковый в обоих случаях, иначе форма превращается
  // в способ проверять, кто здесь зарегистрирован.
  if (user) {
    const open = await prisma.passwordReset.findFirst({ where: { email: mail, status: 'open' } });
    if (!open) {
      await prisma.passwordReset.create({ data: { email: mail, userId: user.id } });
      const admins = ADMIN_EMAILS.length
        ? await prisma.user.findMany({ where: { email: { in: ADMIN_EMAILS } }, select: { id: true } })
        : [];
      await notify(admins.map(a => ({
        userId: a.id,
        type: 'reset_request',
        title: 'Заявка на сброс пароля',
        body: `${user.name} · ${mail}`,
        entityType: '',
        entityId: '',
      })));
    }
  }
  return { ok: true };
}

export async function listResetRequestsAction() {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { admin: false, items: [] };
  const rows = await prisma.passwordReset.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  const items = await Promise.all(rows.map(async (r) => {
    const u = r.userId
      ? await prisma.user.findUnique({ where: { id: r.userId }, select: { name: true, phone: true, city: true } })
      : null;
    return {
      id: r.id,
      email: r.email,
      name: u?.name || '',
      phone: u?.phone || '',
      city: u?.city || '',
      createdAt: r.createdAt.toISOString(),
    };
  }));
  return { admin: true, items };
}

/**
 * Выдаёт временный пароль по заявке. Пароль показывается администратору
 * один раз — в базе лежит только хеш, посмотреть его потом нельзя.
 */
export async function issueTempPasswordAction(requestId) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };

  const req = await prisma.passwordReset.findUnique({ where: { id: String(requestId || '') } });
  if (!req || req.status !== 'open') return { ok: false, error: 'Заявка не найдена' };
  if (!req.userId) return { ok: false, error: 'Аккаунт не найден' };

  const password = tempPassword();
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordReset.update({ where: { id: req.id }, data: { status: 'done', handledAt: new Date() } }),
  ]);
  console.log(`[reset] ${admin.email} выдал временный пароль для ${req.email}`);

  // Человек узнает об этом, когда войдёт: уведомление ждёт его внутри.
  await notify({
    userId: req.userId,
    type: 'system',
    title: 'Пароль сброшен',
    body: 'Вам выдали временный пароль. Смените его в настройках: Профиль → Настройки → Сменить пароль.',
    entityType: 'profile',
    entityId: '',
  });

  return { ok: true, password, email: req.email };
}

export async function dismissResetRequestAction(requestId) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };
  await prisma.passwordReset.updateMany({
    where: { id: String(requestId || ''), status: 'open' },
    data: { status: 'rejected', handledAt: new Date() },
  });
  return { ok: true };
}

// ---------- модерация ----------
//
// Постмодерация по жалобам: премодерацию не включаем, пока не случится
// первый инцидент — при полусотне объявлений в сутки она съедает больше,
// чем спасает.
//
// Блокировка мягкая: человек входит и дописывает начатое в переписке, но
// его объявления уходят из ленты, новые он не разместит и сделок не
// откроет. Активные сделки заблокированного уходят в спор — там чужие
// замороженные баллы, и бросать их нельзя.

const REPORT_RATE = { max: 10, windowMs: 60 * 60 * 1000 };
const MAX_REPORT_TEXT = 600;

export async function reportLotAction(lotId, reason, text) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const lot = await prisma.lot.findUnique({ where: { id: String(lotId || '') }, select: { id: true, ownerId: true, title: true } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  const gate = rateLimit.hit(`report:${user.id}`, REPORT_RATE);
  if (!gate.ok) return { ok: false, error: 'Слишком много жалоб подряд — попробуйте позже' };

  const known = REPORT_REASONS.some(r => r.id === reason);
  const already = await prisma.report.findFirst({ where: { lotId: lot.id, authorId: user.id, status: 'open' } });
  if (already) return { ok: true, duplicate: true };

  await prisma.report.create({
    data: {
      lotId: lot.id,
      authorId: user.id,
      reason: known ? reason : 'other',
      text: String(text || '').trim().slice(0, MAX_REPORT_TEXT),
    },
  });

  const admins = ADMIN_EMAILS.length
    ? await prisma.user.findMany({ where: { email: { in: ADMIN_EMAILS } }, select: { id: true } })
    : [];
  await notify(admins.map(a => ({
    userId: a.id,
    type: 'report',
    title: 'Жалоба на объявление',
    body: `«${lot.title}» · ${reasonLabel(reason)}`,
    entityType: 'lot',
    entityId: lot.id,
  })));

  return { ok: true };
}

export async function listReportsAction() {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { admin: false, items: [] };

  const rows = await prisma.report.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      author: { select: { name: true } },
      lot: {
        select: {
          id: true, title: true, desc: true, value: true, status: true, photoUrl: true, cat: true,
          owner: { select: { id: true, name: true, status: true, email: true } },
        },
      },
    },
  });

  // Несколько жалоб на один лот — это одна задача, а не пять.
  const byLot = new Map();
  for (const r of rows) {
    if (!r.lot) continue;
    const item = byLot.get(r.lotId) || {
      lotId: r.lotId,
      title: r.lot.title,
      desc: r.lot.desc,
      value: r.lot.value,
      cat: r.lot.cat,
      photoUrl: r.lot.photoUrl || '',
      lotStatus: r.lot.status,
      ownerId: r.lot.owner?.id || '',
      ownerName: r.lot.owner?.name || '',
      ownerBlocked: r.lot.owner?.status === 'blocked',
      reports: [],
    };
    item.reports.push({
      id: r.id,
      reason: reasonLabel(r.reason),
      text: r.text,
      author: r.author?.name || 'аноним',
      at: r.createdAt.toISOString(),
    });
    byLot.set(r.lotId, item);
  }
  return { admin: true, items: [...byLot.values()] };
}

// Закрывает все открытые жалобы по лоту: решение принимается разом.
async function closeReports(lotId) {
  await prisma.report.updateMany({
    where: { lotId, status: 'open' },
    data: { status: 'done', handledAt: new Date() },
  });
}

export async function hideLotAction(lotId, reason) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };

  const lot = await prisma.lot.findUnique({ where: { id: String(lotId || '') }, select: { id: true, ownerId: true, title: true } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };

  await prisma.lot.update({
    where: { id: lot.id },
    data: { status: 'hidden', hiddenReason: String(reason || '').slice(0, 300) },
  });
  await closeReports(lot.id);

  await notify({
    userId: lot.ownerId,
    type: 'moderation',
    title: 'Объявление скрыто модератором',
    body: `«${lot.title}»${reason ? ` — ${reason}` : ''}. Исправьте его и напишите нам, чтобы вернуть в ленту.`,
    entityType: 'profile',
    entityId: '',
  });
  console.log(`[moderation] ${admin.email} скрыл лот ${lot.id}: ${reason}`);
  return { ok: true };
}

export async function unhideLotAction(lotId) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };
  const lot = await prisma.lot.findUnique({ where: { id: String(lotId || '') }, select: { id: true, ownerId: true, title: true, status: true } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.status !== 'hidden') return { ok: false, error: 'Объявление не скрыто' };

  await prisma.lot.update({ where: { id: lot.id }, data: { status: 'active', hiddenReason: '' } });
  await closeReports(lot.id);
  await notify({
    userId: lot.ownerId,
    type: 'moderation',
    title: 'Объявление вернулось в ленту',
    body: `«${lot.title}» снова видно всем.`,
    entityType: 'profile',
    entityId: '',
  });
  return { ok: true };
}

export async function dismissReportsAction(lotId) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };
  await closeReports(String(lotId || ''));
  return { ok: true };
}

/**
 * Мягкая блокировка: объявления уходят из ленты, новые размещать нельзя,
 * сделки открывать нельзя. Вход и переписка остаются — иначе человек не
 * сможет закрыть начатое. Активные сделки уходят в спор.
 */
export async function blockUserAction(userId, reason) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };

  const target = await prisma.user.findUnique({ where: { id: String(userId || '') }, select: { id: true, name: true, email: true, status: true } });
  if (!target) return { ok: false, error: 'Пользователь не найден' };
  if (isAdmin(target)) return { ok: false, error: 'Нельзя заблокировать администратора' };
  if (target.status === 'blocked') return { ok: false, error: 'Уже заблокирован' };

  const note = String(reason || '').slice(0, 300);
  await prisma.user.update({
    where: { id: target.id },
    data: { status: 'blocked', blockReason: note, blockedAt: new Date() },
  });
  // Объявления прячем скопом, но авторский архив не трогаем.
  await prisma.lot.updateMany({
    where: { ownerId: target.id, status: { in: ['active', 'in_chain'] } },
    data: { status: 'hidden', hiddenReason: 'Аккаунт заблокирован' },
  });

  // Активные сделки — в спор: там чужие замороженные баллы.
  const deals = await prisma.deal.findMany({
    where: { status: 'active', disputedAt: null, OR: [{ userId: target.id }, { lot: { is: { ownerId: target.id } } }] },
    include: dealWith(),
  });
  for (const d of deals) {
    await prisma.deal.updateMany({
      where: { id: d.id, status: 'active', disputedAt: null },
      data: { disputedAt: new Date(), disputeById: admin.id, disputeNote: `Аккаунт участника заблокирован: ${note || 'без пояснения'}` },
    });
    const otherId = d.userId === target.id ? d.lot?.ownerId : d.userId;
    if (otherId) {
      await notify({
        userId: otherId,
        type: 'dispute',
        title: 'Сделка приостановлена',
        body: `Аккаунт второй стороны заблокирован. «${(d.lot?.title || '').split(',')[0]}» — баллы заморожены до решения.`,
        entityType: 'deal',
        entityId: d.id,
      });
    }
  }

  await notify({
    userId: target.id,
    type: 'moderation',
    title: 'Аккаунт заблокирован',
    body: `${note || 'Нарушение правил сервиса'}. Объявления скрыты, новые размещать нельзя. Напишите нам, если считаете это ошибкой.`,
    entityType: 'profile',
    entityId: '',
  });
  console.log(`[moderation] ${admin.email} заблокировал ${target.email}: ${note} (сделок в спор: ${deals.length})`);
  return { ok: true, disputes: deals.length };
}

export async function unblockUserAction(userId) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return { ok: false, error: 'Недостаточно прав' };
  const target = await prisma.user.findUnique({ where: { id: String(userId || '') }, select: { id: true, status: true } });
  if (!target || target.status !== 'blocked') return { ok: false, error: 'Пользователь не заблокирован' };

  await prisma.user.update({ where: { id: target.id }, data: { status: 'active', blockReason: '', blockedAt: null } });
  // Возвращаем только то, что спрятала сама блокировка.
  await prisma.lot.updateMany({
    where: { ownerId: target.id, status: 'hidden', hiddenReason: 'Аккаунт заблокирован' },
    data: { status: 'active', hiddenReason: '' },
  });
  await notify({
    userId: target.id,
    type: 'moderation',
    title: 'Блокировка снята',
    body: 'Ваши объявления снова в ленте.',
    entityType: 'profile',
    entityId: '',
  });
  return { ok: true };
}

