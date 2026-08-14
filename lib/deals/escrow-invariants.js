import { createHash } from 'node:crypto';

const DIRECT_REF_TYPE = 'deal';
const CHAIN_REF_TYPE = 'chain';
const HOLD_KIND = 'escrow-in';

const byCanonicalJson = (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right));

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function canonicalRows(rows) {
  return rows.map(row => ({ ...row })).sort(byCanonicalJson);
}

function pushUnique(bucket, row) {
  const serialized = JSON.stringify(row);
  if (!bucket.some(item => JSON.stringify(item) === serialized)) bucket.push(row);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function expectedStatusFromState(status, stage, disputedAt) {
  const normalizedStatus = cleanString(status).toLowerCase();
  const normalizedStage = cleanString(stage).toLowerCase();
  if (normalizedStatus === 'done' || normalizedStatus === 'completed') return 'done';
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' || normalizedStatus === 'refunded') return 'refunded';
  if (normalizedStatus === 'disputed' || normalizedStage === 'disputed' || disputedAt) return 'held';
  if (normalizedStatus === 'active') return 'held';
  return null;
}

export function stableCreateKey(dealId) {
  return `deal:${cleanString(dealId)}:create`;
}

export function stableHoldKey(dealId) {
  return `deal:${cleanString(dealId)}:hold`;
}

export function stableReleaseKey(dealId) {
  return `deal:${cleanString(dealId)}:release`;
}

export function expectedEscrowStatus(dealOrStatus) {
  if (typeof dealOrStatus === 'string') return expectedStatusFromState(dealOrStatus, '', null);
  if (!dealOrStatus || typeof dealOrStatus !== 'object') return null;
  return expectedStatusFromState(dealOrStatus.status, dealOrStatus.stage, dealOrStatus.disputedAt);
}

export function validateEscrowInvariant(deal, transaction, options = {}) {
  if (!deal || !transaction) return ['missing-row'];

  const violations = [];
  const credits = Number(deal.credits);
  const amount = Number(transaction.amt);
  const expectedStatus = expectedEscrowStatus(deal);
  const refType = cleanString(transaction.refType);
  const refId = cleanString(transaction.refId);
  const allowLegacyRef = options.allowLegacyRef === true;

  if (credits <= 0) violations.push('zero-credit');
  if (cleanString(transaction.userId) !== cleanString(deal.userId)) violations.push('user');
  if (!Number.isFinite(credits) || !Number.isFinite(amount) || amount !== credits) violations.push('amount');
  if (cleanString(transaction.kind) !== HOLD_KIND) violations.push('kind');
  if (expectedStatus && cleanString(transaction.status) !== expectedStatus) violations.push('status');
  if (!(allowLegacyRef && !refType && !refId) && (refType !== DIRECT_REF_TYPE || refId !== cleanString(deal.id))) {
    violations.push('ref');
  }
  if (deal.escrowTransactionId && cleanString(deal.escrowTransactionId) !== cleanString(transaction.id)) {
    violations.push('link');
  }
  if (transaction.businessKey && cleanString(transaction.businessKey) !== stableHoldKey(deal.id)) {
    violations.push('business-key');
  }

  return [...new Set(violations)].sort();
}

function isLegacyOrExactDirectRef(deal, transaction) {
  const refType = cleanString(transaction.refType);
  const refId = cleanString(transaction.refId);
  return (!refType && !refId) || (refType === DIRECT_REF_TYPE && refId === cleanString(deal.id));
}

function matchesCandidate(deal, transaction) {
  if (Number(deal.credits) <= 0) return false;
  if (!expectedEscrowStatus(deal)) return false;
  if (!isLegacyOrExactDirectRef(deal, transaction)) return false;
  return validateEscrowInvariant(deal, transaction, { allowLegacyRef: true })
    .filter(violation => violation !== 'link')
    .length === 0;
}

function createBuckets() {
  return {
    missingLink: [],
    missingLinkedTransaction: [],
    multipleLinks: [],
    multipleCandidates: [],
    unmatchedDeals: [],
    orphanDirectHolds: [],
    danglingDirectRefs: [],
    wrongUser: [],
    wrongAmount: [],
    wrongKind: [],
    wrongRef: [],
    wrongStatus: [],
    duplicateBusinessKeys: [],
    zeroCreditLinks: [],
    balanceAnomalies: [],
    heldAnomalies: [],
    payoutAnomalies: [],
    counterAnomalies: [],
  };
}

function recordViolations(buckets, deal, transaction, violations) {
  const row = { dealId: cleanString(deal.id), transactionId: cleanString(transaction.id) };
  const mapping = {
    user: 'wrongUser',
    amount: 'wrongAmount',
    kind: 'wrongKind',
    ref: 'wrongRef',
    status: 'wrongStatus',
  };
  for (const violation of violations) {
    const bucketName = mapping[violation];
    if (bucketName) pushUnique(buckets[bucketName], row);
  }
}

function addAggregateAnomalies(buckets, deals, transactions, users) {
  for (const user of users) {
    if (Number.isFinite(Number(user.balance)) && Number(user.balance) < 0) {
      buckets.balanceAnomalies.push({ userId: cleanString(user.id), balance: Number(user.balance) });
    }

    if (user.heldBalance !== undefined && user.heldBalance !== null) {
      const actual = transactions
        .filter(tx => cleanString(tx.userId) === cleanString(user.id) && cleanString(tx.status) === 'held')
        .reduce((sum, tx) => sum + Number(tx.amt || 0), 0);
      if (actual !== Number(user.heldBalance)) {
        buckets.heldAnomalies.push({ userId: cleanString(user.id), actual, expected: Number(user.heldBalance) });
      }
    }

    if (user.dealsCount !== undefined && user.dealsCount !== null) {
      const completed = deals.filter(deal =>
        expectedEscrowStatus(deal) === 'done'
        && (cleanString(deal.userId) === cleanString(user.id) || cleanString(deal.ownerId) === cleanString(user.id)),
      ).length;
      if (completed !== Number(user.dealsCount)) {
        buckets.counterAnomalies.push({ userId: cleanString(user.id), actual: Number(user.dealsCount), expected: completed });
      }
    }
  }

  for (const deal of deals.filter(row => Number(row.credits) > 0 && expectedEscrowStatus(row) === 'done')) {
    if (!cleanString(deal.ownerId)) continue;
    const payouts = transactions.filter(tx =>
      cleanString(tx.userId) === cleanString(deal.ownerId)
      && cleanString(tx.kind) === 'earn'
      && Number(tx.amt) === Number(deal.credits)
      && cleanString(tx.status) === 'done'
      && ((!cleanString(tx.refType) && !cleanString(tx.refId))
        || (cleanString(tx.refType) === DIRECT_REF_TYPE && cleanString(tx.refId) === cleanString(deal.id))),
    );
    if (payouts.length !== 1) {
      buckets.payoutAnomalies.push({
        dealId: cleanString(deal.id),
        transactionIds: payouts.map(tx => cleanString(tx.id)).sort(),
      });
    }
  }
}

export function classifyEscrowCandidateGraph(input = {}) {
  const deals = canonicalRows(Array.isArray(input.deals) ? input.deals : []);
  const transactions = canonicalRows(Array.isArray(input.transactions) ? input.transactions : []);
  const users = canonicalRows(Array.isArray(input.users) ? input.users : []);
  const buckets = createBuckets();
  const dealById = new Map(deals.map(deal => [cleanString(deal.id), deal]));
  const transactionById = new Map(transactions.map(tx => [cleanString(tx.id), tx]));

  const chainRows = transactions
    .filter(tx => cleanString(tx.refType) === CHAIN_REF_TYPE)
    .map(tx => ({ refId: cleanString(tx.refId), transactionId: cleanString(tx.id) }));

  const directTransactions = transactions.filter(tx => cleanString(tx.refType) !== CHAIN_REF_TYPE);
  const positiveDeals = deals.filter(deal => Number(deal.credits) > 0);

  for (const tx of directTransactions) {
    if (cleanString(tx.refType) === DIRECT_REF_TYPE && cleanString(tx.refId) && !dealById.has(cleanString(tx.refId))) {
      buckets.danglingDirectRefs.push({ refId: cleanString(tx.refId), transactionId: cleanString(tx.id) });
    }
  }

  const businessKeyGroups = new Map();
  for (const tx of transactions) {
    const businessKey = cleanString(tx.businessKey);
    if (!businessKey) continue;
    if (!businessKeyGroups.has(businessKey)) businessKeyGroups.set(businessKey, []);
    businessKeyGroups.get(businessKey).push(cleanString(tx.id));
  }
  for (const [businessKey, ids] of businessKeyGroups) {
    if (ids.length > 1) {
      buckets.duplicateBusinessKeys.push({ businessKey, transactionIds: ids.sort() });
    }
  }

  for (const deal of deals.filter(row => Number(row.credits) === 0)) {
    const linkedIds = new Set();
    if (cleanString(deal.escrowTransactionId)) linkedIds.add(cleanString(deal.escrowTransactionId));
    for (const tx of directTransactions) {
      if (cleanString(tx.refType) === DIRECT_REF_TYPE && cleanString(tx.refId) === cleanString(deal.id)) {
        linkedIds.add(cleanString(tx.id));
      }
    }
    for (const transactionId of [...linkedIds].sort()) {
      buckets.zeroCreditLinks.push({ dealId: cleanString(deal.id), transactionId });
    }
  }

  for (const deal of positiveDeals) {
    const linkedId = cleanString(deal.escrowTransactionId);
    if (!linkedId) {
      buckets.missingLink.push({ dealId: cleanString(deal.id) });
    } else if (!transactionById.has(linkedId)) {
      buckets.missingLinkedTransaction.push({ dealId: cleanString(deal.id), transactionId: linkedId });
    } else {
      const linked = transactionById.get(linkedId);
      recordViolations(buckets, deal, linked, validateEscrowInvariant(deal, linked));
    }

    const explicitRefs = directTransactions.filter(tx =>
      cleanString(tx.refType) === DIRECT_REF_TYPE && cleanString(tx.refId) === cleanString(deal.id),
    );
    if (explicitRefs.length > 1) {
      buckets.multipleLinks.push({
        dealId: cleanString(deal.id),
        transactionIds: explicitRefs.map(tx => cleanString(tx.id)).sort(),
      });
    }
    for (const tx of explicitRefs) {
      recordViolations(buckets, deal, tx, validateEscrowInvariant(deal, tx));
    }
  }

  const candidatesByDeal = new Map();
  const dealsByTransaction = new Map();
  for (const deal of positiveDeals) {
    const matches = directTransactions.filter(tx => matchesCandidate(deal, tx));
    candidatesByDeal.set(cleanString(deal.id), matches);
    for (const tx of matches) {
      const txId = cleanString(tx.id);
      if (!dealsByTransaction.has(txId)) dealsByTransaction.set(txId, []);
      dealsByTransaction.get(txId).push(deal);
    }
  }

  const automaticPairs = [];
  for (const deal of positiveDeals) {
    const dealId = cleanString(deal.id);
    const matches = candidatesByDeal.get(dealId) || [];
    if (matches.length === 0) {
      buckets.unmatchedDeals.push({ dealId });
      continue;
    }
    if (matches.length > 1) {
      buckets.multipleCandidates.push({ dealId, transactionIds: matches.map(tx => cleanString(tx.id)).sort() });
      continue;
    }
    const transactionId = cleanString(matches[0].id);
    const reverseMatches = dealsByTransaction.get(transactionId) || [];
    if (reverseMatches.length !== 1) {
      buckets.multipleLinks.push({
        dealIds: reverseMatches.map(row => cleanString(row.id)).sort(),
        transactionId,
      });
      continue;
    }
    automaticPairs.push({ dealId, transactionId });
  }

  for (const tx of directTransactions.filter(row => cleanString(row.kind) === HOLD_KIND)) {
    if (!(dealsByTransaction.get(cleanString(tx.id)) || []).length) {
      buckets.orphanDirectHolds.push({ transactionId: cleanString(tx.id) });
    }
  }

  addAggregateAnomalies(buckets, deals, transactions, users);

  for (const name of Object.keys(buckets)) buckets[name] = canonicalRows(buckets[name]);
  const classification = {
    schemaVersion: 1,
    automaticPairs: canonicalRows(automaticPairs),
    chainRows: canonicalRows(chainRows),
    buckets,
  };

  return {
    ...classification,
    hash: createHash('sha256').update(stableJson(classification)).digest('hex'),
  };
}
