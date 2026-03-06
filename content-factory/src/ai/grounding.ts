/**
 * Веб-граундинг: Perplexity Sonar собирает проверенные факты по заголовку и ключевым словам.
 */
import { openrouter } from './client';
import { config } from '../config';
import type { TokenUsage } from '../types';

export interface GroundingResult {
  facts: string;
  citations: string[];
  usage: TokenUsage;
}

export async function groundArticleFacts(
  headline: string,
  keywords: string[]
): Promise<GroundingResult> {
  const kw = keywords.length ? keywords.join(', ') : headline;
  const res = await openrouter.chat.completions.create({
    model: config.openrouter.groundingModel,
    messages: [
      {
        role: 'user',
        content: `Собери проверенные факты для статьи о растениях.
Заголовок: "${headline}"
Ключевые слова: ${kw}

Верни: зимостойкость (зона USDA), уход (почва, полив, свет), сорта, региональные особенности. Только проверенные данные. Источники укажи в конце списком URL.`,
      },
    ],
  });

  const content = res.choices[0]?.message?.content ?? '';
  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: u?.cost ?? u?.total_cost,
    model: config.openrouter.groundingModel,
  };

  const citations: string[] = [];
  const urlRegex = /https?:\/\/[^\s)\]]+/g;
  const matches = content.match(urlRegex);
  if (matches) {
    for (const u of matches) {
      try {
        const url = new URL(u);
        const host = url.hostname.replace(/^www\./, '');
        if (!citations.includes(host)) citations.push(host);
      } catch {
        if (!citations.includes(u)) citations.push(u);
      }
    }
  }

  return { facts: content, citations, usage };
}
