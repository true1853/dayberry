// prisma/seed.js — seed demo users + lots from the prototype's data.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { LOTS, U, ME } from '../src/data.js';

const prisma = new PrismaClient();

async function main() {
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
      bio: 'Меняю технику, книги и вещи. Обмен в Москве или по договорённости.',
      rating: ME.rating,
      dealsCount: ME.deals,
      balance: 38000,
    },
  });

  for (let i = 0; i < LOTS.length; i++) {
    const L = LOTS[i];
    const owner = users[L.owner];
    await prisma.lot.create({
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
  }

  const reviews = [
    { author: 'kirill', rating: 5, text: 'Отличный обмен, всё честно и быстро. Рекомендую!' },
    { author: 'dasha',  rating: 5, text: 'Приятно иметь дело, вещи точно как на фото.' },
    { author: 'marina', rating: 4, text: 'Всё хорошо, немного задержалась с передачей.' },
    { author: 'lena',   rating: 5, text: 'Быстрая встреча, договорились за один день.' },
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

  console.log(`Seeded ${Object.keys(users).length + 1} users, ${LOTS.length} lots, ${reviews.length} reviews`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
