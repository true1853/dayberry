// lib/ai.js — server-only AI layer for listing analysis + matching.
// Provider-agnostic: uses any OpenAI-compatible /v1/chat/completions endpoint
// (OpenAI, Gemini via OpenAI gateway, DeepSeek, YandexGPT/OpenAI-compatible, etc).
// If AI_API_KEY is not set or the call fails, falls back to deterministic heuristics,
// so the app never depends on an external AI service being up.
import { createHash } from 'node:crypto';
import { prisma } from './prisma.js';

const BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const API_KEY = process.env.AI_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const EMBED_MODEL = process.env.AI_EMBED_MODEL || 'qwen/qwen3-embedding-4b';
const TIMEOUT_MS = 20000;
// Эмбеддинги считаются в фоне для ленты мэтчей — пользователь их не ждёт.
// Держим таймаут коротким: при недоступности провайдера сразу уходим
// в token-overlap fallback вместо 20-секундного зависания.
const EMBED_TIMEOUT_MS = 4000;
// Верхняя граница для O(n^2) ветки кросс-спроса в computeMatches.
const MAX_CROSS_DEMAND_LOTS = 60;
// Должен совпадать с лимитом на клиенте (screen-onboarding.jsx): при
// расхождении фото молча не доходило до модели, и она оценивала по заголовку.
const MAX_PHOTO_CHARS = 3_500_000;
const MAX_DESC = 500;
const MAX_TITLE = 80;
const MAX_WANTS = 140;

// ---------------------------------------------------------------------------
// Deterministic fallback (works offline, no API key needed)
// ---------------------------------------------------------------------------

const CAT_KEYWORDS = {
  kids:    ['детск', 'игрушк', 'коляск', 'санк', 'самокат детс', 'конструктор', 'пупс', 'кроватк', 'манеж', 'ходунк'],
  auto:    ['автомобил', 'машин', 'шин', 'колёс', 'колес', 'диск тормоз', 'тормозн', 'запчаст', 'бампер', 'двигател', 'аккумулятор авто'],
  sport:   ['велосипед', 'лыж', 'коньк', 'сноуборд', 'самокат', 'ролик', 'палатк', 'спальник', 'мангал', 'шашлык', 'гантел', 'тренаж', 'рыболов', 'удочк'],
  fashion: ['куртк', 'пальто', 'плать', 'джинс', 'кроссовк', 'ботинк', 'сумк', 'рюкзак', 'чемодан', 'часы наручн', 'украшени', 'кольцо', 'серьг', 'шарф', 'шапк'],
  home:    ['мебель', 'диван', 'кроват', 'шкаф', 'стол', 'стул', 'матрас', 'ковёр', 'ковер', 'посуд', 'кастрюл', 'светильник', 'люстр', 'штор', 'зеркал', 'комод', 'полк'],
  hobby:   ['книг', 'настольн игр', 'настолк', 'гитар', 'пианино', 'скрипк', 'коллекц', 'марк', 'монет', 'фигурк', 'пазл', 'мозаик', 'вязан', 'вышив', 'краск', 'холст', 'аквариум', 'попуга', 'кролик', 'котён', 'щен', 'корм для'],
  tech:    ['playstation', 'ps5', 'xbox', 'macbook', 'iphone', 'apple watch', 'ноутбук', 'телефон', 'смартфон', 'наушник', 'монитор', 'консол', 'планшет', 'камер', 'фотоаппарат', 'объектив', 'пылесос', 'принтер', 'проектор', 'колонк', 'увлажнител', 'холодильник', 'микроволнов', 'мультиварк', 'дрель', 'шуруповёрт', 'триммер'],
  service: ['лендинг', 'сайт под ключ', 'приложени', 'дизайн', 'реклам', 'таргет', 'курс', 'услуг', 'урок', 'настройк', 'съёмк', 'видеосъём', 'копирайт', 'фотосесси', 'ремонт', 'клининг', 'уборк', 'перевозк', 'доставк', 'аренда', 'эвакуатор', 'на заказ'],
};

