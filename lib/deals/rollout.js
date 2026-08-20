// Флаг расширенного чтения сделки.
//
// Он управляет ТОЛЬКО тем, что видно в ответе сервера. Исправленное ядро
// эскроу флагом не управляется никогда: откат чтения не должен возвращать
// поиск «последнего held», из-за которого сделки теряли свои деньги.
//
// Флаг серверный: в браузер он не уходит и на клиенте не читается.
const FLAG_NAME = 'DEAL_ESCROW_EXPANDED_READS';

// Только нормализованная единица включает расширение. 'true', 'yes',
// 'on', пустая строка и любой мусор трактуются как выключено: неоднозначное
// значение в проде должно означать «безопасное поведение», а не догадку.
export function expandedReadsEnabled(environment = process.env) {
  return String(environment[FLAG_NAME] ?? '').trim() === '1';
}

export function expandedReadsFlagName() {
  return FLAG_NAME;
}

// Prisma-фрагмент для расширенного чтения. Возвращает пустой объект, когда
// флаг выключен, чтобы запрос не менялся вовсе.
export function expandedDealReadInclude(environment = process.env) {
  return expandedReadsEnabled(environment)
    ? { escrowTransaction: { select: { status: true, refType: true } } }
    : {};
}

// Состояние связи сделки с эскроу — без единого идентификатора строки.
// Наружу уходит только признак, по которому участник понимает, нужна ли
// помощь оператора; ID транзакции остаётся внутренним.
export function serializeEscrowReadState(deal, environment = process.env) {
  if (!expandedReadsEnabled(environment)) return {};
  if (!deal || Number(deal.credits) <= 0) return { escrowLinkState: 'none' };
  if (!deal.escrowTransactionId) return { escrowLinkState: 'needs-attention' };
  const status = deal.escrowTransaction?.status;
  if (status && status !== 'held' && deal.status === 'active') {
    return { escrowLinkState: 'needs-attention' };
  }
  return { escrowLinkState: 'linked' };
}
