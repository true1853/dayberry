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
import { VLADIMIR_REGION } from '../src/cities.js';

// Ребро слабее — считаем, что человек эту вещь не хочет.
//
// Шкала здесь калиброванная (см. calibrate в ai.js): сырой косинус 0.46
// превращается в 0, 0.82 — в единицу. На реальных данных дословное
// совпадение «Принтер HP» ↔ «хочу принтер» даёт 0.458, «кровать» ↔ «кровать,
// диван» — 0.361. Прежние 0.45 пропускали одно ребро на весь граф, то есть
// цепочка не могла собраться в принципе. 0.26 оставляет осмысленные пары,
// а мусор вроде «чемодан ↔ гантели» отсекается уже на уровне цепочки —
// средним по рёбрам, см. MIN_CHAIN_AVG.
const EDGE_MIN = 0.26;
// Одно слабое звено цепочка терпит, три — нет: среднее по рёбрам должно быть
// заметно выше порога. Множитель, а не абсолют, — чтобы правило работало и на
// пересечении слов, где вся шкала другая.
const CHAIN_AVG_RATIO = 1.27;
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

// Регион участника. Внутри одного города плотности на старте нет: во
// Владимире 25 лотов на четверых, и цикл из трёх человек там не собирается.
// Область — минимальная единица, в которой обмен физически доезжает.
function geoGroup(city) {
  if (!city) return [];
  return VLADIMIR_REGION.includes(city) ? VLADIMIR_REGION : [city];
}

// Что можно передать, не встречаясь: услуги, которые оказывают удалённо.
// Клининг и грузоперевозки — тоже услуги, но их через полстраны не окажешь,
// поэтому смотрим не только на категорию.
const REMOTE_WORDS = /(сайт|лендинг|дизайн|логотип|реклам|таргет|smm|копирайт|текст|перевод|консульт|урок|репетитор|обучен|монтаж видео|видеомонтаж|фото ?обработ|ретушь|верстк|программ|разработ|настройк.{0,12}(рекламы|аналитики)|seo)/i;

function isRemote(lot) {
  return lot.cat === 'service' && REMOTE_WORDS.test(`${lot.title} ${lot.desc || ''}`);
}

