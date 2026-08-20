// Ядро эскроу: точность связи, атомарность и отказ от «последнего held».
//
// Каждый тест поднимает свою временную базу в целевой схеме и работает с
// доменными командами напрямую, без слоя server actions: проверяется
// финансовый контур, а не маршрутизация.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cancelDealWithEscrow,
  confirmDealSide,
  createDealWithEscrow,
  EscrowError,
  openDealDispute,
  resolveDealDispute,
} from '../lib/deals/escrow.js';
import {
  createMigratedDatabase,
  createTempDir,
  removeTempDir,
  seedParticipants,
  withClient,
} from './fixtures/escrow-db.mjs';

async function coreDatabase(t, options = {}) {
  const dir = await createTempDir('escrow-core');
  t.after(() => removeTempDir(dir));
  const database = await createMigratedDatabase(dir);
  await seedParticipants(database, options);
  return database;
}

function state(prisma) {
  return (async () => ({
    deals: await prisma.$queryRawUnsafe('SELECT "id","credits","stage","status","escrowTransactionId","createCommandKey","initiatorConfirmed","partnerConfirmed","disputedAt" FROM "Deal" ORDER BY "id"'),
    transactions: await prisma.$queryRawUnsafe('SELECT "id","userId","kind","amt","status","refType","refId","businessKey" FROM "Transaction" ORDER BY "businessKey", "id"'),
    users: await prisma.$queryRawUnsafe('SELECT "id","balance","dealsCount" FROM "User" ORDER BY "id"'),
  }))();
}

function balanceOf(users, id) {
  return users.find(user => user.id === id).balance;
}

test('positive create links an exact hold and zero-credit create makes none', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const paid = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-paid',
    });
    const free = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 0, clientCommandId: 'cmd-free',
    });

    const after = await state(prisma);
    const paidDeal = after.deals.find(deal => deal.id === paid.dealId);
    const freeDeal = after.deals.find(deal => deal.id === free.dealId);

    assert.equal(paidDeal.escrowTransactionId, paid.escrowTransactionId);
    assert.equal(freeDeal.escrowTransactionId, null, 'zero-credit deal owns no hold');
    assert.equal(paidDeal.createCommandKey, 'deal:create:u-buyer:cmd-paid');

    const hold = after.transactions.find(tx => tx.id === paid.escrowTransactionId);
    assert.deepEqual(
      { kind: hold.kind, amt: hold.amt, status: hold.status, refType: hold.refType, refId: hold.refId, businessKey: hold.businessKey },
      { kind: 'escrow-in', amt: 40, status: 'held', refType: 'deal', refId: paid.dealId, businessKey: `deal:${paid.dealId}:hold` },
    );
    assert.equal(balanceOf(after.users, 'u-buyer'), 60);
  });
});

test('create retry with the same command id is idempotent and a changed payload conflicts', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const first = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-1',
    });
    const retry = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-1',
    });

    assert.equal(retry.dealId, first.dealId);
    assert.equal(retry.replayed, true);

    const after = await state(prisma);
    assert.equal(after.deals.length, 1, 'a retry must not open a second deal');
    assert.equal(after.transactions.length, 1, 'a retry must not freeze credits twice');
    assert.equal(balanceOf(after.users, 'u-buyer'), 60);

    await assert.rejects(
      () => createDealWithEscrow(prisma, {
        actorId: 'u-buyer', lotId: 'lot-a', credits: 55, clientCommandId: 'cmd-1',
      }),
      error => error instanceof EscrowError && error.code === 'COMMAND_CONFLICT',
    );
  });
});

test('insufficient funds roll back the whole create', async (t) => {
  const database = await coreDatabase(t, { buyerBalance: 10 });

  await withClient(database, async (prisma) => {
    await assert.rejects(
      () => createDealWithEscrow(prisma, {
        actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-poor',
      }),
      error => error instanceof EscrowError && error.code === 'INSUFFICIENT_FUNDS',
    );

    const after = await state(prisma);
    assert.deepEqual(after.deals, []);
    assert.deepEqual(after.transactions, []);
    assert.equal(balanceOf(after.users, 'u-buyer'), 10);
  });
});

test('both confirmations settle the exact hold once and pay the owner', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const created = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-settle',
    });

    const firstSide = await confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-buyer' });
    assert.equal(firstSide.settled, false);

    const secondSide = await confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-seller' });
    assert.equal(secondSide.settled, true);

    const after = await state(prisma);
    const deal = after.deals[0];
    assert.equal(deal.status, 'done');
    assert.equal(deal.stage, 'done');

    const hold = after.transactions.find(tx => tx.businessKey === `deal:${created.dealId}:hold`);
    const release = after.transactions.find(tx => tx.businessKey === `deal:${created.dealId}:release`);
    assert.equal(hold.status, 'done');
    assert.deepEqual(
      { userId: release.userId, kind: release.kind, amt: release.amt, status: release.status, refType: release.refType, refId: release.refId },
      { userId: 'u-seller', kind: 'earn', amt: 40, status: 'done', refType: 'deal', refId: created.dealId },
    );
    assert.equal(balanceOf(after.users, 'u-seller'), 40);
    assert.equal(after.users.find(user => user.id === 'u-seller').dealsCount, 1);
    assert.equal(after.users.find(user => user.id === 'u-buyer').dealsCount, 1);

    await assert.rejects(
      () => confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-seller' }),
      error => error instanceof EscrowError && ['DEAL_CLOSED', 'STATE_CHANGED'].includes(error.code),
    );
    const replayed = await state(prisma);
    assert.equal(balanceOf(replayed.users, 'u-seller'), 40, 'a replayed confirmation pays nothing extra');
  });
});

