// lib/chains.js — поиск многосторонних обменов.
//
// Модель: ориентированный граф лотов. Ребро L1 → L2 значит «владелец L2
// готов взять L1». Цикл в таком графе и есть цепочка: каждый отдаёт свою
// вещь следующему и получает вещь предыдущего.
//
// Два вида цепочек:
//   circle — цикл замкнут желанием, каждый получает вещь;
//   credit — путь A→B→C, где круг замыкается баллами: C оставляет своё
//            и доплачивает, A отдаёт вещь и получает баллы. Таких цепочек
//            на порядок больше — они и вывозят холодный старт.
import { prisma } from './prisma.js';
import { similarityIndex, lotOfferText, lotDemandText } from './ai.js';

// Ребро слабее — считаем, что человек эту вещь не хочет. Порог сознательно
// выше матчингового: в цепочке три звена, и слабое звено рвёт всю сделку.
const EDGE_MIN = 0.45;
// На пересечении слов (нет ключа AI) шкала другая и значения ниже.
const EDGE_MIN_TOKENS = 0.28;
// Из каждого лота держим только лучшие рёбра: хвост всё равно не даёт
// цепочек, которые кто-то подтвердит, а перебор растёт кубически.
const TOP_EDGES = 8;
// Верхняя граница корпуса на один прогон движка. Построение графа
// квадратично по лотам, а каждое ребро — косинус на векторе в пару тысяч
// измерений: на 250 лотах это ~60k сравнений и секунды фонового счёта,
// на 1000 — уже минуты. Когда корпус вырастет, движок надо гонять
// по городам отдельно (аргумент city) или резать по категориям.
const MAX_LOTS = 250;
// Доплата не должна превышать этой доли стоимости своего лота — иначе
// человек чувствует, что доплачивает за чужую вещь, и отказывается.
const MAX_TOPUP_RATIO = 0.4;
// Сколько кандидатов хранить на пользователя: больше — это уже шум.
const MAX_CANDIDATES_PER_USER = 5;
// Кандидат старше этого срока протух: лоты и хотелки успели поменяться.
const CANDIDATE_TTL_MS = 7 * 86400000;

const CHAIN_LEN = 3;

export const CHAIN_ACCEPT_WINDOW_MS = 24 * 3600000;

const clamp100 = n => Math.max(0, Math.min(99, Math.round(n)));

// Состав цепочки, не зависящий от того, с какого участника начали обход:
// без него один и тот же треугольник записывался бы трижды.
function fingerprintOf(kind, steps) {
  const parts = steps.map(s => `${s.userId}>${s.lotId || '-'}`).sort();
  return `${kind}|${parts.join(',')}`;
}

function ownerWants(lot) {
  return (lot.owner?.wants || '').trim();
}

// «Владелец лота b возьмёт лот a» — по тому, что b просит в своём
// объявлении, и по вишлисту владельца.
function edgeWeight(idx, a, b) {
  const offer = lotOfferText(a);
  if (!offer) return 0;
  const byLot = lotDemandText(b) ? idx.sim(offer, lotDemandText(b)) : 0;
  const byUser = ownerWants(b) ? idx.sim(offer, ownerWants(b)) : 0;
  return Math.max(byLot, byUser);
}

// Кто сколько доплачивает. Платит тот, кто получил дороже, чем отдал;
// сумма доплат по цепочке всегда ноль — баллы только перераспределяются.
function topupOf(givenValue, receivedValue) {
  return receivedValue - givenValue;
}

function topupTooBig(topup, givenValue) {
  return topup > 0 && topup > MAX_TOPUP_RATIO * Math.max(givenValue, 1);
}

function noteFor(kind, steps) {
  const names = steps.map(s => s.userName).filter(Boolean);
  if (kind === 'credit') {
    return `${names[0] || 'Участник'} отдаёт вещь и получает баллы, круг закрывается доплатой`;
  }
  return `Круговой обмен на ${names.length} участника — каждый получает то, что искал`;
}

// ---------------------------------------------------------------------------
// Поиск
// ---------------------------------------------------------------------------

/**
 * Ищет цепочки среди активных лотов. Ничего не пишет в БД — только считает.
 * @param {object} opts
 * @param {string} [opts.city]  — искать только внутри города: тройка,
 *   растянутая на разные города, физически не доезжает.
 * @param {boolean} [opts.allowCredit=true]
 * @returns {Promise<Array>} найденные цепочки, лучшие первыми
 */
