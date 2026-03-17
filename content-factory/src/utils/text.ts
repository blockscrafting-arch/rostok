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

const CTA_MARKER = /\[ССЫЛКА НА КАТАЛОГ\]/gi;

/**
 * Заменяет маркер [ССЫЛКА НА КАТАЛОГ] на реальную UTM-ссылку.
 * — 2+ маркеров: заменяем все на UTM-ссылку.
 * — 1 маркер: заменяем + добавляем блок с ссылкой в конец.
 * — 0 маркеров: вставляем ссылку нативно в середину (после ~50% абзацев) и блоком в конец.
 */
export function insertCatalogLinks(text: string, utmUrl: string): string {
  if (!utmUrl.trim()) return text;
  const trimmed = text.trimEnd();
  if (!trimmed) return text;

  const matches = trimmed.match(CTA_MARKER);
  const count = matches?.length ?? 0;
  CTA_MARKER.lastIndex = 0;

  if (count >= 2) {
    return trimmed.replace(CTA_MARKER, utmUrl);
  }
  if (count === 1) {
    const replaced = trimmed.replace(CTA_MARKER, utmUrl);
    return `${replaced}\n\nПерейти на сайт: ${utmUrl}`;
  }

  // 0 маркеров: вставить в середину и в конец
  const paragraphs = trimmed.split(/\n\n+/);
  const insertIndex = Math.max(1, Math.floor(paragraphs.length * 0.5));
  const block = `Перейти на сайт: ${utmUrl}`;
  const mid = paragraphs.slice(0, insertIndex).join('\n\n');
  const afterMid = paragraphs.slice(insertIndex).join('\n\n');
  const withMiddle = afterMid
    ? `${mid}\n\n${block}\n\n${afterMid}`
    : `${mid}\n\n${block}`;
  return `${withMiddle.trimEnd()}\n\n${block}`;
}
