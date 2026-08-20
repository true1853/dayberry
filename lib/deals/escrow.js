// Точное ядро эскроу прямых сделок.
//
// Три правила, из которых следует всё остальное:
//   1. Деньги находятся только по явной связи Deal.escrowTransactionId и
//      полному предикату строки. Поиска «последний held у пользователя»
//      здесь нет и быть не может: он забирает доплату чужой цепочки.
//   2. Одна команда — одна короткая транзакция. Заявка на состояние
//      (условный UPDATE) и денежный эффект неразделимы, иначе сбой между
//      ними оставляет сделку завершённой при замороженных баллах.
//   3. Никакого внешнего ввода-вывода внутри транзакции. Уведомления
//      отправляет вызывающий код и только после успешного возврата.
//
// Клиент Prisma передаётся аргументом: команды одинаково работают с боевым
// клиентом и с временной базой в тестах.
import { stableCommandKey, stableHoldKey, stableReleaseKey } from './escrow-invariants.js';

const HOLD_KIND = 'escrow-in';
const DIRECT_REF_TYPE = 'deal';
const CHAIN_REF_TYPE = 'chain';

export class EscrowError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'EscrowError';
    this.code = code;
  }
}

function requireText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new EscrowError('INVALID_INPUT', `missing ${field}`);
  return text;
}

function normalizeCredits(credits) {
  const value = Math.max(0, Math.round(Number(credits) || 0));
  if (!Number.isFinite(value)) throw new EscrowError('INVALID_INPUT', 'credits must be a finite number');
  return value;
}

// Единственный допустимый способ достать деньги сделки. Возвращает строку
// только если она — ровно тот холд, который сделка себе заморозила.
async function loadExactHold(tx, deal) {
  if (!deal.escrowTransactionId) throw new EscrowError('ESCROW_MISMATCH', `deal ${deal.id} has no linked hold`);

  const hold = await tx.transaction.findUnique({ where: { id: deal.escrowTransactionId } });
  if (!hold) throw new EscrowError('ESCROW_MISMATCH', `linked hold ${deal.escrowTransactionId} is missing`);
  if (hold.refType === CHAIN_REF_TYPE) {
    throw new EscrowError('CHAIN_HOLD_REFUSED', `hold ${hold.id} belongs to chain ${hold.refId}`);
  }
  if (hold.userId !== deal.userId) throw new EscrowError('ESCROW_MISMATCH', `hold ${hold.id} belongs to another user`);
  if (hold.kind !== HOLD_KIND) throw new EscrowError('ESCROW_MISMATCH', `hold ${hold.id} has kind ${hold.kind}`);
  if (Number(hold.amt) !== Number(deal.credits)) throw new EscrowError('ESCROW_MISMATCH', `hold ${hold.id} amount differs`);
  if (hold.refType && hold.refType !== DIRECT_REF_TYPE) throw new EscrowError('ESCROW_MISMATCH', `hold ${hold.id} ref type differs`);
  if (hold.refId && hold.refId !== deal.id) throw new EscrowError('ESCROW_MISMATCH', `hold ${hold.id} points at ${hold.refId}`);
  if (hold.status !== 'held') throw new EscrowError('ESCROW_ALREADY_SETTLED', `hold ${hold.id} is ${hold.status}`);
  return hold;
}

// Перевод холда в терминальный статус условным UPDATE: две параллельные
// команды не могут обе увидеть held и обе провести расчёт.
async function settleHold(tx, hold, status) {
  const settled = await tx.transaction.updateMany({
    where: { id: hold.id, status: 'held', kind: HOLD_KIND, userId: hold.userId, amt: hold.amt },
    data: { status },
  });
  if (settled.count !== 1) throw new EscrowError('STATE_CHANGED', `hold ${hold.id} changed under the command`);
}

function dealRoles(deal, actorId) {
  const isInitiator = deal.userId === actorId;
  const isOwner = deal.lot?.ownerId === actorId;
  return { isInitiator, isOwner, isParticipant: isInitiator || isOwner };
}

async function loadDeal(tx, dealId) {
  const deal = await tx.deal.findUnique({ where: { id: dealId }, include: { lot: true } });
  if (!deal) throw new EscrowError('DEAL_NOT_FOUND', `deal ${dealId} not found`);
  return deal;
}

