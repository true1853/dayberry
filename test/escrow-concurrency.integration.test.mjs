// Гонки терминальных команд.
//
// Два независимых клиента Prisma к одной базе стартуют команды на барьере.
// Проверяется не «кто выиграл», а то, что финансовый эффект случился ровно
// один раз: победитель может быть любым, а SQLITE_BUSY — законный проигрыш.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PrismaClient } from '@prisma/client';

import {
  cancelDealWithEscrow,
  confirmDealSide,
  createDealWithEscrow,
  openDealDispute,
  resolveDealDispute,
} from '../lib/deals/escrow.js';
import {
  createMigratedDatabase,
  createTempDir,
  databaseUrl,
  removeTempDir,
  seedParticipants,
  withClient,
} from './fixtures/escrow-db.mjs';

async function twoClientDatabase(t) {
  const dir = await createTempDir('escrow-race');
  const database = await createMigratedDatabase(dir);
  await seedParticipants(database, { buyerBalance: 200 });

  const clients = [
    new PrismaClient({ datasourceUrl: databaseUrl(database) }),
    new PrismaClient({ datasourceUrl: databaseUrl(database) }),
  ];
  t.after(async () => {
    await Promise.all(clients.map(client => client.$disconnect()));
    await removeTempDir(dir);
  });
  return { database, clients };
}

// Оба вызова уходят одновременно; результат — сколько из них дошло до конца.
async function race(first, second) {
  const settled = await Promise.allSettled([first(), second()]);
  return {
    fulfilled: settled.filter(entry => entry.status === 'fulfilled').map(entry => entry.value),
    rejected: settled.filter(entry => entry.status === 'rejected').map(entry => entry.reason),
  };
}

async function newDeal(prisma, { credits = 40, commandId }) {
  return createDealWithEscrow(prisma, {
    actorId: 'u-buyer', lotId: 'lot-a', credits, clientCommandId: commandId,
  });
}

async function financials(database) {
  return withClient(database, async (prisma) => ({
    deals: await prisma.$queryRawUnsafe('SELECT "id","status","stage","escrowTransactionId" FROM "Deal" ORDER BY "id"'),
    holds: await prisma.$queryRawUnsafe(`SELECT "id","status","businessKey" FROM "Transaction" WHERE "kind" = 'escrow-in' ORDER BY "id"`),
    earnings: await prisma.$queryRawUnsafe(`SELECT "id","userId","amt","businessKey" FROM "Transaction" WHERE "kind" = 'earn' ORDER BY "id"`),
    users: await prisma.$queryRawUnsafe('SELECT "id","balance","dealsCount" FROM "User" ORDER BY "id"'),
  }));
}

function balanceOf(users, id) {
  return users.find(user => user.id === id).balance;
}

test('duplicate create from two clients opens one deal and freezes credits once', async (t) => {
  const { database, clients } = await twoClientDatabase(t);

  const outcome = await race(
    () => newDeal(clients[0], { commandId: 'same-command' }),
    () => newDeal(clients[1], { commandId: 'same-command' }),
  );

  assert.ok(outcome.fulfilled.length >= 1, `no client succeeded: ${outcome.rejected.map(error => error.message).join('; ')}`);
  const dealIds = new Set(outcome.fulfilled.map(result => result.dealId));
  assert.equal(dealIds.size, 1, 'both clients must converge on one deal');

  const after = await financials(database);
  assert.equal(after.deals.length, 1);
  assert.equal(after.holds.length, 1);
  assert.equal(balanceOf(after.users, 'u-buyer'), 160, 'credits are frozen exactly once');
});

test('confirm versus confirm settles the deal once', async (t) => {
  const { database, clients } = await twoClientDatabase(t);
  const created = await newDeal(clients[0], { commandId: 'race-confirm' });
  await confirmDealSide(clients[0], { dealId: created.dealId, actorId: 'u-buyer' });

  // Обе стороны шлют своё подтверждение одновременно: у инициатора оно уже
  // стоит, поэтому вторая попытка обязана проиграть, а не заплатить снова.
  const outcome = await race(
    () => confirmDealSide(clients[0], { dealId: created.dealId, actorId: 'u-seller' }),
    () => confirmDealSide(clients[1], { dealId: created.dealId, actorId: 'u-seller' }),
  );
  assert.equal(outcome.fulfilled.filter(result => result.settled).length, 1, 'exactly one settlement');

  const after = await financials(database);
  assert.equal(after.deals[0].status, 'done');
  assert.equal(after.holds[0].status, 'done');
  assert.equal(after.earnings.length, 1, 'the owner is paid once');
  assert.equal(balanceOf(after.users, 'u-seller'), 40);
  assert.equal(after.users.find(user => user.id === 'u-seller').dealsCount, 1);
});