// Цепочка доезжает, если все участники в одном регионе — или если всё, что
// в ней передаётся, оказывается удалённо. В цепочке с доплатой замыкающий
// ничего не отдаёт, но вещь получает, поэтому его город тоже считается.
function deliverable(cities, moved) {
  const groups = [...new Set(cities.filter(Boolean).map(c => geoGroup(c).join('|')))];
  if (groups.length <= 1) return true;
  return moved.every(isRemote);
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
 *
 * Граф строится по людям, а не по лотам: у участника обычно несколько вещей,
 * и он согласен отдать любую подходящую. Раньше цикл должен был замкнуться
 * на конкретных лотах — если у человека на одном объявлении написано
 * «хочу самокат», а на другом «хочу принтер», цепочка рвалась, хотя сам он
 * согласен на оба варианта.
 *
 * @param {object} opts
 * @param {string} [opts.city] — город участника. Ищем по всему его региону:
 *   внутри одного города на старте попросту нет плотности. Через границу
 *   региона пускаем только цепочки, где всё передаётся удалённо.
 * @param {'region'|'any'} [opts.scope='region'] — 'any' снимает географию
 *   совсем: человек сам решил, что готов на участников из другого города.
 * @param {boolean} [opts.allowCredit=true]
 * @param {object} [opts.stats] — сюда пишется, почему цепочек не нашлось:
 *   пустой экран без объяснения выглядит как поломка.
 * @returns {Promise<Array>} найденные цепочки, лучшие первыми
 */
export async function findChains({ city = '', scope = 'region', allowCredit = true, stats = null } = {}) {
  const anywhere = scope === 'any';
  const geo = anywhere ? [] : geoGroup(city);
  const note = (k) => { if (stats) stats[k] = (stats[k] || 0) + 1; };
  const lots = await prisma.lot.findMany({
    where: {
      status: 'active',
      ...(geo.length
        ? { OR: [{ owner: { city: { in: geo } } }, { cat: 'service' }] }
        : {}),
    },
    select: {
      id: true, ownerId: true, title: true, desc: true, wants: true, value: true, cat: true,
      owner: { select: { id: true, name: true, city: true, wants: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_LOTS,
  });
  if (stats) { stats.lots = lots.length; stats.people = new Set(lots.map(l => l.ownerId)).size; stats.scope = anywhere ? 'any' : 'region'; }
  if (lots.length < CHAIN_LEN) return [];

  const texts = [];
  for (const l of lots) {
    texts.push(lotOfferText(l), lotDemandText(l), ownerWants(l));
  }
  const idx = await similarityIndex(texts.filter(Boolean));
  const minEdge = idx.semantic ? EDGE_MIN : EDGE_MIN_TOKENS;
  const minAvg = minEdge * CHAIN_AVG_RATIO;

  // Лоты по владельцам: узел графа — человек, ребро — «B возьмёт что-то из
  // вещей A», и вместе с весом мы запоминаем, какую именно вещь.
  const byOwner = new Map();
  for (const l of lots) {
    if (!byOwner.has(l.ownerId)) byOwner.set(l.ownerId, []);
    byOwner.get(l.ownerId).push(l);
  }
  const owners = [...byOwner.keys()];
  if (owners.length < CHAIN_LEN) return [];


  const adjacency = owners.map(() => []);
  for (let i = 0; i < owners.length; i++) {
    for (let j = 0; j < owners.length; j++) {
      if (i === j) continue;
      const edge = bestOffer(idx, byOwner.get(owners[i]), byOwner.get(owners[j]));
      if (edge && edge.w >= minEdge) adjacency[i].push({ to: j, ...edge });
    }
    adjacency[i].sort((a, b) => b.w - a.w);
    adjacency[i].length = Math.min(adjacency[i].length, TOP_EDGES);
  }
  if (stats) stats.edges = adjacency.reduce((n, list) => n + list.length, 0);

  const seen = new Set();
  const found = [];

  const pushChain = (chain) => {
    // null с этапа сборки значит одно: доплата вышла за потолок
    if (!chain) { note('droppedTopup'); return; }
    const avg = chain.weights.reduce((a, b) => a + b, 0) / chain.weights.length;
    if (avg < minAvg) { note('droppedWeak'); return; }
    if (!anywhere && !deliverable(chain.cities, chain.moved)) { note('droppedGeo'); return; }
    if (seen.has(chain.fingerprint)) return;
    seen.add(chain.fingerprint);
    delete chain.weights;
    delete chain.cities;
    delete chain.moved;
    found.push(chain);
  };

  // circle: i → a → b → i, каждый получает вещь
  for (let i = 0; i < owners.length; i++) {
    for (const e1 of adjacency[i]) {
      for (const e2 of adjacency[e1.to]) {
        if (e2.to === i) continue;
        const back = adjacency[e2.to].find(e => e.to === i);
        if (!back) continue;
        pushChain(buildCircle([e1, e2, back]));
      }
    }
  }

  if (allowCredit) {
    // credit: i → a → b, круг закрывает владелец b доплатой владельцу i
    for (let i = 0; i < owners.length; i++) {
      for (const e1 of adjacency[i]) {
        for (const e2 of adjacency[e1.to]) {
          if (e2.to === i) continue;
          // если круг замыкается желанием — это уже circle, дубль не нужен
          if (adjacency[e2.to].some(e => e.to === i)) continue;
          pushChain(buildCredit([e1, e2], byOwner.get(owners[e2.to])[0]));
        }
      }
    }
  }

  if (stats) stats.found = found.length;
  return found.sort((a, b) => b.score - a.score);
}

// Лучшее «B возьмёт что-то из вещей A»: перебираем вещи A против того, что
// просит B — и в своих объявлениях, и в вишлисте профиля.
function bestOffer(idx, fromLots, toLots) {
  const demands = [...new Set(toLots.map(lotDemandText).concat(ownerWants(toLots[0])).filter(Boolean))];
  if (!demands.length) return null;
  let best = null;
  for (const lot of fromLots) {
    const offer = lotOfferText(lot);
    if (!offer) continue;
    for (const d of demands) {
      const w = idx.sim(offer, d);
      if (!best || w > best.w) best = { w, lot };
    }
  }
  return best;
}

// Круг: каждый отдаёт свою вещь следующему, последний — первому.
// edges[k] — ребро «владелец k отдаёт свою вещь владельцу k+1».
function buildCircle(edges) {
  const items = edges.map(e => e.lot);
  const owners = new Set(items.map(l => l.ownerId));
  if (owners.size !== edges.length) return null;

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
      edgeScore: clamp100(100 * edges[k].w),
    };
  });

  if (steps.some(s => topupTooBig(s.topup, s.value))) return null;

  const weights = edges.map(e => e.w);
  return {
    kind: 'circle',
    steps,
    weights,
    cities: items.map(l => l.owner?.city || ''),
    moved: items,
    score: clamp100(100 * Math.min(...weights)),
    city: items[0].owner?.city || '',
    note: noteFor('circle', steps),
    fingerprint: fingerprintOf('circle', steps),
  };
}

// Закрытие баллами: A отдаёт лот B, B отдаёт лот C, C ничего не отдаёт и
// платит — этими баллами закрывается «пустая» рука A.
// closer — любой лот замыкающего: он нужен только чтобы знать, кто это.
function buildCredit(edges, closerLot) {
  const a = edges[0].lot;
  const b = edges[1].lot;
  const c = closerLot;
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
      edgeScore: clamp100(100 * edges[0].w),
    },
    {
      order: 1,
      userId: b.ownerId, userName: b.owner?.name || '',
      lotId: b.id, lotTitle: b.title,
      toUserId: c.ownerId,
      value: b.value,
      topup: topupOf(b.value, a.value),
      edgeScore: clamp100(100 * edges[1].w),
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

  const weights = edges.map(e => e.w);
  return {
    kind: 'credit',
    steps,
    weights,
    cities: [a, b, c].map(l => l.owner?.city || ''),
    // замыкающий свою вещь не отдаёт — везут только a и b
    moved: [a, b],
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
export async function refreshChainCandidates({ city = '', scope = 'region', allowCredit = true } = {}) {
  await pruneCandidates();

  const stats = {};
  const chains = await findChains({ city, scope, allowCredit, stats });
  if (!chains.length) return { found: 0, created: 0, stats };

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

  return { found: chains.length, created, stats };
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
