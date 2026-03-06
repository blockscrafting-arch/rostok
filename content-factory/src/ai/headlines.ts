/**
 * Генерация 30 заголовков по НЧ-запросам (Промпт 1).
 */
import { openrouter } from './client';
import { config } from '../config';
import type { TokenUsage } from '../types';

export interface HeadlinesResult {
  headlines: string[];
  usage: TokenUsage;
}

function parseHeadlines(text: string): string[] {
  const lines = text
    .split(/\n/)
    .map((s) => s.replace(/^\s*[-*\d.)]\s*/, '').trim())
    .filter((s) => s.length > 5 && s.length < 150);
  return lines.slice(0, 30);
}

export async function generateHeadlines(
  keyword: string,
  keywordList: string[],
  prompt1: string
): Promise<HeadlinesResult> {
  const kwList = keywordList.length ? keywordList.join(', ') : keyword;
  const userPrompt = prompt1
    ? prompt1.replace(/\{keyword\}/g, keyword).replace(/\{keywords\}/g, kwList)
    : `По ключевому слову "${keyword}" и НЧ-запросам: ${kwList}. Сгенерируй 30 заголовков статей для блога питомника (лаконичные, с пользой для читателя). Нумеруй с новой строки.`;

  const res = await openrouter.chat.completions.create({
    model: config.openrouter.textModel,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = res.choices[0]?.message?.content ?? '';
  const headlines = parseHeadlines(content);

  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: u?.total_cost ?? u?.cost,
  };

  return { headlines, usage };
}