test('cancel refunds exactly once and a second cancel changes nothing', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const created = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-cancel',
    });

    await cancelDealWithEscrow(prisma, { dealId: created.dealId, actorId: 'u-seller' });

    const after = await state(prisma);
    assert.equal(after.deals[0].status, 'cancelled');
    assert.equal(after.transactions[0].status, 'refunded');
    assert.equal(balanceOf(after.users, 'u-buyer'), 100);

    await assert.rejects(
      () => cancelDealWithEscrow(prisma, { dealId: created.dealId, actorId: 'u-buyer' }),
      error => error instanceof EscrowError && error.code === 'DEAL_CLOSED',
    );
    assert.equal(balanceOf((await state(prisma)).users, 'u-buyer'), 100);
  });
});

test('a chain hold can never be consumed by a direct deal', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const created = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-chain',
    });

    // Цепочечный холд того же пользователя, на ту же сумму и заведомо новее:
    // ровно та строка, которую поиск «последний held» и забирал.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Transaction" ("id","userId","kind","title","amt","status","refType","refId") VALUES ('tx-chain','u-buyer','escrow-in','Эскроу · цепочка',40,'held','chain','chain-x')`,
    );
    // Подменяем связь сделки на цепочечный холд: команда обязана отказать,
    // а не «починить» её молча.
    await prisma.$executeRawUnsafe('UPDATE "Deal" SET "escrowTransactionId" = ? WHERE "id" = ?', 'tx-chain', created.dealId);

    await confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-buyer' });
    await assert.rejects(
      () => confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-seller' }),
      error => error instanceof EscrowError && error.code === 'CHAIN_HOLD_REFUSED',
    );

    const after = await state(prisma);
    assert.equal(after.transactions.find(tx => tx.id === 'tx-chain').status, 'held', 'chain money stays frozen');
    assert.equal(after.deals[0].status, 'active', 'the failed settlement rolled the deal back');
    assert.equal(balanceOf(after.users, 'u-seller'), 0);
  });
});

test('a positive-credit deal without an exact link refuses to settle', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const created = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-legacy',
    });
    // Состояние живой базы до бэкфилла: сделка есть, связи нет.
    await prisma.$executeRawUnsafe('UPDATE "Deal" SET "escrowTransactionId" = NULL WHERE "id" = ?', created.dealId);

    await confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-buyer' });
    await assert.rejects(
      () => confirmDealSide(prisma, { dealId: created.dealId, actorId: 'u-seller' }),
      error => error instanceof EscrowError && error.code === 'ESCROW_MISMATCH',
    );

    const after = await state(prisma);
    assert.equal(after.deals[0].status, 'active');
    assert.equal(after.transactions[0].status, 'held');
    assert.equal(balanceOf(after.users, 'u-seller'), 0);
  });
});

test('dispute freezes the deal and admin outcomes settle it exactly once', async (t) => {
  const database = await coreDatabase(t);

  await withClient(database, async (prisma) => {
    const refunded = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'cmd-dispute-refund',
    });
    await openDealDispute(prisma, { dealId: refunded.dealId, actorId: 'u-buyer', note: 'нет ответа' });

    await assert.rejects(
      () => cancelDealWithEscrow(prisma, { dealId: refunded.dealId, actorId: 'u-buyer' }),
      error => error instanceof EscrowError && error.code === 'DISPUTE_OPEN',
    );
    await assert.rejects(
      () => confirmDealSide(prisma, { dealId: refunded.dealId, actorId: 'u-buyer' }),
      error => error instanceof EscrowError && error.code === 'DISPUTE_OPEN',
    );

    await resolveDealDispute(prisma, { dealId: refunded.dealId, outcome: 'refund' });
    let after = await state(prisma);
    assert.equal(balanceOf(after.users, 'u-buyer'), 100, 'refund returns exactly the frozen amount');

    await assert.rejects(
      () => resolveDealDispute(prisma, { dealId: refunded.dealId, outcome: 'release' }),
      error => error instanceof EscrowError && error.code === 'DEAL_CLOSED',
    );

    const released = await createDealWithEscrow(prisma, {
      actorId: 'u-buyer', lotId: 'lot-a', credits: 25, clientCommandId: 'cmd-dispute-release',
    });
    await openDealDispute(prisma, { dealId: released.dealId, actorId: 'u-seller', note: '' });
    await resolveDealDispute(prisma, { dealId: released.dealId, outcome: 'release' });

    after = await state(prisma);
    const deal = after.deals.find(row => row.id === released.dealId);
    assert.equal(deal.status, 'done');
    assert.equal(deal.disputedAt, null);
    assert.equal(balanceOf(after.users, 'u-seller'), 25);
    assert.equal(
      after.transactions.find(tx => tx.businessKey === `deal:${released.dealId}:hold`).status,
      'done',
    );
  });
});
