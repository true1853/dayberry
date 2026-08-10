// data.js — mock content for the Дай бери prototype (credits ≈ rubles)

export const ME = { id: 'me', name: 'Аня', initials: 'А', rating: 4.9, deals: 23, city: 'Москва', phone: '+7 999 123-45-67', wants: 'ноутбук, велосипед, услуги дизайна' };

export const U = {
  kirill:  { name: 'Кирилл М.',   initials: 'К', rating: 4.8, deals: 41, city: 'Москва',          online: true },
  dasha:   { name: 'Даша П.',     initials: 'Д', rating: 5.0, deals: 67, city: 'Москва',          online: false },
  oleg:    { name: 'Олег Т.',     initials: 'О', rating: 4.7, deals: 18, city: 'Санкт-Петербург', online: true },
  marina:  { name: 'Марина В.',   initials: 'М', rating: 4.9, deals: 52, city: 'Москва',          online: false },
  studio:  { name: 'Studio Pixel',initials: 'S', rating: 5.0, deals: 88, city: 'удалённо', pro: true, online: true },
  roma:    { name: 'Рома К.',     initials: 'Р', rating: 4.6, deals: 12, city: 'Казань',           online: false },
  lena:    { name: 'Лена Ж.',     initials: 'Л', rating: 4.9, deals: 34, city: 'Москва',           online: true },
};

// cat → label + colors
export const CAT = {
  digital: { label: 'Услуги и цифра', short: 'Digital', color: 'var(--c-digital)', soft: 'var(--c-digital-soft)' },
  gadget:  { label: 'Техника',        short: 'Gadgets', color: 'var(--c-gadget)',  soft: 'var(--c-gadget-soft)' },
  eco:     { label: 'Вещи и эко',     short: 'Eco',     color: 'var(--c-eco)',     soft: 'var(--c-eco-soft)' },
};

export const LOTS = [
  {
    id: 'l1', title: 'PlayStation 5 Slim + 2 геймпада', cat: 'gadget', value: 48000,
    aiLow: 44000, aiHigh: 52000, photo: 'PS5 SLIM',
    photoUrl: 'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=800&q=80',
    photos: 6, condition: 'Отличное', posted: '2 ч назад',
    owner: 'kirill', wants: 'Apple Watch, MacBook, либо услуги дизайна',
    desc: 'Брал год назад, в идеале. Полный комплект, коробка, чек. Готов на технику Apple или равноценные услуги.',
    hot: true, views: 312,
  },
  {
    id: 'l2', title: 'Лендинг под ключ + анимации', cat: 'digital', value: 60000,
    aiLow: 55000, aiHigh: 70000, photo: 'UI / WEB',
    photoUrl: 'https://images.unsplash.com/photo-1547658719-da2b51169166?w=800&q=80',
    photos: 4, condition: 'Услуга', posted: 'сегодня',
    owner: 'studio', wants: 'Техника Apple, фотоаппарат, реклама/таргет',
    desc: 'Сделаю продающий лендинг: дизайн в Figma + вёрстка + базовые анимации. Срок 5–7 дней. Портфолио внутри.',
    hot: true, views: 198,
  },
  {
    id: 'l3', title: 'MacBook Air M2, 256 ГБ', cat: 'gadget', value: 82000,
    aiLow: 78000, aiHigh: 88000, photo: 'MACBOOK',
    photoUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80',
    photos: 8, condition: 'Хорошее', posted: 'вчера',
    owner: 'dasha', wants: 'iPhone 14/15, велосипед, дизайн-услуги',
    desc: 'Циклов 80, батарея 96%. Лёгкие следы на дне. Хочу обновиться на iPhone либо взять велосипед на лето.',
    views: 540,
  },
  {
    id: 'l4', title: 'Велосипед Trek Marlin 7', cat: 'eco', value: 41000,
    aiLow: 36000, aiHigh: 45000, photo: 'BIKE',
    photoUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    photos: 5, condition: 'Хорошее', posted: '3 дня назад',
    owner: 'oleg', wants: 'Игровая консоль, монитор, фотоаппарат',
    desc: 'Рама M (19"). Обслужен, новая цепь и колодки. Идеален для города и лёгкого XC.',
    views: 176,
  },
  {
    id: 'l5', title: 'Серия из 5 фото-сессий', cat: 'digital', value: 35000,
    aiLow: 30000, aiHigh: 40000, photo: 'PHOTO',
    photoUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80',
    photos: 3, condition: 'Услуга', posted: '5 ч назад',
    owner: 'marina', wants: 'Техника, ноутбук, бьюти-услуги',
    desc: 'Предметная или lifestyle съёмка для маркетплейсов. 5 сессий, обработка включена.',
    views: 91,
  },
  {
    id: 'l6', title: 'iPhone 14, 128 ГБ, синий', cat: 'gadget', value: 54000,
    aiLow: 50000, aiHigh: 58000, photo: 'IPHONE 14',
    photoUrl: 'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800&q=80',
    photos: 7, condition: 'Отличное', posted: '1 ч назад',
    owner: 'roma', wants: 'MacBook, PlayStation, наушники',
    desc: 'Идеальное состояние, всё работает, акб 91%. Доплата возможна баллами.',
    hot: true, views: 410,
  },
  {
    id: 'l7', title: 'Сет настолок: Каркассон, Манчкин', cat: 'eco', value: 8000,
    aiLow: 6500, aiHigh: 9000, photo: 'BOARD GAMES',
    photoUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800&q=80',
    photos: 2, condition: 'Хорошее', posted: 'вчера',
    owner: 'lena', wants: 'Книги, другие настолки, кофе',
    desc: '6 игр с дополнениями. Всё в комплекте, играли аккуратно.',
    views: 64,
  },
  {
    id: 'l8', title: 'Куртка Stone Island, разм. L', cat: 'eco', value: 22000,
    aiLow: 18000, aiHigh: 26000, photo: 'JACKET',
    photoUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80',
    photos: 4, condition: 'Отличное', posted: '6 ч назад',
    owner: 'dasha', wants: 'Кроссовки, гаджеты, эко-товары',
    desc: 'Оригинал, носилась пару раз. Бирки и чек на месте.',
    views: 128,
  },
];