export async function createDealWithEscrow(prisma, input = {}) {
  const actorId = requireText(input.actorId, 'actorId');
  const lotId = requireText(input.lotId, 'lotId');
  const clientCommandId = requireText(input.clientCommandId, 'clientCommandId');
  const credits = normalizeCredits(input.credits);
  const myLotId = input.myLotId ? requireText(input.myLotId, 'myLotId') : null;
  const commandKey = stableCommandKey(actorId, clientCommandId);

  const existing = await prisma.deal.findUnique({ where: { createCommandKey: commandKey } });
  if (existing) return replayOf(existing, { lotId, credits, myLotId });

  try {
    return await prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUnique({ where: { id: lotId } });
      if (!lot || lot.status !== 'active') throw new EscrowError('LOT_UNAVAILABLE', `lot ${lotId} is unavailable`);
      if (lot.ownerId === actorId) throw new EscrowError('OWN_LOT', 'cannot open a deal on your own lot');

      if (credits > 0) {
        const debited = await tx.user.updateMany({
          where: { id: actorId, balance: { gte: credits } },
          data: { balance: { decrement: credits } },
        });
        if (debited.count !== 1) throw new EscrowError('INSUFFICIENT_FUNDS', 'balance is below the requested credits');
      }

      const deal = await tx.deal.create({
        data: {
          userId: actorId,
          lotId: lot.id,
          myLotId,
          credits,
          stage: 'created',
          status: 'active',
          createCommandKey: commandKey,
        },
      });

      // Сделка создаётся первой только чтобы получить её id для ссылки и
      // бизнес-ключа; связь проставляется в той же транзакции.
      let escrowTransactionId = null;
      if (credits > 0) {
        const hold = await tx.transaction.create({
          data: {
            userId: actorId,
            kind: HOLD_KIND,
            title: `Эскроу · ${String(lot.title || '').split(',')[0]}`,
            sub: 'Доплата заморожена до подтверждения',
            amt: credits,
            status: 'held',
            refType: DIRECT_REF_TYPE,
            refId: deal.id,
            businessKey: stableHoldKey(deal.id),
          },
        });
        await tx.deal.update({ where: { id: deal.id }, data: { escrowTransactionId: hold.id } });
        escrowTransactionId = hold.id;
      }

      return { dealId: deal.id, escrowTransactionId, credits, replayed: false };
    });
  } catch (error) {
    // Гонка двух повторов одной команды: победил параллельный запрос.
    if (error.code === 'P2002') {
      const winner = await prisma.deal.findUnique({ where: { createCommandKey: commandKey } });
      if (winner) return replayOf(winner, { lotId, credits, myLotId });
    }
    throw error;
  }
}

function replayOf(deal, payload) {
  const sameEconomics = deal.lotId === payload.lotId
    && Number(deal.credits) === Number(payload.credits)
    && (deal.myLotId || null) === (payload.myLotId || null);
  if (!sameEconomics) {
    throw new EscrowError('COMMAND_CONFLICT', `command id was reused for different economics on deal ${deal.id}`);
  }
  return { dealId: deal.id, escrowTransactionId: deal.escrowTransactionId, credits: deal.credits, replayed: true };
}

// Разморозка в пользу владельца лота. Вызывается только внутри транзакции
// команды, уже заявившей право на переход.
async function releaseToOwner(tx, deal) {
  if (deal.credits > 0) {
    const hold = await loadExactHold(tx, deal);
    await settleHold(tx, hold, 'done');
    await tx.transaction.create({
      data: {
        userId: deal.lot.ownerId,
        kind: 'earn',
        title: `Обмен: «${String(deal.lot.title || '').split(',')[0]}»`,
        sub: 'Переведено из эскроу',
        amt: deal.credits,
        status: 'done',
        refType: DIRECT_REF_TYPE,
        refId: deal.id,
        businessKey: stableReleaseKey(deal.id),
      },
    });
    await tx.user.update({ where: { id: deal.lot.ownerId }, data: { balance: { increment: deal.credits } } });
  }
  await tx.user.update({ where: { id: deal.lot.ownerId }, data: { dealsCount: { increment: 1 } } });
  await tx.user.update({ where: { id: deal.userId }, data: { dealsCount: { increment: 1 } } });
}

// Возврат инициатору. Те же правила точности, что и при разморозке.
async function refundToInitiator(tx, deal) {
  if (deal.credits <= 0) return;
  const hold = await loadExactHold(tx, deal);
  await settleHold(tx, hold, 'refunded');
  await tx.user.update({ where: { id: deal.userId }, data: { balance: { increment: deal.credits } } });
}

