/**
 * Нормализация идентификатора чата/канала для Telegram Bot API (sendMessage.chat_id).
 * См. https://core.telegram.org/bots/api#sendmessage — username в формате @channelusername или числовой id.
 */

/** Числовой id чата/канала (в т.ч. -100… для супергрупп/каналов). */
export function isTelegramNumericChatId(value: string): boolean {
  const s = value.trim();
  return /^-?\d+$/.test(s);
}

/**
 * Подготовить chat_id для вызова API: trim, для публичного username без @ — добавить @.
 */
export function normalizeTelegramChannelIdForSend(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (isTelegramNumericChatId(s)) return s;
  if (s.startsWith('@')) return s;
  // Публичный username: обычно 5–32 символа (правила Telegram для @username)
  if (/^[a-zA-Z0-9_]{5,32}$/.test(s)) return `@${s}`;
  return s;
}

/**
 * Публичная ссылка на пост после sendMessage.
 * Для @username: https://t.me/username/msgId
 * Для id вида -100…: https://t.me/c/{internalId}/msgId (internalId без префикса -100)
 * Иначе пустая строка — нет однозначного публичного URL.
 */
export function buildTelegramPostUrl(chatIdUsedForSend: string, messageId: number): string {
  const c = chatIdUsedForSend.trim();
  const m100 = c.match(/^-100(\d+)$/);
  if (m100) return `https://t.me/c/${m100[1]}/${messageId}`;
  if (c.startsWith('@')) {
    const u = c.slice(1);
    if (/^[a-zA-Z0-9_]{5,32}$/.test(u)) return `https://t.me/${u}/${messageId}`;
  } else if (/^[a-zA-Z0-9_]{5,32}$/.test(c)) {
    return `https://t.me/${c}/${messageId}`;
  }
  return '';
}
