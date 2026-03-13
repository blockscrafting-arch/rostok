/**
 * SEO-черновик статьи: Промпт 2 + роль + факты из граундинга (+ опционально editorComment).
 */
import type OpenAI from 'openai';
import { config } from '../config';
import { truncateAtSentence } from '../utils/text';
import type { TokenUsage } from '../types';

/**
 * Черновик по одному заголовку и фактам. Подзаголовки (H2) модель задаёт сама по смыслу текста.
 */
export async function generateDraft(
  aiClient: OpenAI,
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
  let userContent = `Тема статьи: ${headline}
Ключевые слова: ${kw}

Проверенные факты из веб-источников:
${facts}

ВАЖНО: первой строкой статьи выведи этот заголовок как есть — без кавычек, без префикса «Заголовок:» или «{Заголовок}:», без изменений:
${headline}

Напиши SEO-статью СТРОГО до 4000 символов, опираясь на эти факты. Статья должна быть ЗАВЕРШЁННОЙ. Следи за длиной: когда приближаешься к 4000 символам — заканчивай мысль. Структурируй статью с 3–5 логичными подзаголовками второго уровня (##), которые вытекают из содержания. Призывы к действию (CTA) задаются на этапе стилизации — здесь только основной текст.`;
  if (editorComment) {
    userContent += `\n\nЗамечание редактора (обязательно учти при генерации): ${editorComment}`;
  }

  const systemContent = prompt2
    ? prompt2.replace(/\{role\}/g, role)
    : `Ты — ${role}. Пиши экспертную статью для блога питомника. Используй только проверенные факты из блока выше. СТРОГО до 4000 символов. Чередуй длину предложений и абзацев. Начинай статью по-разному: с вопроса, с факта, с личной ремарки или сразу с темы — не используй один и тот же шаблон приветствия.`;

  const res = await aiClient.chat.completions.create({
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