export async function findChains({ city = '', allowCredit = true } = {}) {
  const lots = await prisma.lot.findMany({
    where: {
      status: 'active',
      ...(city ? { owner: { city } } : {}),
    },
    select: {
      id: true, ownerId: true, title: true, desc: true, wants: true, value: true,
      owner: { select: { id: true, name: true, city: true, wants: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: MAX_LOTS,
  });
  if (lots.length < CHAIN_LEN) return [];

  const texts = [];
  for (const l of lots) {
    texts.push(lotOfferText(l), lotDemandText(l), ownerWants(l));
  }
  const idx = await similarityIndex(texts.filter(Boolean));
  const minEdge = idx.semantic ? EDGE_MIN : EDGE_MIN_TOKENS;

  // adjacency[i] = рёбра из лота i: «владелец j возьмёт лот i»
  const adjacency = lots.map(() => []);
  for (let i = 0; i < lots.length; i++) {
    for (let j = 0; j < lots.length; j++) {
      if (i === j || lots[i].ownerId === lots[j].ownerId) continue;
      const w = edgeWeight(idx, lots[i], lots[j]);
      if (w >= minEdge) adjacency[i].push({ to: j, w });
    }
    adjacency[i].sort((a, b) => b.w - a.w);
    adjacency[i].length = Math.min(adjacency[i].length, TOP_EDGES);
  }

  const seen = new Set();
  const found = [];

  const pushChain = (chain) => {
    if (seen.has(chain.fingerprint)) return;
    seen.add(chain.fingerprint);
    found.push(chain);
  };

  // circle: i → a → b → i
  for (let i = 0; i < lots.length; i++) {
    for (const e1 of adjacency[i]) {
      for (const e2 of adjacency[e1.to]) {
        if (e2.to === i) continue;
        const back = adjacency[e2.to].find(e => e.to === i);
        if (!back) continue;
        const path = [i, e1.to, e2.to];
        const weights = [e1.w, e2.w, back.w];
        const chain = buildCircle(lots, path, weights);
        if (chain) pushChain(chain);
      }
    }
  }

  if (allowCredit) {
    // credit: i → a → b, круг закрывает владелец b доплатой владельцу i
    for (let i = 0; i < lots.length; i++) {
      for (const e1 of adjacency[i]) {
        for (const e2 of adjacency[e1.to]) {
          if (e2.to === i) continue;
          // если круг замыкается желанием — это уже circle, дубль не нужен
          if (adjacency[e2.to].some(e => e.to === i)) continue;
          const chain = buildCredit(lots, [i, e1.to, e2.to], [e1.w, e2.w]);
          if (chain) pushChain(chain);
        }
      }
    }
  }

  return found.sort((a, b) => b.score - a.score);
}

// Круг: каждый отдаёт свой лот следующему, последний — первому.
function buildCircle(lots, path, weights) {
  const items = path.map(i => lots[i]);
  const owners = new Set(items.map(l => l.ownerId));
  if (owners.size !== path.length) return null;

  const steps = items.map((lot, k) => {
    const next = items[(k + 1) % items.length];
    const prev = items[(k - 1 + items.length) % items.length];
    return {
      order: k,
      userId: lot.ownerId,
      userName: lot.owner?.name || '',
      lotId: lot.id,
      lotTitle: lot.title,
      toUserId: next.ownerId,
      value: lot.value,
      topup: topupOf(lot.value, prev.value),
      // сила ребра, по которому эта вещь уходит следующему
      edgeScore: clamp100(100 * weights[k]),
    };
  });

  if (steps.some(s => topupTooBig(s.topup, s.value))) return null;

  return {
    kind: 'circle',
    steps,
    score: clamp100(100 * Math.min(...weights)),
    city: items[0].owner?.city || '',
    note: noteFor('circle', steps),
    fingerprint: fingerprintOf('circle', steps),
  };
}

// Закрытие баллами: A отдаёт лот B, B отдаёт лот C, C ничего не отдаёт и
// платит — этими баллами закрывается «пустая» рука A.
function buildCredit(lots, path, weights) {
  const [a, b, c] = path.map(i => lots[i]);
  const owners = new Set([a.ownerId, b.ownerId, c.ownerId]);
  if (owners.size !== 3) return null;

  const steps = [
    {
      order: 0,
      userId: a.ownerId, userName: a.owner?.name || '',
      lotId: a.id, lotTitle: a.title,
      toUserId: b.ownerId,
      value: a.value,
      topup: topupOf(a.value, 0),
      edgeScore: clamp100(100 * weights[0]),
    },
    {
      order: 1,
      userId: b.ownerId, userName: b.owner?.name || '',
      lotId: b.id, lotTitle: b.title,
      toUserId: c.ownerId,
      value: b.value,
      topup: topupOf(b.value, a.value),
      edgeScore: clamp100(100 * weights[1]),
    },
    {
      // владелец c остаётся при своём и доплачивает за полученное
      order: 2,
      userId: c.ownerId, userName: c.owner?.name || '',
      lotId: null, lotTitle: '',
      toUserId: a.ownerId,
      value: 0,
      topup: topupOf(0, b.value),
      edgeScore: 0,
    },
  ];

  // У закрывающего участника нет своего лота в сделке, поэтому доля от
  // стоимости не работает — ограничиваем по цене вещи, которую он получает.
  if (topupTooBig(steps[1].topup, steps[1].value)) return null;

  return {
    kind: 'credit',
    steps,
    score: clamp100(100 * Math.min(...weights)),
    city: a.owner?.city || '',
    note: noteFor('credit', steps),
    fingerprint: fingerprintOf('credit', steps),
  };
}

// ---------------------------------------------------------------------------
// Запись кандидатов
// ---------------------------------------------------------------------------

/**
 * Пересобирает кандидатов: удаляет протухших и записывает новых.
 * Существующие цепочки в работе (pending/active/done) не трогает.
 */
export async function refreshChainCandidates({ city = '', allowCredit = true } = {}) {
  await pruneCandidates();

  const chains = await findChains({ city, allowCredit });
  if (!chains.length) return { found: 0, created: 0 };

  const existing = await prisma.chain.findMany({
    where: { fingerprint: { in: chains.map(c => c.fingerprint) } },
    select: { fingerprint: true },
  });
  const known = new Set(existing.map(c => c.fingerprint));

  // Сколько кандидатов уже приходится на каждого — чтобы у активного
  // пользователя не оказалось три десятка предложений.
  const perUser = new Map();
  const counts = await prisma.chainStep.groupBy({
    by: ['userId'],
    where: { chain: { status: 'candidate' } },
    _count: { _all: true },
  });
  for (const row of counts) perUser.set(row.userId, row._count._all);

  let created = 0;
  for (const chain of chains) {
    if (known.has(chain.fingerprint)) continue;
    const overloaded = chain.steps.some(
      s => (perUser.get(s.userId) || 0) >= MAX_CANDIDATES_PER_USER,
    );
    if (overloaded) continue;

    try {
      await prisma.chain.create({
        data: {
          kind: chain.kind,
          score: chain.score,
          note: chain.note,
          city: chain.city,
          status: 'candidate',
          fingerprint: chain.fingerprint,
          steps: {
            create: chain.steps.map(s => ({
              order: s.order,
              userId: s.userId,
              lotId: s.lotId,
              toUserId: s.toUserId,
              value: s.value,
              topup: s.topup,
              edgeScore: s.edgeScore,
              state: 'pending',
            })),
          },
        },
      });
      created++;
      for (const s of chain.steps) perUser.set(s.userId, (perUser.get(s.userId) || 0) + 1);
    } catch (e) {
      // гонка по уникальному fingerprint — значит кандидат уже записан
      if (e?.code !== 'P2002') throw e;
    }
  }

  return { found: chains.length, created };
}

// Кандидат протухает по времени и вместе с лотом, который из него ушёл.
async function pruneCandidates() {
  const cutoff = new Date(Date.now() - CANDIDATE_TTL_MS);
  await prisma.chain.deleteMany({
    where: {
      status: 'candidate',
      OR: [
        { createdAt: { lt: cutoff } },
        { steps: { some: { lotId: { not: null }, lot: { status: { not: 'active' } } } } },
      ],
    },
  });
}

/**
 * Ищет замену развалившейся цепочке: тот же инициатор, но без участника,
 * который отказался. Возвращает готовую к записи цепочку или null.
 */
export async function findReplacement({ city = '', keepUserId, excludeUserIds = [] }) {
  const chains = await findChains({ city, allowCredit: true });
  const banned = new Set(excludeUserIds);
  return chains.find(c =>
    c.steps.some(s => s.userId === keepUserId)
    && !c.steps.some(s => banned.has(s.userId)),
  ) || null;
}
