// Совместимость выката: флаг чтения обратим, исправленное ядро — нет.
//
// Смысл набора в том, чтобы доказать разделение: выключение флага меняет
// только форму ответа сервера и не возвращает старое поведение денег.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  cancelDealWithEscrow,
  confirmDealSide,
  createDealWithEscrow,
} from '../lib/deals/escrow.js';
import {
  expandedDealReadInclude,
  expandedReadsEnabled,
  expandedReadsFlagName,
  serializeEscrowReadState,
} from '../lib/deals/rollout.js';
import {
  createMigratedDatabase,
  createTempDir,
  projectRoot,
  removeTempDir,
  seedParticipants,
  withClient,
} from './fixtures/escrow-db.mjs';

const ON = { [expandedReadsFlagName()]: '1' };
const OFF = { [expandedReadsFlagName()]: '0' };

test('only a normalized 1 enables expanded reads', () => {
  assert.equal(expandedReadsEnabled({ DEAL_ESCROW_EXPANDED_READS: '1' }), true);
  assert.equal(expandedReadsEnabled({ DEAL_ESCROW_EXPANDED_READS: ' 1 ' }), true);
  for (const value of ['0', '', 'true', 'yes', 'on', 'TRUE', '2', 'null', undefined]) {
    assert.equal(expandedReadsEnabled({ DEAL_ESCROW_EXPANDED_READS: value }), false, `value ${JSON.stringify(value)}`);
  }
  assert.equal(expandedReadsEnabled({}), false);
});

test('the flag changes the query and payload shape but never leaks a transaction id', () => {
  assert.deepEqual(expandedDealReadInclude(OFF), {}, 'flag off must not change the query at all');
  assert.ok(expandedDealReadInclude(ON).escrowTransaction, 'flag on selects the linked row');
  assert.deepEqual(
    Object.keys(expandedDealReadInclude(ON).escrowTransaction.select).sort(),
    ['refType', 'status'],
    'only non-sensitive fields are selected',
  );

  const deal = {
    id: 'deal-1',
    credits: 40,
    status: 'active',
    escrowTransactionId: 'tx-secret-id',
    escrowTransaction: { status: 'held', refType: 'deal' },
  };

  assert.deepEqual(serializeEscrowReadState(deal, OFF), {}, 'flag off adds nothing');
  const shown = serializeEscrowReadState(deal, ON);
  assert.deepEqual(shown, { escrowLinkState: 'linked' });
  assert.equal(JSON.stringify(shown).includes('tx-secret-id'), false, 'raw transaction id never serializes');

  assert.deepEqual(serializeEscrowReadState({ ...deal, credits: 0 }, ON), { escrowLinkState: 'none' });
  assert.deepEqual(
    serializeEscrowReadState({ ...deal, escrowTransactionId: null, escrowTransaction: null }, ON),
    { escrowLinkState: 'needs-attention' },
    'a deal that lost its link is visible without exposing internals',
  );
  assert.deepEqual(
    serializeEscrowReadState({ ...deal, escrowTransaction: { status: 'done', refType: 'deal' } }, ON),
    { escrowLinkState: 'needs-attention' },
    'an active deal whose hold was already settled needs an operator',
  );
});

test('the corrected escrow core behaves identically with the flag off and on', async (t) => {
  const results = [];
  for (const environment of [OFF, ON]) {
    const dir = await createTempDir('compat');
    t.after(() => removeTempDir(dir));
    const database = await createMigratedDatabase(dir);
    await seedParticipants(database);

    const previous = process.env[expandedReadsFlagName()];
    process.env[expandedReadsFlagName()] = environment[expandedReadsFlagName()];
    try {
      results.push(await withClient(database, async (prisma) => {
        const settled = await createDealWithEscrow(prisma, {
          actorId: 'u-buyer', lotId: 'lot-a', credits: 40, clientCommandId: 'compat-settle',
        });
        await confirmDealSide(prisma, { dealId: settled.dealId, actorId: 'u-buyer' });
        await confirmDealSide(prisma, { dealId: settled.dealId, actorId: 'u-seller' });

        const cancelled = await createDealWithEscrow(prisma, {
          actorId: 'u-buyer', lotId: 'lot-a', credits: 15, clientCommandId: 'compat-cancel',
        });
        await cancelDealWithEscrow(prisma, { dealId: cancelled.dealId, actorId: 'u-buyer' });

        const rows = await prisma.$queryRawUnsafe(
          `SELECT "kind","amt","status","refType","businessKey" FROM "Transaction" ORDER BY "businessKey"`,
        );
        // Идентификаторы сделок в двух базах разные по определению, поэтому
        // сравнивается роль проводки (hold/release), а не её ключ целиком.
        const transactions = rows
          .map(row => ({
            kind: row.kind,
            amt: row.amt,
            status: row.status,
            refType: row.refType,
            role: row.businessKey ? row.businessKey.split(':').pop() : null,
          }))
          .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const users = await prisma.$queryRawUnsafe('SELECT "id","balance","dealsCount" FROM "User" ORDER BY "id"');
        return { transactions, users };
      }));
    } finally {
      if (previous === undefined) delete process.env[expandedReadsFlagName()];
      else process.env[expandedReadsFlagName()] = previous;
    }
  }

  assert.deepEqual(results[0], results[1], 'money must not depend on a read flag');
  const seller = results[0].users.find(user => user.id === 'u-seller');
  assert.equal(seller.balance, 40, 'settlement paid the owner in both modes');
  assert.equal(results[0].users.find(user => user.id === 'u-buyer').balance, 60);
});

test('the container startup instruction is an exact allowlist', () => {
  const dockerfile = readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf8');
  const startup = dockerfile
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(CMD|ENTRYPOINT)\b/i.test(line));

  const approved = 'CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "80"]';
  assert.deepEqual(startup, [approved], 'startup must be exactly the approved direct Next.js command');

  // Явные проверки на то, чем эта строка была раньше: любая из этих команд
  // при старте трогала живые данные.
  for (const forbidden of ['db push', 'migrate deploy', 'migrate-photos', 'migrate-chains', 'npm run', 'sh -c']) {
    assert.equal(startup[0].includes(forbidden), false, `startup must not contain ${forbidden}`);
  }
});