const PRICE_HINTS = [
  [/playstation|ps5|play ?station/i, 48000],
  [/macbook/i, 82000],
  [/iphone/i, 54000],
  [/apple watch/i, 38000],
  [/велосипед|trek/i, 41000],
  [/лендинг|сайт под ключ/i, 60000],
  [/фотосесси|съёмк|фотосессии/i, 35000],
  [/stone island|куртка/i, 22000],
  [/настол/i, 8000],
];

const WANTS_BY_CAT = {
  tech:    'Техника Apple, ноутбук, наушники, игровая консоль',
  service: 'Услуги дизайна, реклама, техника Apple, фотоаппарат',
  home:    'Мебель, техника для дома, посуда',
  kids:    'Детские товары, игрушки, коляска',
  sport:   'Велосипед, лыжи, туристическое снаряжение',
  auto:    'Запчасти, шины, автоаксессуары',
  fashion: 'Одежда, обувь, сумки',
  hobby:   'Книги, настолки, музыкальные инструменты',
  other:   'Техника, вещи для дома, услуги',
};

// Порядок важен: сначала узкие категории («детское», «авто»), потом широкие.
// Раньше при отсутствии совпадений возвращалось 'gadget' — из-за чего любой
// сбой ИИ отправлял объявление в «Технику». Теперь честное «Разное».
const DETECT_ORDER = ['kids', 'auto', 'sport', 'fashion', 'home', 'hobby', 'tech', 'service'];

function detectCat(title, kind) {
  if (kind === 'service') return 'service';
  const t = (title || '').toLowerCase();
  for (const cat of DETECT_ORDER) {
    if (CAT_KEYWORDS[cat].some(w => t.includes(w))) return cat;
  }
  return 'other';
}

// Подсказки цен применяются ТОЛЬКО когда пользователь ничего не ввёл.
// Раньше было `hintPrice(title) || value`, и регулярка /куртка/ ставила
// «Куртке Zara» цену Stone Island в 22 000, перебивая введённые 3 000.
function hintPrice(title) {
  const t = (title || '').toLowerCase();
  for (const [re, price] of PRICE_HINTS) {
    if (re.test(t)) return price;
  }
  return 0;
}

const CAT_KEYS = ['tech', 'service', 'home', 'kids', 'sport', 'auto', 'fashion', 'hobby', 'other'];

const FALLBACK_REASONING = 'Ориентировочная оценка по похожим объявлениям. Точную стоимость обсудим в чате.';

function fallbackDraft(input) {
  const { kind, title, value } = input;
  const cat = detectCat(title, kind);
  let base = Number(value) > 0 ? Number(value) : hintPrice(title);
  if (!base || base <= 0) base = 0;
  const num = Math.round(Number(base));
  const isService = kind === 'service' || cat === 'service';
  const condition = isService ? 'Услуга' : 'Новое или Б/У';
  const desc = isService
    ? 'Готов(а) оказать услугу на условиях бартера: расскажу детали, сроки и объём в чате. Обсудим обмен без денег.'
    : 'Обменяю на условиях бартера. Состояние и комплект уточню в чате — могу прислать доп. фото и видео.';
  return {
    title: title ? title.slice(0, MAX_TITLE) : '',
    cat,
    condition,
    desc,
    wants: WANTS_BY_CAT[cat] || '',
    value: num,
    aiLow: Math.round(num * 0.92),
    aiHigh: Math.round(num * 1.08),
    reasoning: FALLBACK_REASONING,
    confident: false,
    ai: false,
  };
}

// ---------------------------------------------------------------------------
// LLM path (OpenAI-compatible)
// ---------------------------------------------------------------------------

