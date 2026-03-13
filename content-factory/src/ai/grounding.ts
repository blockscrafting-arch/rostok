/**
 * Веб-граундинг: Perplexity Sonar собирает проверенные факты по заголовку и ключевым словам.
 * Промпт параметризуется: ниша, доверенные сайты (опционально promptOverride — полный текст).
 */
import type OpenAI from 'openai';
import { config } from '../config';
import type { TokenUsage } from '../types';

export interface GroundingResult {
  facts: string;
  citations: string[];
  usage: TokenUsage;
}

const DEFAULT_GROUNDING_PROMPT = `Собери проверенные факты для статьи.
Заголовок: "{headline}"
Ключевые слова: {keywords}
Верни только проверенные данные. Источники укажи в конце списком URL.`;

export async function groundArticleFacts(
  aiClient: OpenAI,
  headline: string,
  keywords: string[],
  options?: { modelOverride?: string; promptOverride?: string; niche?: string; trustedSites?: string[] }
): Promise<GroundingResult> {
  const model = options?.modelOverride?.trim() || config.openrouter.groundingModel;
  const kw = keywords.length ? keywords.join(', ') : headline;
  let content: string;
  if (options?.promptOverride?.trim()) {
    content = options.promptOverride
      .replace(/\{headline\}/g, headline)
      .replace(/\{keywords\}/g, kw)
      .replace(/\{niche\}/g, options.niche ?? '')
      .replace(/\{trusted_sites\}/g, (options.trustedSites ?? []).join('\n'));
  } else {
    const niche = options?.niche ? ` Тематика: ${options.niche}.` : '';
    const sites =
      options?.trustedSites?.length ?
        ` Предпочтительные источники: ${options.trustedSites.join(', ')}.`
      : '';
    content = DEFAULT_GROUNDING_PROMPT.replace('{headline}', headline).replace('{keywords}', kw) + niche + sites;
  }
  const res = await aiClient.chat.completions.create({
    model,
    messages: [{ role: 'user', content }],
  });

  const factsText = res.choices[0]?.message?.content ?? '';
  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: u?.cost ?? u?.total_cost,
    model,
  };

  const citations: string[] = [];
  const urlRegex = /https?:\/\/[^\s)\]]+/g;
  const matches = factsText.match(urlRegex);
  if (matches) {
    for (const urlStr of matches) {
      try {
        const url = new URL(urlStr);
        const host = url.hostname.replace(/^www\./, '');
        if (!citations.includes(host)) citations.push(host);
      } catch {
        if (!citations.includes(urlStr)) citations.push(urlStr);
      }
    }
  }

  return { facts: factsText, citations, usage };
}
