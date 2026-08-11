'use server';

import { prisma } from '../../lib/prisma';
import { analyzeListing, computeMatches } from '../../lib/ai';
import { vkAuthStart, yandexAuthStart } from '../../lib/oauth';
import { cookies } from 'next/headers';
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
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, dealsCount: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function getMyLots() {
  const user = await getCurrentUser();
  if (!user) return [];
  const lots = await prisma.lot.findMany({
    where: { ownerId: user.id, status: 'active' },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, dealsCount: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return lots.map(l => mapLot(l, l.owner?.city || ''));
}

export async function createLotAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { title, cat, value, aiLow, aiHigh, photo, photoUrl, wants, desc, kind, condition, valuationSource } = input || {};
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
      valuationSource: valuationSource === 'ai' ? 'ai' : 'manual',
      photo: photo || '',
      photoUrl: photoUrl || '',
      wants: wants.trim(),
      desc: desc || '',
      condition: condition || (kind === 'service' ? 'Услуга' : 'Новое или Б/У'),
      posted: 'только что',
      sortOrder: 0,
    },
  });
  const withOwner = await prisma.lot.findUnique({
    where: { id: lot.id },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, dealsCount: true } } },
  });
  return { ok: true, lot: mapLot(withOwner || lot, user.city) };
}

export async function updateLotAction(lotId, input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.ownerId !== user.id) return { ok: false, error: 'Это не ваше объявление' };

  const { title, cat, value, aiLow, aiHigh, wants, desc, condition, valuationSource } = input || {};
  if (!title || !title.trim()) return { ok: false, error: 'Введите название' };
  if (!value || value <= 0) return { ok: false, error: 'Укажите оценку в баллах' };
  if (!wants || !wants.trim()) return { ok: false, error: 'Укажите, на что хотите обменять' };

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
    },
  });
  const withOwner = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { owner: { select: { city: true, name: true, avatar: true, rating: true, dealsCount: true } } },
  });
  return { ok: true, lot: mapLot(withOwner || updated, user.city) };
}

// ---------- deals ----------

const DEAL_STAGE_ORDER = ['created', 'meet', 'confirm', 'done'];

function dealWith() {
  return {
    lot: { include: { owner: { select: { name: true, city: true } } } },
    myLot: true,
  };
}

async function serializeDeal(d) {
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
  };
}

export async function createDealAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const { lotId, credits, myLotId } = input || {};
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot || lot.status !== 'active') return { ok: false, error: 'Объявление недоступно' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  const num = Math.max(0, Math.round(Number(credits) || 0));
  const deal = await prisma.deal.create({
    data: {
      userId: user.id,
      lotId: lot.id,
      myLotId: myLotId || null,
      credits: num,
      stage: 'created',
      status: 'active',
    },
  });

  if (num > 0) {
    await prisma.transaction.create({
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

  // chat with the lot owner
  const chat = await prisma.chat.create({
    data: {
      userId: user.id,
      partnerId: lot.ownerId,
      dealId: deal.id,
    },
  });
  await prisma.message.create({
    data: { chatId: chat.id, text: `Открыл(а) сделку на «${lot.title}» — ${num} Б в эскроу.` },
  });

  return { ok: true, deal: await serializeDeal(await prisma.deal.findUnique({ where: { id: deal.id }, include: dealWith() })), chatId: chat.id };
}

export async function listDealsAction() {
  const user = await getCurrentUser();
  if (!user) return [];
  const deals = await prisma.deal.findMany({
    where: { userId: user.id },
    include: dealWith(),
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(deals.map(serializeDeal));
}

export async function confirmReceiptAction(dealId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealWith() });
  if (!deal || deal.userId !== user.id) return { ok: false, error: 'Сделка не найдена' };
  if (deal.stage === 'done') return { ok: false, error: 'Сделка уже завершена' };

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data: { stage: 'done', status: 'done' },
    include: dealWith(),
  });

  // release escrow -> earn for the lot owner, spend for me
  const held = await prisma.transaction.findFirst({
    where: { userId: user.id, kind: 'escrow-in', status: 'held' },
    orderBy: { createdAt: 'desc' },
  });
  if (held) {
    await prisma.transaction.update({ where: { id: held.id }, data: { status: 'done' } });
  }
  if (updated.credits > 0) {
    await prisma.transaction.create({
      data: {
        userId: updated.lot.ownerId,
        kind: 'earn',
        title: `Обмен: «${updated.lot.title.split(',')[0]}»`,
        sub: 'Переведено из эскроу',
        amt: updated.credits,
        status: 'done',
      },
    });
  }
  await prisma.user.update({ where: { id: updated.lot.ownerId }, data: { balance: { increment: updated.credits }, dealsCount: { increment: 1 } } });
  await prisma.user.update({ where: { id: user.id }, data: { dealsCount: { increment: 1 } } });

  return { ok: true, deal: await serializeDeal(updated) };
}

// ---------- wallet ----------

export async function getWalletAction() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [txs, heldSum, delta] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
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

const chatWith = {
  partner: { select: { id: true, name: true, city: true, avatar: true } },
  deal: { select: { id: true, stage: true, credits: true, status: true, lot: { include: { owner: { select: { name: true } } } } } },
  messages: { orderBy: { createdAt: 'asc' } },
};

async function serializeChat(c) {
  return {
    id: c.id,
    partner: {
      id: c.partner?.id || '',
      name: c.partner?.name || '',
      city: c.partner?.city || '',
      avatar: c.partner?.avatar || '',
    },
    deal: c.deal ? {
      id: c.deal.id,
      stage: c.deal.stage,
      credits: c.deal.credits,
      status: c.deal.status,
      title: c.deal.lot?.title || '',
    } : null,
    messages: c.messages.map(m => ({
      id: m.id,
      from: m.fromId ? 'them' : 'sys',
      me: m.fromId ? (m.fromId === c.userId) : false,
      text: m.text,
      t: m.createdAt.toISOString(),
    })),
    createdAt: c.createdAt.toISOString(),
  };
}

export async function listChatsAction() {
  const user = await getCurrentUser();
  if (!user) return [];
  const chats = await prisma.chat.findMany({
    where: { userId: user.id },
    include: chatWith,
    orderBy: { createdAt: 'desc' },
  });
  return Promise.all(chats.map(serializeChat));
}

export async function startChatAction(lotId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };

  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return { ok: false, error: 'Объявление не найдено' };
  if (lot.ownerId === user.id) return { ok: false, error: 'Это ваше объявление' };

  let chat = await prisma.chat.findFirst({
    where: { userId: user.id, partnerId: lot.ownerId },
    include: chatWith,
  });
  if (!chat) {
    chat = await prisma.chat.create({
      data: { userId: user.id, partnerId: lot.ownerId },
      include: chatWith,
    });
  }
  return { ok: true, chat: await serializeChat(chat) };
}

