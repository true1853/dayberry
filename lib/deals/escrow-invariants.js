import { createHash } from 'node:crypto';

const DIRECT_REF_TYPE = 'deal';
const CHAIN_REF_TYPE = 'chain';
const HOLD_KIND = 'escrow-in';

function byCanonicalJson(left, right) {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  if (leftJson < rightJson) return -1;
  if (leftJson > rightJson) return 1;
  return 0;
}

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

// Категории, которые до бэкфилла отсутствуют по устройству схемы, а не из-за
// повреждения данных. Держать их наравне с остальными значит утопить
// блокирующий сигнал pre-apply аудита в ожидаемом шуме.
const EXPECTED_BEFORE_LINK_COLUMN = new Set(['missingLink']);

function createBuckets() {
  return {
    legacyChainSuspectHolds: [],
    chainHoldsSettledOutsideChain: [],
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

// Цепочечная доплата получила явный refType только после того, как поиск
// «последний held у пользователя» разъехался на цепочках. Холд без ссылки,
// совпадающий с доплатой шага того же участника, поэтому нельзя считать
// прямым: прямой бэкфилл иначе присвоит сделке чужие замороженные баллы.
function collectLegacyChainSuspects(transactions, chainSteps) {
  const stepsByUser = new Map();
  for (const step of chainSteps) {
    const userId = cleanString(step.userId);
    const topup = Number(step.topup);
    if (!userId || !Number.isFinite(topup) || topup <= 0) continue;
    if (!stepsByUser.has(userId)) stepsByUser.set(userId, []);
    stepsByUser.get(userId).push({ chainId: cleanString(step.chainId), topup });
  }

  const rows = [];
  const ids = new Set();
  for (const tx of transactions) {
    if (cleanString(tx.kind) !== HOLD_KIND) continue;
    if (cleanString(tx.refType) || cleanString(tx.refId)) continue;
    const steps = stepsByUser.get(cleanString(tx.userId)) || [];
    const chainIds = [...new Set(steps.filter(step => step.topup === Number(tx.amt)).map(step => step.chainId))].sort();
    if (chainIds.length === 0) continue;
    rows.push({ chainIds, transactionId: cleanString(tx.id), userId: cleanString(tx.userId) });
    ids.add(cleanString(tx.id));
  }
  return { rows, ids };
}

// Холд цепочки, снятый со статуса held, пока сама цепочка не завершена, —
// след «последнего held», съеденного прямой сделкой. Прямому графу он не
// принадлежит, но оператору о нём знать обязательно.
function collectChainHoldsSettledOutsideChain(transactions, chains) {
  const chainById = new Map(chains.map(chain => [cleanString(chain.id), cleanString(chain.status)]));
  const rows = [];
  for (const tx of transactions) {
    if (cleanString(tx.refType) !== CHAIN_REF_TYPE) continue;
    if (cleanString(tx.kind) !== HOLD_KIND) continue;
    if (cleanString(tx.status) === 'held') continue;
    const chainId = cleanString(tx.refId);
    if (!chainById.has(chainId)) continue;
    const chainStatus = chainById.get(chainId);
    if (chainStatus === 'done') continue;
    rows.push({ chainId, chainStatus, transactionId: cleanString(tx.id) });
  }
  return rows;
}

// missingLink живёт в трёх разных мирах, и путать их нельзя:
//   1. колонки связи ещё нет — отсутствие связи ожидаемо у всех сделок;
//   2. колонка есть, манифест известен — блокирует только то, что манифест
//      обещал связать, а остальное ждёт ручного решения оператора (PF-02);
//   3. колонка есть, манифеста нет — блокирует всё, это худший случай.
function splitMissingLink(rows, hasDealEscrowLink, manifestDealIds) {
  if (!hasDealEscrowLink) return { blocking: [], expected: rows };
  if (!manifestDealIds) return { blocking: rows, expected: [] };
  const promised = new Set(manifestDealIds.map(cleanString));
  return {
    blocking: rows.filter(row => promised.has(cleanString(row.dealId))),
    expected: rows.filter(row => !promised.has(cleanString(row.dealId))),
  };
}

function summarizeSeverity(buckets, hasDealEscrowLink, manifestDealIds) {
  const blocking = {};
  const expected = {};
  for (const [name, rows] of Object.entries(buckets)) {
    if (rows.length === 0) continue;
    if (!EXPECTED_BEFORE_LINK_COLUMN.has(name)) {
      blocking[name] = rows.length;
      continue;
    }
    const split = splitMissingLink(rows, hasDealEscrowLink, manifestDealIds);
    if (split.blocking.length > 0) blocking[name] = split.blocking.length;
    if (split.expected.length > 0) expected[name] = split.expected.length;
  }
  return { blocking, expected };
}

export function classifyEscrowCandidateGraph(input = {}) {
  const deals = canonicalRows(Array.isArray(input.deals) ? input.deals : []);
  const transactions = canonicalRows(Array.isArray(input.transactions) ? input.transactions : []);
  const users = canonicalRows(Array.isArray(input.users) ? input.users : []);
  const chainSteps = canonicalRows(Array.isArray(input.chainSteps) ? input.chainSteps : []);
  const chains = canonicalRows(Array.isArray(input.chains) ? input.chains : []);
  const hasDealEscrowLink = input.schema?.hasDealEscrowLink === true;
  const manifestDealIds = Array.isArray(input.manifestDealIds) ? input.manifestDealIds : null;
  const buckets = createBuckets();
  const dealById = new Map(deals.map(deal => [cleanString(deal.id), deal]));
  const transactionById = new Map(transactions.map(tx => [cleanString(tx.id), tx]));

  const chainRows = transactions
    .filter(tx => cleanString(tx.refType) === CHAIN_REF_TYPE)
    .map(tx => ({ refId: cleanString(tx.refId), transactionId: cleanString(tx.id) }));

  const legacyChainSuspects = collectLegacyChainSuspects(transactions, chainSteps);
  buckets.legacyChainSuspectHolds.push(...legacyChainSuspects.rows);
  buckets.chainHoldsSettledOutsideChain.push(...collectChainHoldsSettledOutsideChain(transactions, chains));

  const directTransactions = transactions.filter(tx =>
    cleanString(tx.refType) !== CHAIN_REF_TYPE && !legacyChainSuspects.ids.has(cleanString(tx.id)),
  );
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
  const severity = summarizeSeverity(buckets, hasDealEscrowLink, manifestDealIds);
  const classification = {
    schemaVersion: 2,
    schema: { hasDealEscrowLink },
    manifestApplied: manifestDealIds !== null,
    automaticPairs: canonicalRows(automaticPairs),
    chainRows: canonicalRows(chainRows),
    buckets,
    severity,
    high: Object.keys(severity.blocking).length > 0,
  };

  return {
    ...classification,
    hash: createHash('sha256').update(stableJson(classification)).digest('hex'),
  };
}
