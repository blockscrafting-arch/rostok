/**
 * Утилиты для работы с текстом: обрезка по границе предложения (для лимита Telegram).
 */

/**
 * Убирает с первой строки артефакты: префикс «Заголовок:» / «{Заголовок}:», обрамление кавычками.
 */
export function cleanArticleFirstLine(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return text;
  let first = lines[0].trim();
  first = first.replace(/^(\{Заголовок\}|Заголовок):\s*/i, '').trim();
  if (first.length >= 2 && first.startsWith('"') && first.endsWith('"')) {
    first = first.slice(1, -1).trim();
  }
  lines[0] = first;
  return lines.join('\n');
}

/**
 * Обрезает текст до limit символов по последней границе предложения (точка + пробел).
 * Если подходящей точки нет — жёсткий срез на limit.
 */
export function truncateAtSentence(text: string, limit = 4000): string {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf('. ', limit - 1);
  if (cut > limit * 0.5) return text.slice(0, cut + 1).trimEnd();
  return text.slice(0, limit);
}
