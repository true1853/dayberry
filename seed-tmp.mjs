import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { saveImage } from './lib/storage.js';
const p = new PrismaClient();
const o = await p.user.create({ data: { name: 'Аня Владелец', email: 'o@v.local', passwordHash: 'x', city: 'Ковров', wants: 'ноутбук, велосипед, услуги дизайна' } });
const items = [['Гитара Yamaha','hobby',8000,3],['Робот-пылесос Dreame','tech',18000,90],['Санки детские','kids',2500,1440]];
for (let i = 0; i < items.length; i++) {
  const [title, cat, value, minsAgo] = items[i];
  const buf = await sharp({ create: { width: 600, height: 450, channels: 3, background: { r: 80+i*40, g: 150, b: 190-i*30 } } }).jpeg().toBuffer();
  const url = await saveImage(buf);
  const l = await p.lot.create({ data: { ownerId: o.id, cat, title, wants: 'что угодно', desc: 'тест', value,
    aiLow: Math.round(value*0.92), aiHigh: Math.round(value*1.08), photo: 'ВЕЩЬ', photoUrl: url,
    condition: 'Хорошее', sortOrder: i, views: 0,
    createdAt: new Date(Date.now() - minsAgo*60000) } });
  await p.lotPhoto.create({ data: { lotId: l.id, url, order: 0 } });
}
console.log('готово');
await p.$disconnect();
