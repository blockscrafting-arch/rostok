/**
 * Очеловечивание: Промпт 3 + ДНК бренда, финальный текст до 4000 символов.
 */
import { openrouter } from './client';
import { config } from '../config';
import type { TokenUsage } from '../types';

export async function humanize(
  draft: string,
  prompt3: string,
  dnaBrandText: string,
  editorComment?: string | null,
  textModelOverride?: string
): Promise<{ text: string; usage: TokenUsage }> {
  const model = textModelOverride?.trim() || config.openrouter.textModel;
  const systemContent =
    prompt3?.trim() ||
    'Перепиши текст в стиле бренда, сохрани смысл. Строго до 4000 символов. UTM-ссылку в текст не вставляй.';
  let userContent = `Черновик статьи:
---
${draft}
---

ДНК бренда и целевая аудитория:
${dnaBrandText || 'Не указано.'}`;
  if (editorComment) {
    userContent += `\n\nЗамечание редактора (обязательно учти при генерации): ${editorComment}`;
  }

  const res = await openrouter.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    max_tokens: 2048,
  });

  const text = (res.choices[0]?.message?.content ?? '').slice(0, 4000);
  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: u?.cost ?? u?.total_cost,
    model,
  };
  return { text, usage };
}
