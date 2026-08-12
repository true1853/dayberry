// scripts/backup-snapshot.mjs — консистентный снимок базы для бэкапа.
//
// Просто скопировать dayberry.db нельзя: база живёт в режиме WAL, и часть
// свежих записей в этот момент лежит в отдельном -wal файле. Копия без него
// окажется старше, чем кажется, а копия «на ходу» — битой.
//
// VACUUM INTO делает то, что нужно: собирает целостный файл со всеми
// данными на момент запуска, не останавливая приложение и не трогая
// оригинал. Вызывается из ночного крона на сервере.
import { PrismaClient } from '@prisma/client';

const target = process.argv[2] || '/tmp/dayberry-backup.db';
if (target.includes("'")) {
  console.error('недопустимый путь');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target}'`);
  console.log(`снимок: ${target}`);
  process.exit(0);
} catch (e) {
  console.error('снимок не удался:', e.message);
  process.exit(1);
}