export const lot = (id) => LOTS.find(l => l.id === id);

export const MY_LOT = {
  id: 'mine', title: 'Apple Watch Series 9, 45 мм', cat: 'gadget', value: 38000,
  aiLow: 35000, aiHigh: 42000, valuationSource: 'ai', photo: 'APPLE WATCH',
  photoUrl: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=800&q=80',
  photos: 5, condition: 'Отличное',
  owner: 'me', wants: 'PlayStation, лендинг, велосипед',
  desc: 'Series 9, 45 мм, в идеале. Коробка, ремешки, зарядка.',
};

export const MATCHES = [
  { id: 'm1', lot: 'l1', score: 96, why: 'Хочет Apple Watch — а вы как раз отдаёте его', topup: 10000, dir: 'you-pay' },
  { id: 'm2', lot: 'l2', score: 91, why: 'Студии нужна техника Apple под обмен', topup: 22000, dir: 'you-pay' },
  { id: 'm4', lot: 'l4', score: 84, why: 'Велосипед близок к вашей оценке — доплата символическая', topup: 3000, dir: 'they-pay' },
];

export const CHAIN = {
  id: 'ch1', score: 94,
  steps: [
    { who: 'me',     gives: 'Apple Watch S9', photoUrl: 'https://images.unsplash.com/photo-1551816230-ef5deaed4a26?w=400&q=80', to: 'kirill', value: 38000 },
    { who: 'kirill', gives: 'PlayStation 5',  photoUrl: 'https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=400&q=80', to: 'dasha',  value: 48000 },
    { who: 'dasha',  gives: 'MacBook Air M2', photoUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80', to: 'me',     value: 82000 },
  ],
  note: 'Каждый получает желаемое. Разницу в стоимости система выравнивает баллами через эскроу.',
};

export const WALLET = {
  balance: 38000,
  escrow: 10000,
  delta30: +12000,
  demurrageInDays: 164,
  tx: [
    { id: 't1', kind: 'escrow-in',  title: 'Эскроу · обмен PS5', sub: 'Доплата заморожена до подтверждения', amt: 10000, when: 'Сегодня, 14:20', status: 'held' },
    { id: 't2', kind: 'spend',      title: 'Лендинг · Studio Pixel', sub: 'Списание за услугу', amt: -60000, when: 'Вчера', status: 'done' },
    { id: 't3', kind: 'earn',       title: 'Продан монитор LG', sub: 'Начислено после получения', amt: +28000, when: '12 мая', status: 'done' },
    { id: 't4', kind: 'bonus',      title: 'Бонус за приглашение друга', sub: 'Реферальная программа', amt: +1000, when: '8 мая', status: 'done' },
    { id: 't5', kind: 'earn',       title: 'Обмен: куртка → баллы', sub: 'Доплата от партнёра', amt: +6000, when: '3 мая', status: 'done' },
  ],
};

export const CHAT_MSGS = [
  { from: 'them', text: 'Привет! Готов обменять PS5 на ваши Apple Watch + доплату баллами 👍', t: '14:02' },
  { from: 'me',   text: 'Привет! Да, всё верно. Оценка часов — 38 000, доплачу 10 000 баллами.', t: '14:05' },
  { from: 'them', text: 'Отлично. Тогда я открываю сделку, баллы уйдут в эскроу.', t: '14:08' },
  { from: 'sys',  text: '10 000 Б заморожены в эскроу до подтверждения получения.', t: '14:09' },
  { from: 'me',   text: 'Принял. Могу забрать сегодня у метро Парк Культуры в 19:00?', t: '14:12' },
  { from: 'them', text: 'Договорились, буду 👌', t: '14:13' },
];

export const CHATLIST = [
  { id: 'c1', owner: 'kirill', last: 'Договорились, буду 👌', t: '14:13', unread: 0, deal: 'PS5 ↔ Apple Watch', stage: 'meet' },
  { id: 'c2', owner: 'studio', last: 'Скинул(а) превью первого экрана', t: '12:40', unread: 2, deal: 'Лендинг ↔ техника', stage: 'progress' },
  { id: 'c3', owner: 'dasha',  last: 'А цепочка из трёх — это надёжно?', t: 'вчера', unread: 0, deal: 'Цепочка обмена', stage: 'chain' },
];