// Категории раньше передавались тремя английскими ключами без пояснений
// (gadget|digital|eco). Модель домысливала их значение: «eco» читала как
// «экологичное», поэтому велосипед, лыжи и кровать уезжали в «технику», а
// книга — в «услуги». Теперь у каждой категории есть русское определение
// и примеры, плюс несколько разобранных случаев ниже.
const SYSTEM_PROMPT = `Ты — эксперт бартерной платформы «Дайбери» в России. Помогаешь пользователю быстро создать качественное объявление обмена без денег (1 балл = 1 рубль).
Пользователь присылает данные: kind (item|service), title, value, wants, возможно фото товара.

КАТЕГОРИИ — выбери РОВНО ОДИН ключ:
- "tech" — Техника: электроника, бытовая техника, инструмент. Пылесос, принтер, колонки, проектор, объектив, увлажнитель, триммер, штопор.
- "service" — Услуги: любые работы и время человека, а также аренда чего-либо. Клининг, перевозка, эвакуатор, аренда экскаватора, сайт под ключ, фотосессия, ремонт, обучение, хендмейд на заказ.
- "home" — Дом: мебель, интерьер, посуда, текстиль. Кровать, шкаф, матрас, лампа, ковёр, кастрюли.
- "kids" — Детям: всё для детей. Игрушки, коляски, санки, детская мебель, детский велосипед и электромобиль.
- "sport" — Спорт и отдых: велосипеды, лыжи, коньки, туризм, рыбалка, мангалы и наборы для шашлыка.
- "auto" — Авто: автомобили, запчасти, шины, диски, автоаксессуары.
- "fashion" — Одежда: одежда, обувь, сумки, украшения, аксессуары для внешности, чемоданы.
- "hobby" — Хобби: книги, настольные игры, коллекционное, музыкальные инструменты, творчество и материалы для него, животные и товары для них.
- "other" — Разное: только если ничего выше честно не подходит (например стройматериалы).

Как выбирать:
- Смотри на НАЗНАЧЕНИЕ вещи, а не на то, из чего она сделана и есть ли в ней электроника.
- Детская вещь идёт в "kids", даже если это техника или спорт (детский электромобиль → kids).
- Если предлагают не саму вещь, а её использование или работу с ней — это "service" (аренда экскаватора → service, сам экскаватор → tech).
- kind=service ВСЕГДА даёт cat=service.
- Разбор примеров: книга → hobby; кролики → hobby; чемодан → fashion; тормозные диски → auto; матрас → home; лыжи → sport; набор для шашлыка → sport; макраме на заказ → service; готовое панно макраме → hobby.

Верни ТОЛЬКО JSON без markdown и без пояснений по схеме:
{
  "title": "короткое понятное название (<= 60 символов)",
  "cat": "один ключ из списка выше",
  "condition": "Отличное|Хорошее|Новое или Б/У|Услуга",
  "desc": "2-4 предложения: что это, комплект, состояние. Без выдуманных историй и причин продажи (<= 400 символов)",
  "wants": "конкретные вещи/услуги/категории, которые хочет получить в обмен, через запятую (<= 120 символов)",
  "value": 45000,
  "aiLow": 41000,
  "aiHigh": 49000,
  "confident": true,
  "reasoning": "1 предложение, на чём основана оценка (<= 160 символов)"
}
Правила:
- value, aiLow, aiHigh — целые числа > 0, строго aiLow < value < aiHigh.
- Если пользователь уже указал value > 0 — это его цена, НЕ меняй её больше чем на 20%, а диапазон строй вокруг неё.
- "confident" — false, если ты не знаешь реальной рыночной цены этой вещи и число по сути наугад (редкое, самодельное, без модели в названии). Не выдумывай уверенность.
- wants — реальные предметы (например: «техника Apple, велосипед, услуги дизайна»). ЗАПРЕЩЕНО писать имена полей схемы или фразы вроде «на что готовы обменять», «ваши вещи».
- Не выдумывай бренды, модели и детали, которых нет в данных. Название (title) — из названия или фото пользователя.
- Если title пустой и фото нет — оставь title пустым, остальные поля по минимуму.
- Отвечай на русском.`;

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callLLM(messages) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.4,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        lastErr = new Error(`AI API ${res.status}: ${err.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        lastErr = new Error('AI API: пустой ответ');
        continue;
      }
      return content;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw lastErr || new Error('AI API: повторы исчерпаны');
}

function sanitizeDraft(d, input, fallback) {
  const value = Math.max(0, Math.round(Number(d.value) || fallback.value));
  const cat = CAT_KEYS.includes(d.cat) ? d.cat : fallback.cat;
  const condition = ['Отличное', 'Хорошее', 'Новое или Б/У', 'Услуга'].includes(d.condition) ? d.condition : fallback.condition;
  let aiLow = Math.max(0, Math.round(Number(d.aiLow) || Math.round(value * 0.92)));
  let aiHigh = Math.max(0, Math.round(Number(d.aiHigh) || Math.round(value * 1.08)));
  if (aiLow >= value) aiLow = Math.max(0, Math.round(value * 0.92));
  if (aiHigh <= value) aiHigh = Math.round(value * 1.08);
  if (aiLow > value) [aiLow, aiHigh] = [Math.round(value * 0.92), Math.round(value * 1.08)];
  return {
    title: (d.title || fallback.title || '').trim().slice(0, MAX_TITLE),
    cat,
    condition,
    desc: (d.desc || fallback.desc || '').trim().slice(0, MAX_DESC),
    wants: (d.wants || fallback.wants || '').trim().slice(0, MAX_WANTS),
    value,
    aiLow,
    aiHigh,
    reasoning: (d.reasoning || FALLBACK_REASONING).trim().slice(0, 240),
    // модель сама помечает, знает ли она реальную цену; при отсутствии поля
    // считаем, что уверена — иначе старые ответы все стали бы «наугад»
    confident: d.confident !== false,
    ai: true,
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function analyzeListing(input) {
  const fallback = fallbackDraft(input);
  if (!API_KEY) {
    console.warn('[ai] AI_API_KEY не задан — использован быстрый черновик (fallback)');
    return fallback;
  }
  const { title, photo, kind, value, wants, city } = input || {};
  const hasPhoto = typeof photo === 'string' && photo.startsWith('data:image/') && photo.length <= MAX_PHOTO_CHARS;

  const content = { kind: kind || 'item', title: title || '', value: Number(value) || 0, wants: wants || '', city: city || '', hasPhoto };
  const userMsg = hasPhoto
    ? [
        { type: 'text', text: `Данные объявления: ${JSON.stringify(content)}` },
        { type: 'image_url', image_url: { url: photo } },
      ]
    : `Данные объявления: ${JSON.stringify(content)}`;

  try {
    const raw = await callLLM([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ]);
    const parsed = extractJSON(raw);
    if (!parsed) throw new Error('AI API: JSON не распарсен');
    return sanitizeDraft(parsed, input, fallback);
  } catch (e) {
    console.warn('[ai] LLM call failed, using fallback:', e.message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Semantic matching (embeddings with deterministic token-overlap fallback)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'для', 'что', 'это', 'или', 'если', 'без', 'как', 'ещё', 'еще', 'все', 'там', 'тут', 'ваш', 'ваши', 'ваша',
  'готов', 'готова', 'готовы', 'могу', 'есть', 'нужно', 'надо', 'буду', 'будут', 'ищу', 'меняю', 'отдам',
  'отдаю', 'меняться', 'меняюсь', 'и', 'в', 'на', 'с', 'по', 'не', 'от', 'за', 'а', 'у', 'о', 'из', 'до',
  'при', 'про', 'к', 'ну', 'вот', 'так', 'более', 'менее', 'только', 'чтобы', 'можно', 'свою', 'свои',
  'свой', 'его', 'её', 'ее', 'них', 'их', 'кто', 'который', 'которая', 'очень', 'хороший', 'хорошая',
  'хорошее', 'новый', 'новая', 'новое', 'также', 'уже', 'быть', 'обмен', 'обмена', 'обменяю', 'обменя',
]);

function tokens(t) {
  return (t || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .split(' ')
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function tokenSim(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.sqrt(A.size * B.size);
}

function cosine(a, b) {
  if (!a || !b || !a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const offerText = l => `${l.title || ''} ${l.desc || ''}`.trim();
const demandText = l => (l.wants || '').trim();

// Горячий кэш векторов в памяти процесса. Ограничен, иначе за долгий uptime
// вырастает на весь корпус объявлений (вектор ~2.5k float на текст).
const EMBED_MEM_MAX = 2000;
const embedMem = new Map();
const embedKey = t => `emb|${EMBED_MODEL}|${createHash('sha1').update(t).digest('hex')}`;

function memoize(text, vector) {
  if (embedMem.size >= EMBED_MEM_MAX) {
    // FIFO: Map хранит порядок вставки, выкидываем самый старый
    embedMem.delete(embedMem.keys().next().value);
  }
  embedMem.set(text, vector);
}

// Returns Map<text, vector>. Batches uncached texts into a single API call.
// Falls back to an empty map (caller then uses tokenSim) on any failure.
export async function embedMany(texts) {
  const uniq = [...new Set(texts.filter(Boolean))];
  const out = new Map();
  const missing = [];
  for (const t of uniq) {
    if (embedMem.has(t)) out.set(t, embedMem.get(t));
    else missing.push(t);
  }
  if (!missing.length || !API_KEY) return out;

  try {
    const rows = await prisma.aiCache.findMany({ where: { key: { in: missing.map(embedKey) } } });
    const byKey = new Map(rows.map(r => [r.key, JSON.parse(r.payload)]));
    const still = [];
    for (const t of missing) {
      const v = byKey.get(embedKey(t));
      if (Array.isArray(v)) { memoize(t, v); out.set(t, v); } else still.push(t);
    }
    if (!still.length) return out;

    const res = await fetch(`${BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: still }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}`);
    const data = await res.json();
    const pairs = [];
    (data.data || []).forEach((d, i) => {
      if (Array.isArray(d.embedding) && still[i]) pairs.push([still[i], d.embedding]);
    });
    for (const [t, v] of pairs) { memoize(t, v); out.set(t, v); }
    try {
      await prisma.$transaction(pairs.map(([t, v]) =>
        prisma.aiCache.upsert({
          where: { key: embedKey(t) },
          update: {},
          create: { key: embedKey(t), model: EMBED_MODEL, payload: JSON.stringify(v) },
        }),
      ));
    } catch (e) {
      console.warn('[ai] embed cache persist failed:', e.message);
    }
  } catch (e) {
    console.warn('[ai] embed failed, using token overlap:', e.message);
  }
  return out;
}

function sim(vectors, a, b) {
  const va = vectors.get(a), vb = vectors.get(b);
  if (va && vb) return cosine(va, vb);
  return tokenSim(a, b);
}

// Real matching: semantic similarity between the user's wants (profile) / lots
// and other lots, blended with price proximity. Falls back to cross-demand
// ranking when there is no signal at all.
const first = t => String(t || '').split(',')[0].trim();
const clampScore = n => Math.max(0, Math.min(99, Math.round(n)));
const CAT_LABELS = { gadget: 'Техника', digital: 'Услуги и цифра', eco: 'Вещи и эко' };

// picks the comma-separated want that matches the other lot best (cheap, no extra embeddings)
function bestWant(wantsStr, lot) {
  const parts = String(wantsStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return first(wantsStr);
  const title = String(lot?.title || '');
  const catLabel = CAT_LABELS[lot?.cat] || '';
  let best = parts[0], bestS = -1;
  for (const p of parts) {
    const s = Math.max(tokenSim(p, title), tokenSim(p, catLabel));
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

export async function computeMatches({ myLots = [], others = [], myWants = '' }) {
  if (!others.length) return [];

  const texts = [];
  for (const l of myLots) { texts.push(offerText(l), demandText(l)); }
  for (const l of others) { texts.push(offerText(l), demandText(l)); }
  if (myWants) texts.push(myWants);
  const vectors = await embedMany(texts);

  const my = myLots[0];
  const myOffer = my ? offerText(my) : '';
  const myDemand = (myWants || '').trim() || (my ? demandText(my) : '');

  let matches;

  if (my && myDemand) {
    matches = others.map(o => {
      const s1 = sim(vectors, demandText(o), myOffer); // они хотят то, что я отдаю
      const s2 = sim(vectors, offerText(o), myDemand); // я хочу то, что они отдают
      const s = Math.max(s1, s2);
      const denom = Math.max(o.value, my.value, 1);
      const priceScore = denom > 0 ? Math.max(0, 1 - Math.abs(o.value - my.value) / denom) : 0;
      const score = clampScore(100 * (0.7 * s + 0.3 * priceScore));
      const owner = o.owner?.name || 'партнёр';
      const why = s2 >= s1
        ? `Вы ищете «${bestWant(myDemand, o)}», а ${owner} отдаёт «${first(o.title)}»`
        : `${owner} ищет «${first(my.title)}» — а вы как раз это отдаёте`;
      return {
        lot: o,
        score,
        why,
        topup: Math.abs(o.value - my.value),
        dir: o.value > my.value ? 'you-pay' : 'they-pay',
      };
    });
  } else if (myDemand) {
    // нет своих лотов, но есть хотелки профиля — «вам подойдёт»
    matches = others.map(o => {
      const s = sim(vectors, offerText(o), myDemand);
      const popularity = Math.min(0.12, (o.views || 0) / 600 * 0.12 + (o.hot ? 0.04 : 0));
      const score = clampScore(100 * Math.min(1, s * 1.45 + popularity));
      const owner = o.owner?.name || 'партнёр';
      const why = `Вы ищете «${bestWant(myDemand, o)}» — ${owner} отдаёт «${first(o.title)}»`;
      return { lot: o, score, why, topup: 0, dir: 'they-pay' };
    });
  } else {
    // нет хотелок и своих лотов — ранжирование по перекрёстному спросу.
    // Ветка квадратична, поэтому считаем её на ограниченной выборке.
    const pool = others.slice(0, MAX_CROSS_DEMAND_LOTS);
    matches = pool.map(o => {
      const offers = pool.filter(x => x.id !== o.id);
      const scores = offers.map(x => sim(vectors, offerText(o), demandText(x)));
      const best = Math.max(0, ...scores);
      const bestIdx = scores.indexOf(best);
      const topX = offers[bestIdx];
      const popularity = Math.min(0.25, ((o.views || 0) / 600) * 0.25 + (o.hot ? 0.06 : 0));
      const score = clampScore(100 * Math.min(1, best * 1.35 + popularity));
      const why = topX
        ? `${topX.owner?.name || 'Кто-то'} хочет получить «${first(o.title)}» в обмен`
        : 'Популярный лот для обмена';
      return { lot: o, score, why, topup: 0, dir: 'they-pay' };
    });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ---------------------------------------------------------------------------
// Wants wizard — step-by-step questions to build the user's wishlist
// ---------------------------------------------------------------------------

const WANTS_SYSTEM_PROMPT = `Ты — помощник бартерной платформы «Дайбери». Помогаешь пользователю сформулировать список «что я хочу получить в обмен» (хотелки) для его профиля.
Веди короткий диалог: задавай уточняющие вопросы ПО ОДНОМУ (всего не больше 3), чтобы понять, что человеку сейчас нужно — техника, услуги, вещи для дома, хобби и т.д. На каждый вопрос предлагай 3-4 конкретных варианта-подсказки.
Когда соберёшь достаточно данных (или после 3 вопросов) — сформируй итоговый список.
Верни ТОЛЬКО JSON без markdown:
- если нужен следующий вопрос: {"done": false, "question": "текст вопроса", "suggestions": ["вариант 1", "вариант 2", "вариант 3"]}
- если готово: {"done": true, "wants": "ноутбук, услуги дизайна, фотоаппарат"} — список через запятую, 3-6 конкретных вещей/услуг.
Контекст — массив предыдущих вопросов и ответов вида {"q": "...", "a": "..."}. Отвечай на русском, без воды.`;

export async function askWants(context = []) {
  if (!API_KEY) {
    console.warn('[ai] AI_API_KEY не задан — wizard недоступен');
    return { done: true, wants: '' };
  }
  const raw = await callLLM([
    { role: 'system', content: WANTS_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(context) },
  ]);
  const parsed = extractJSON(raw);
  if (!parsed) throw new Error('AI API: JSON не распарсен');
  if (parsed.done) {
    return { done: true, wants: String(parsed.wants || '').trim().slice(0, 300) };
  }
  return {
    done: false,
    question: String(parsed.question || 'Что вам сейчас нужно?').slice(0, 200),
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map(s => String(s).trim().slice(0, 40)).filter(Boolean).slice(0, 4)
      : [],
  };
}
