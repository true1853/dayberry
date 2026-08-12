// src/reports.js — причины жалоб.
//
// Лежат отдельным модулем, а не в server/actions.js: тот файл помечен
// 'use server' и оттуда можно экспортировать только асинхронные функции —
// константа там валит приложение уже в рантайме, сборка её пропускает.
export const REPORT_REASONS = [
  { id: 'forbidden', label: 'Запрещённый товар' },
  { id: 'scam', label: 'Обман или мошенничество' },
  { id: 'wrong', label: 'Не соответствует описанию' },
  { id: 'stolen_photo', label: 'Чужие фотографии' },
  { id: 'spam', label: 'Спам или реклама' },
  { id: 'other', label: 'Другое' },
];

export const reasonLabel = (id) => REPORT_REASONS.find(r => r.id === id)?.label || 'Другое';
