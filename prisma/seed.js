// prisma/seed.js — seed demo users + lots from the prototype's data.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { LOTS, U, ME } from '../src/data.js';

const prisma = new PrismaClient();

async function main() {
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

  console.log(`Seeded ${Object.keys(users).length + 1} users, ${LOTS.length} lots`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
