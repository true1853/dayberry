import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
console.log((await p.lot.findMany({ select: { title: true, views: true } })).map(l => `${l.title}: ${l.views}`));
await p.$disconnect();