test('cancel versus complete produces one financial outcome', async (t) => {
  const { database, clients } = await twoClientDatabase(t);
  const created = await newDeal(clients[0], { commandId: 'race-cancel-complete' });
  await confirmDealSide(clients[0], { dealId: created.dealId, actorId: 'u-buyer' });

  const outcome = await race(
    () => confirmDealSide(clients[0], { dealId: created.dealId, actorId: 'u-seller' }),
    () => cancelDealWithEscrow(clients[1], { dealId: created.dealId, actorId: 'u-buyer' }),
  );
  assert.equal(outcome.fulfilled.length, 1, 'cancel and complete cannot both win');

  const after = await financials(database);
  const hold = after.holds[0];
  const buyer = balanceOf(after.users, 'u-buyer');
  const seller = balanceOf(after.users, 'u-seller');

  if (hold.status === 'done') {
    assert.equal(after.deals[0].status, 'done');
    assert.equal(seller, 40);
    assert.equal(buyer, 160);
    assert.equal(after.earnings.length, 1);
  } else {
    assert.equal(hold.status, 'refunded');
    assert.equal(after.deals[0].status, 'cancelled');
    assert.equal(seller, 0);
    assert.equal(buyer, 200, 'a refund returns exactly what was frozen');
    assert.equal(after.earnings.length, 0);
  }
});

test('dispute versus terminal command cannot both take effect', async (t) => {
  const { database, clients } = await twoClientDatabase(t);
  const created = await newDeal(clients[0], { commandId: 'race-dispute' });

  const outcome = await race(
    () => openDealDispute(clients[0], { dealId: created.dealId, actorId: 'u-buyer', note: 'спор' }),
    () => cancelDealWithEscrow(clients[1], { dealId: created.dealId, actorId: 'u-seller' }),
  );
  assert.ok(outcome.fulfilled.length >= 1);

  const after = await financials(database);
  const hold = after.holds[0];
  if (after.deals[0].status === 'cancelled') {
    assert.equal(hold.status, 'refunded');
    assert.equal(balanceOf(after.users, 'u-buyer'), 200);
  } else {
    assert.equal(hold.status, 'held', 'a disputed deal keeps the money frozen');
    assert.equal(balanceOf(after.users, 'u-buyer'), 160);
  }
});

test('duplicate admin resolution pays out once', async (t) => {
  const { database, clients } = await twoClientDatabase(t);
  const created = await newDeal(clients[0], { commandId: 'race-resolve' });
  await openDealDispute(clients[0], { dealId: created.dealId, actorId: 'u-buyer', note: '' });

  const outcome = await race(
    () => resolveDealDispute(clients[0], { dealId: created.dealId, outcome: 'release' }),
    () => resolveDealDispute(clients[1], { dealId: created.dealId, outcome: 'release' }),
  );
  assert.equal(outcome.fulfilled.length, 1, 'one resolution wins');

  const after = await financials(database);
  assert.equal(after.earnings.length, 1);
  assert.equal(balanceOf(after.users, 'u-seller'), 40);
  assert.equal(after.holds[0].status, 'done');
  assert.equal(after.users.find(user => user.id === 'u-seller').dealsCount, 1);
});

test('a retried command after reconnect repeats no financial effect', async (t) => {
  const { database, clients } = await twoClientDatabase(t);
  const created = await newDeal(clients[0], { commandId: 'retry-after-reconnect' });
  await confirmDealSide(clients[0], { dealId: created.dealId, actorId: 'u-buyer' });
  await confirmDealSide(clients[0], { dealId: created.dealId, actorId: 'u-seller' });

  // Клиент «переподключился» и шлёт те же команды заново.
  await clients[0].$disconnect();
  const replay = await newDeal(clients[1], { commandId: 'retry-after-reconnect' });
  assert.equal(replay.replayed, true, 'the same command id returns the same deal');
  assert.equal(replay.dealId, created.dealId);
  await assert.rejects(() => confirmDealSide(clients[1], { dealId: created.dealId, actorId: 'u-seller' }));

  const after = await financials(database);
  assert.equal(after.deals.length, 1);
  assert.equal(after.earnings.length, 1);
  assert.equal(balanceOf(after.users, 'u-seller'), 40);
  assert.equal(balanceOf(after.users, 'u-buyer'), 160);
});
