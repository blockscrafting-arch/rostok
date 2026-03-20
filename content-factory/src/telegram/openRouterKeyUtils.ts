/** Префикс callback_data для кнопки «Присвоить ключ» (Telegram max 64 байта). */
export const OPENROUTER_KEY_CALLBACK_PREFIX = 'ork:';

export function buildAssignOpenRouterCallbackData(clientId: string): string {
  const id = clientId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid clientId for callback_data');
  }
  return `${OPENROUTER_KEY_CALLBACK_PREFIX}${id}`;
}

export function isPlausibleOpenRouterKey(value: string): boolean {
  const t = value.trim();
  return t.length >= 24 && /^sk-or-[a-zA-Z0-9_-]+$/.test(t);
}
