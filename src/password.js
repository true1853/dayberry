// password.js — требования к паролю, общие для клиента и сервера.
//
// Раньше проверка была одна: «минимум 6 символов», поэтому проходили «123456»
// и «qwerty». Аккаунт здесь держит баланс баллов, эскроу и переписку по
// сделкам — подобранный пароль стоит денег, а не только неудобства.
//
// Планку держим низкой намеренно: восстановление пароля пока ручное (через
// администратора), и слишком строгие правила на старте дадут больше потерянных
// аккаунтов, чем взломанных.

export const MIN_LENGTH = 8;

// Верхушка утечек, из которой и подбирают в первую очередь.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'password',
  'password1', 'passw0rd', 'iloveyou', 'princess', 'football', 'baseball',
  'superman', 'sunshine', 'trustno1', 'welcome1', 'admin123', 'qazwsxedc',
  '11111111', '00000000', '87654321', 'йцукенгш', 'ytrewq123', 'zxcvbnm1',
]);

/**
 * @returns {string|null} текст ошибки или null, если пароль годится
 */
export function checkPassword(password) {
  const p = String(password || '');
  if (p.length < MIN_LENGTH) return `Пароль — минимум ${MIN_LENGTH} символов`;
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(p)) return 'Добавьте в пароль хотя бы одну букву';
  if (!/\d/.test(p)) return 'Добавьте в пароль хотя бы одну цифру';
  if (COMMON.has(p.toLowerCase())) return 'Такой пароль подбирают первым — придумайте другой';
  if (/^(.)\1+$/.test(p)) return 'Пароль из одного повторяющегося символа не годится';
  return null;
}

/** Подсказка под полем: что ещё осталось выполнить. 0–3. */
export function passwordScore(password) {
  const p = String(password || '');
  let n = 0;
  if (p.length >= MIN_LENGTH) n++;
  if (/[a-zA-Zа-яА-ЯёЁ]/.test(p) && /\d/.test(p)) n++;
  if (p.length >= 12 || /[^\w\sа-яА-ЯёЁ]/.test(p)) n++;
  return n;
}
