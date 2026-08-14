import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyEscrowCandidateGraph,
  expectedEscrowStatus,
  stableCreateKey,
  stableHoldKey,
  stableReleaseKey,
  validateEscrowInvariant,
} from '../lib/deals/escrow-invariants.js';

const cleanDeal = {
  id: 'deal-a',
  userId: 'buyer-a',
  ownerId: 'seller-a',
  credits: 40,
  status: 'active',
  stage: 'created',
  escrowTransactionId: null,
};

const cleanHold = {
  id: 'tx-a',
  userId: 'buyer-a',
  kind: 'escrow-in',
  amt: 40,
  status: 'held',
  refType: '',
  refId: '',
  businessKey: null,
};

test('classifier exposes stable keys and status expectations', () => {
  assert.equal(stableCreateKey('deal-a'), 'deal:deal-a:create');
  assert.equal(stableHoldKey('deal-a'), 'deal:deal-a:hold');
  assert.equal(stableReleaseKey('deal-a'), 'deal:deal-a:release');
  assert.equal(expectedEscrowStatus({ status: 'active' }), 'held');
  assert.equal(expectedEscrowStatus({ status: 'disputed' }), 'held');
  assert.equal(expectedEscrowStatus({ status: 'done' }), 'done');
  assert.equal(expectedEscrowStatus({ status: 'cancelled' }), 'refunded');
});

test('classifier returns one globally unique legacy direct pair with exact row IDs', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [cleanHold],
    users: [],
  });

  assert.deepEqual(result.automaticPairs, [{ dealId: 'deal-a', transactionId: 'tx-a' }]);
  assert.deepEqual(result.chainRows, []);
  assert.deepEqual(result.buckets.missingLink, [{ dealId: 'deal-a' }]);
  assert.match(result.hash, /^[a-f0-9]{64}$/);
});

test('classifier is deterministic for reordered input and sorts every bucket', () => {
  const ambiguousDeals = [
    { ...cleanDeal, id: 'deal-z' },
    { ...cleanDeal, id: 'deal-a' },
  ];
  const ambiguousHolds = [
    { ...cleanHold, id: 'tx-z' },
    { ...cleanHold, id: 'tx-a' },
  ];

  const forward = classifyEscrowCandidateGraph({
    deals: ambiguousDeals,
    transactions: ambiguousHolds,
    users: [],
  });
  const reverse = classifyEscrowCandidateGraph({
    deals: [...ambiguousDeals].reverse(),
    transactions: [...ambiguousHolds].reverse(),
    users: [],
  });

  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.automaticPairs, []);
  assert.deepEqual(forward.buckets.multipleCandidates, [
    { dealId: 'deal-a', transactionIds: ['tx-a', 'tx-z'] },
    { dealId: 'deal-z', transactionIds: ['tx-a', 'tx-z'] },
  ]);
});

test('chain exclusion keeps a newer chain hold outside the direct candidate graph', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [cleanDeal],
    transactions: [
      cleanHold,
      {
        ...cleanHold,
        id: 'tx-newer-chain',
        refType: 'chain',
        refId: 'chain-1',
        createdAt: '2099-01-01T00:00:00.000Z',
      },
    ],
    users: [],
  });

  assert.deepEqual(result.automaticPairs, [{ dealId: 'deal-a', transactionId: 'tx-a' }]);
  assert.deepEqual(result.chainRows, [{ refId: 'chain-1', transactionId: 'tx-newer-chain' }]);
  assert.equal(JSON.stringify(result).includes('createdAt'), false);
});

test('classifier retains corrupt, dangling, duplicate-key and zero-credit row IDs', () => {
  const result = classifyEscrowCandidateGraph({
    deals: [
      { ...cleanDeal, id: 'deal-linked', escrowTransactionId: 'tx-wrong' },
      { ...cleanDeal, id: 'deal-zero', credits: 0, escrowTransactionId: 'tx-zero' },
    ],
    transactions: [
      { ...cleanHold, id: 'tx-wrong', userId: 'someone-else', refType: 'deal', refId: 'deal-linked' },
      { ...cleanHold, id: 'tx-zero', amt: 0, refType: 'deal', refId: 'deal-zero' },
      { ...cleanHold, id: 'tx-dangling', refType: 'deal', refId: 'missing-deal' },
      { ...cleanHold, id: 'tx-key-a', businessKey: 'deal:dup:hold' },
      { ...cleanHold, id: 'tx-key-b', businessKey: 'deal:dup:hold' },
    ],
    users: [],
  });

  assert.deepEqual(result.buckets.wrongUser, [{ dealId: 'deal-linked', transactionId: 'tx-wrong' }]);
  assert.deepEqual(result.buckets.zeroCreditLinks, [{ dealId: 'deal-zero', transactionId: 'tx-zero' }]);
  assert.deepEqual(result.buckets.danglingDirectRefs, [{ refId: 'missing-deal', transactionId: 'tx-dangling' }]);
  assert.deepEqual(result.buckets.duplicateBusinessKeys, [{
    businessKey: 'deal:dup:hold',
    transactionIds: ['tx-key-a', 'tx-key-b'],
  }]);
});

test('classifier invariant validation reports every mismatched field', () => {
  const violations = validateEscrowInvariant(
    { ...cleanDeal, escrowTransactionId: 'tx-bad' },
    {
      ...cleanHold,
      id: 'tx-bad',
      userId: 'wrong-user',
      amt: 41,
      kind: 'earn',
      status: 'done',
      refType: 'deal',
      refId: 'other-deal',
    },
  );

  assert.deepEqual(violations, ['amount', 'kind', 'ref', 'status', 'user']);
});
