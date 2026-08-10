// prisma/seed.js — seed demo users + lots + deals + chat + chains + wallet tx
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { LOTS, U, ME, MATCHES, CHAIN, WALLET, CHAT_MSGS, CHATLIST } from '../src/data.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.chainStep.deleteMany();
  await prisma.chain.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.review.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.user.deleteMany();

  const users = {};
  for (const [key, u] of Object.entries(U)) {
    users[key] = await prisma.user.create({
      data: {
        name: u.name,
        email: `${key}@dayberry.demo`,
        passwordHash: await bcrypt.hash('demo12345', 10),
        city: u.city,
        bio: 'Меняюсь по-честному: вещи, техника, услуги.',
        rating: u.rating,
        dealsCount: u.deals,
        balance: 60000,
      },
    });
  }

  const me = await prisma.user.create({
    data: {
      name: ME.name,
      email: 'demo@dayberry.app',
      passwordHash: await bcrypt.hash('demo12345', 10),
      city: ME.city,
      phone: ME.phone,
      bio: 'Меняю технику, книги и вещи. Обмен в Москве или по договорённости.',
      wants: ME.wants,
      rating: ME.rating,
      dealsCount: ME.deals,
      balance: WALLET.balance,
    },
  });

  const lotRows = [];
  for (let i = 0; i < LOTS.length; i++) {
    const L = LOTS[i];
    const owner = users[L.owner];
    const lot = await prisma.lot.create({
      data: {
        ownerId: owner ? owner.id : me.id,
        ownerKey: L.owner,
        kind: L.cat === 'digital' ? 'service' : 'item',
        cat: L.cat,
        title: L.title,
        desc: L.desc,
        wants: L.wants,
        value: L.value,
        aiLow: L.aiLow,
        aiHigh: L.aiHigh,
        condition: L.condition,
        photo: L.photo,
        photoUrl: L.photoUrl || '',
        views: L.views || 0,
        hot: !!L.hot,
        posted: L.posted,
        sortOrder: i + 1,
      },
    });
    lotRows.push(lot);
  }
  const lotByTitle = {};
  lotRows.forEach(l => { lotByTitle[l.title] = l; });
  const findLot = (title) => lotByTitle[title] || lotRows[0];

  const reviews = [
    { author: 'kirill', rating: 5, text: 'Отдал PS5 за Apple Watch и 10 000 Б — всё сошлось за один день.' },
    { author: 'dasha',  rating: 5, text: 'Обменяли лендинг на технику. По делу, без воды.' },
    { author: 'marina', rating: 4, text: 'Вещи как на фото, договорились быстро. Чуть задержалась с передачей.' },
    { author: 'lena',   rating: 5, text: 'Встретились у метро, обмен прошёл гладко.' },
  ];
  for (const r of reviews) {
    const author = users[r.author];
    if (!author) continue;
    await prisma.review.create({
      data: {
        authorId: author.id,
        targetId: me.id,
        rating: r.rating,
        text: r.text,
      },
    });
  }

  // ---- wallet transactions ----
  for (const t of WALLET.tx) {
    await prisma.transaction.create({
      data: {
        userId: me.id,
        kind: t.kind,
        title: t.title,
        sub: t.sub,
        amt: t.amt,
        status: t.status,
      },
    });
  }

  // ---- deals ----
  // deal 1: active — PS5 (kirill) ↔ my Apple Watch, 10000 Б escrow
  const deal1 = await prisma.deal.create({
    data: {
      userId: me.id,
      lotId: findLot('PlayStation 5 Slim + 2 геймпада').id,
      credits: 10000,
      stage: 'meet',
      status: 'active',
    },
  });

  // chat for deal1
  const chat1 = await prisma.chat.create({
    data: {
      userId: me.id,
      partnerId: users.kirill.id,
      dealId: deal1.id,
      messages: {
        create: CHAT_MSGS.map(m => ({
          fromId: m.from === 'sys' ? null : (m.from === 'me' ? me.id : users.kirill.id),
          text: m.text,
        })),
      },
    },
  });

  // deal 2: done — лендинг (studio)
  const deal2 = await prisma.deal.create({
    data: {
      userId: me.id,
      lotId: findLot('Лендинг под ключ + анимации').id,
      credits: 22000,
      stage: 'done',
      status: 'done',
    },
  });
  await prisma.chat.create({
    data: {
      userId: me.id,
      partnerId: users.studio.id,
      dealId: deal2.id,
      messages: {
        create: [
          { fromId: users.studio.id, text: 'Привет! Портфолио внутри, делаю за 5–7 дней.', createdAt: new Date(Date.now() - 86400000 * 2) },
          { fromId: me.id, text: 'Скиньте превью первого экрана, ок?', createdAt: new Date(Date.now() - 86400000 * 1) },
          { fromId: users.studio.id, text: 'Скинул(а) превью первого экрана', createdAt: new Date(Date.now() - 3600000 * 2) },
        ],
      },
    },
  });

  // chat 3: chain discussion (dasha)
  await prisma.chat.create({
    data: {
      userId: me.id,
      partnerId: users.dasha.id,
      messages: {
        create: [
          { fromId: users.dasha.id, text: 'А цепочка из трёх — это надёжно?', createdAt: new Date(Date.now() - 86400000 * 3) },
          { fromId: me.id, text: 'Да, эскроу защищает каждый шаг', createdAt: new Date(Date.now() - 86400000 * 3 + 3600000) },
        ],
      },
    },
  });

  // ---- chains ----
  const chain1 = await prisma.chain.create({
    data: {
      score: 94,
      note: 'Каждый получает желаемое. Разницу в стоимости система выравнивает баллами через эскроу.',
      steps: {
        create: CHAIN.steps.map((s, i) => ({
          who: s.who, gives: s.gives, photoUrl: s.photoUrl, to: s.to, value: s.value, order: i,
        })),
      },
    },
  });
  const chain2 = await prisma.chain.create({
    data: {
      score: 88,
      note: 'Короткая цепочка из 3 участников. Доплата минимальна.',
      steps: {
        create: [
          { who: 'me',     gives: 'Apple Watch S9', photoUrl: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=400&q=80', to: 'oleg',   value: 38000, order: 0 },
          { who: 'oleg',   gives: 'Велосипед Trek', photoUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80', to: 'marina', value: 41000, order: 1 },
          { who: 'marina', gives: '5 фотосессий',   photoUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&q=80', to: 'me',     value: 35000, order: 2 },
        ],
      },
    },
  });
  const chain3 = await prisma.chain.create({
    data: {
      score: 82,
      note: 'Цепочка из 4 участников — система нашла редкое совпадение.',
      steps: {
        create: [
          { who: 'me',     gives: 'Apple Watch S9',    photoUrl: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=400&q=80', to: 'roma',  value: 38000, order: 0 },
          { who: 'roma',   gives: 'iPhone 14',         photoUrl: 'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=400&q=80', to: 'dasha', value: 54000, order: 1 },
          { who: 'dasha',  gives: 'Куртка St. Island', photoUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&q=80', to: 'lena',  value: 22000, order: 2 },
          { who: 'lena',   gives: 'Сет настолок',      photoUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=400&q=80', to: 'me',    value: 8000,  order: 3 },
        ],
      },
    },
  });

  console.log(`Seeded ${Object.keys(users).length + 1} users, ${lotRows.length} lots, ${reviews.length} reviews, 2 deals, 3 chats, ${WALLET.tx.length} tx, 3 chains`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
