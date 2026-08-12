// Миграция под цепочки и групповые чаты.
//
// Порядок:
//   1) npx prisma db push --accept-data-loss   — Chain/ChainStep пересоздаются
//      (старые строки были витриной со строковыми именами вместо связей),
//      Chat.userId/partnerId становятся необязательными, появляются
//      ChatMember и Notification;
//   2) node scripts/migrate-chains.mjs         — этот скрипт.
//
// Скрипт заполняет ChatMember для уже существующих парных чатов: состав
// участников теперь единый для direct и chain, и без бэкфилла старые
// переписки пропали бы из списка. Идемпотентен — можно гонять повторно.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const chats = await prisma.chat.findMany({
    select: { id: true, userId: true, partnerId: true },
  });

  let created = 0;
  for (const chat of chats) {
    const ids = [chat.userId, chat.partnerId].filter(Boolean);
    for (const userId of new Set(ids)) {
      // createMany({ skipDuplicates }) коннектор SQLite не поддерживает —
      // вызов падал, и контейнер не доходил до старта сервера.
      // upsert по @@unique([chatId, userId]) даёт ту же идемпотентность.
      const before = await prisma.chatMember.count({ where: { chatId: chat.id, userId } });
      if (before) continue;
      try {
        await prisma.chatMember.create({ data: { chatId: chat.id, userId } });
        created++;
      } catch (e) {
        if (e.code !== 'P2002') throw e;   // гонка — участник уже добавлен
      }
    }
  }

  console.log(`chats: ${chats.length}, chat members created: ${created}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