export async function getChatAction(chatId) {
  const user = await getCurrentUser();
  if (!user) return null;
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId: user.id },
    include: chatWith,
  });
  return chat ? serializeChat(chat) : null;
}

export async function sendMessageAction(chatId, text) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const msg = (text || '').trim();
  if (!msg) return { ok: false, error: 'Пустое сообщение' };
  const chat = await prisma.chat.findFirst({ where: { id: chatId, userId: user.id } });
  if (!chat) return { ok: false, error: 'Чат не найден' };
  const saved = await prisma.message.create({
    data: { chatId: chat.id, fromId: user.id, text: msg },
  });
  return { ok: true, message: { id: saved.id, me: true, from: 'them', text: msg, t: saved.createdAt.toISOString() } };
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
  const chains = await prisma.chain.findMany({ where: { status: 'active' }, include: chainWith, orderBy: { score: 'desc' } });
  return chains.map(serializeChain);
}

export async function joinChainAction(chainId) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  const chain = await prisma.chain.findUnique({ where: { id: chainId }, include: chainWith });
  if (!chain) return { ok: false, error: 'Цепочка не найдена' };
  const last = chain.steps[chain.steps.length - 1];
  const myStep = chain.steps.find(s => s.who === 'me');
  const credits = Math.max(0, last.value - (myStep ? myStep.value : 0));

  // pick the lot I receive from the last step (best-effort by title, else first active)
  const received = await prisma.lot.findFirst({
    where: { status: 'active', title: { contains: last.gives.split(' ')[0] } },
    orderBy: { sortOrder: 'asc' },
  });
  const target = received || await prisma.lot.findFirst({ where: { status: 'active', ownerId: { not: user.id } }, orderBy: { sortOrder: 'asc' } });

  const deal = await prisma.deal.create({
    data: { userId: user.id, lotId: target ? target.id : '', credits, stage: 'created', status: 'active' },
  });
  if (target) {
    const chat = await prisma.chat.create({
      data: { userId: user.id, partnerId: target.ownerId, dealId: deal.id },
    });
    await prisma.message.create({
      data: { chatId: chat.id, text: `Вступил(а) в цепочку «${chain.note}» — ${credits} Б в эскроу.` },
    });
  }
  return { ok: true, dealId: deal.id };
}

// ---------- OAuth (Yandex ID / VK ID) ----------

export async function getOAuthUrlAction(provider) {
  const c = await cookies();
  if (provider === 'vk') {
    const r = vkAuthStart();
    if (!r) return { ok: false, error: 'OAuth VK не настроен — добавьте ключи в .env' };
    c.set('vk_oauth', JSON.stringify({ state: r.state, verifier: r.codeVerifier }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600,
      path: '/',
    });
    return { ok: true, url: r.url };
  }
  if (provider === 'yandex') {
    const r = yandexAuthStart();
    if (!r) return { ok: false, error: 'OAuth Яндекса не настроен — добавьте ключи в .env' };
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
  const lots = await prisma.lot.findMany({
    where: { status: 'active' },
    include: { owner: { select: { name: true, city: true, avatar: true, rating: true, dealsCount: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  const myLots = user ? lots.filter(l => l.ownerId === user.id) : [];
  const others = lots.filter(l => !user || l.ownerId !== user.id);

  const matches = await computeMatches({ myLots, others, myWants: user?.wants || '' });
  return matches.map((m, i) => ({
    id: `m-${i}-${m.lot.id}`,
    lot: m.lot.id,
    score: m.score,
    why: m.why,
    topup: m.topup,
    dir: m.dir,
  }));
}
