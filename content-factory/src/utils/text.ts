/**
 * Утилиты для работы с текстом: обрезка по границе предложения (для лимита Telegram).
 */

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
