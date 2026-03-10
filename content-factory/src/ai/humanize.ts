/**
 * Очеловечивание: Промпт 3 + ДНК бренда, финальный текст до 4000 символов.
 */
import { openrouter } from './client';
import { config } from '../config';
import { truncateAtSentence } from '../utils/text';
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
    'Перепиши текст в стиле бренда, сохрани смысл. Итоговый текст СТРОГО до 4000 символов, ЗАВЕРШЁННЫЙ. Сохрани структуру и длину черновика. Не обрезай концовку с призывом к действию. Не изменяй первую строку текста — это заголовок статьи, он должен остаться точно таким же. UTM-ссылку в текст не вставляй.';
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
    max_tokens: 1500,
  });

  const text = truncateAtSentence(res.choices[0]?.message?.content ?? '', 4000);
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