export async function confirmDealSide(prisma, input = {}) {
  const dealId = requireText(input.dealId, 'dealId');
  const actorId = requireText(input.actorId, 'actorId');

  return prisma.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId);
    const roles = dealRoles(deal, actorId);
    if (!roles.isParticipant) throw new EscrowError('DEAL_NOT_FOUND', `deal ${dealId} not found`);
    if (deal.status !== 'active') throw new EscrowError('DEAL_CLOSED', `deal ${dealId} is ${deal.status}`);
    if (deal.disputedAt) throw new EscrowError('DISPUTE_OPEN', `deal ${dealId} is disputed`);

    const mine = roles.isInitiator ? 'initiatorConfirmed' : 'partnerConfirmed';
    const other = roles.isInitiator ? 'partnerConfirmed' : 'initiatorConfirmed';
    if (deal[mine]) throw new EscrowError('ALREADY_CONFIRMED', 'this side has already confirmed');

    const both = deal[other] === true;
    const claimed = await tx.deal.updateMany({
      where: { id: deal.id, status: 'active', disputedAt: null, [mine]: false, [other]: both },
      data: both
        ? { stage: 'done', status: 'done', [mine]: true }
        : { stage: 'confirm', [mine]: true },
    });
    if (claimed.count !== 1) throw new EscrowError('STATE_CHANGED', 'deal state changed under the command');

    if (both) await releaseToOwner(tx, deal);
    return { dealId: deal.id, settled: both, side: roles.isInitiator ? 'initiator' : 'partner' };
  });
}

export async function cancelDealWithEscrow(prisma, input = {}) {
  const dealId = requireText(input.dealId, 'dealId');
  const actorId = requireText(input.actorId, 'actorId');

  return prisma.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId);
    if (!dealRoles(deal, actorId).isParticipant) throw new EscrowError('DEAL_NOT_FOUND', `deal ${dealId} not found`);
    if (deal.status !== 'active') throw new EscrowError('DEAL_CLOSED', `deal ${dealId} is ${deal.status}`);
    if (deal.disputedAt) throw new EscrowError('DISPUTE_OPEN', `deal ${dealId} is disputed`);
    if (deal.initiatorConfirmed || deal.partnerConfirmed) {
      throw new EscrowError('ALREADY_CONFIRMED', 'a confirmed deal cannot be cancelled');
    }

    const closed = await tx.deal.updateMany({
      where: { id: deal.id, status: 'active', disputedAt: null, initiatorConfirmed: false, partnerConfirmed: false },
      data: { status: 'cancelled' },
    });
    if (closed.count !== 1) throw new EscrowError('STATE_CHANGED', 'deal state changed under the command');

    await refundToInitiator(tx, deal);
    return { dealId: deal.id, refunded: deal.credits };
  });
}

export async function openDealDispute(prisma, input = {}) {
  const dealId = requireText(input.dealId, 'dealId');
  const actorId = requireText(input.actorId, 'actorId');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, input.maxNote || 500) : '';

  return prisma.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId);
    if (!dealRoles(deal, actorId).isParticipant) throw new EscrowError('DEAL_NOT_FOUND', `deal ${dealId} not found`);
    if (deal.status !== 'active') throw new EscrowError('DEAL_CLOSED', `deal ${dealId} is ${deal.status}`);
    if (deal.disputedAt) throw new EscrowError('DISPUTE_OPEN', 'a dispute is already open');

    const claimed = await tx.deal.updateMany({
      where: { id: deal.id, status: 'active', disputedAt: null },
      data: { disputedAt: new Date(), disputeById: actorId, disputeNote: note },
    });
    if (claimed.count !== 1) throw new EscrowError('STATE_CHANGED', 'deal state changed under the command');
    return { dealId: deal.id, disputed: true };
  });
}

// Решение спора администратором. Обе ветки — тот же денежный контур, что и
// у участников: отдельного «админского» пути к деньгам не существует.
export async function resolveDealDispute(prisma, input = {}) {
  const dealId = requireText(input.dealId, 'dealId');
  const outcome = requireText(input.outcome, 'outcome');
  if (outcome !== 'refund' && outcome !== 'release') throw new EscrowError('INVALID_INPUT', 'unknown outcome');

  return prisma.$transaction(async (tx) => {
    const deal = await loadDeal(tx, dealId);
    if (deal.status !== 'active') throw new EscrowError('DEAL_CLOSED', `deal ${dealId} is ${deal.status}`);
    if (!deal.disputedAt) throw new EscrowError('DISPUTE_NOT_FOUND', `deal ${dealId} is not disputed`);

    const claimed = await tx.deal.updateMany({
      where: { id: deal.id, status: 'active', disputedAt: { not: null } },
      data: outcome === 'refund'
        ? { status: 'cancelled', disputedAt: null }
        : { stage: 'done', status: 'done', initiatorConfirmed: true, partnerConfirmed: true, disputedAt: null },
    });
    if (claimed.count !== 1) throw new EscrowError('STATE_CHANGED', 'deal state changed under the command');

    if (outcome === 'refund') await refundToInitiator(tx, deal);
    else await releaseToOwner(tx, deal);

    return { dealId: deal.id, outcome };
  });
}
