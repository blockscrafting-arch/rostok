/**
 * SEO-черновик статьи: Промпт 2 + роль + факты из граундинга (+ опционально editorComment).
 */
import { openrouter } from './client';
import { config } from '../config';
import type { TokenUsage } from '../types';

/**
 * Черновик по одному заголовку и фактам. Подзаголовки (H2) модель задаёт сама по смыслу текста.
 */
export async function generateDraft(
  headline: string,
  keywords: string[],
  prompt2: string,
  role: string,
  facts: string,
  editorComment?: string | null,
  textModelOverride?: string
): Promise<{ text: string; usage: TokenUsage }> {
  const model = textModelOverride?.trim() || config.openrouter.textModel;
  const kw = keywords.join(', ');
  let userContent = `Заголовок: "${headline}"
Ключевые слова: ${kw}

Проверенные факты из веб-источников:
${facts}

Напиши SEO-статью до 4000 символов, опираясь на эти факты. Структурируй статью с 3–5 логичными подзаголовками второго уровня (##), которые вытекают из содержания.`;
  if (editorComment) {
    userContent += `\n\nЗамечание редактора (обязательно учти при генерации): ${editorComment}`;
  }

  const systemContent = prompt2
    ? prompt2.replace(/\{role\}/g, role)
    : `Ты — ${role}. Пиши экспертную статью для блога питомника. Используй только проверенные факты из блока выше. До 4000 символов.`;

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
