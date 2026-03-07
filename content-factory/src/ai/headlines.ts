/**
 * Генерация 30 заголовков по НЧ-запросам (Промпт 1).
 * AI возвращает пары «заголовок → 5–10 релевантных КЗ» для каждой строки.
 */
import { openrouter } from './client';
import { config } from '../config';
import { logInfo } from '../utils/logger';
import type { TokenUsage } from '../types';

export interface HeadlineItem {
  headline: string;
  keywords: string[];
}

export interface HeadlinesResult {
  items: HeadlineItem[];
  usage: TokenUsage;
}

/** Парсит ответ AI: блоки "N. Заголовок" + "КЗ: запрос1, запрос2, ..." */
function parseHeadlinesWithKeywords(
  text: string,
  fallbackKeywordList: string[]
): HeadlineItem[] {
  const items: HeadlineItem[] = [];
  let blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  if (blocks.length < 5) {
    blocks = text.split(/\n(?=\d+[.)]\s)/).filter((b) => b.trim());
  }

  for (const block of blocks) {
    const lines = block.split(/\n/).map((s) => s.trim()).filter(Boolean);
    let headline = '';
    let keywords: string[] = [];

    for (const line of lines) {
      const kwMatch = line.match(/^КЗ:\s*(.+)$/i);
      if (kwMatch) {
        keywords = kwMatch[1]
          .split(/[,;]/)
          .map((s) => s.trim().slice(0, 200))
          .filter((s) => s.length > 1);
      } else {
        const cleaned = line.replace(/^\s*[-*\d.)]\s*/, '').trim();
        if (cleaned.length > 5 && cleaned.length < 150 && !headline) {
          headline = cleaned;
        }
      }
    }

    if (headline) {
      if (keywords.length === 0) {
        keywords = fallbackKeywordList.slice(0, 10);
      }
      items.push({ headline, keywords });
    }
  }

  return items.slice(0, 30);
}

/** Fallback: старый формат — только заголовки, без КЗ. */
function parseHeadlinesLegacy(text: string): string[] {
  const lines = text
    .split(/\n/)
    .map((s) => s.replace(/^\s*[-*\d.)]\s*/, '').trim())
    .filter((s) => s.length > 5 && s.length < 150);
  return lines.slice(0, 30);
}

/** КЗ для fallback-строки: разные срезы по индексу, чтобы не дублировать одни и те же. */
function getFallbackKeywords(keywordList: string[], index: number): string[] {
  const n = keywordList.length;
  if (n === 0) return [];
  const start = (index * 5) % n;
  const slice = keywordList.slice(start, start + 10).filter(Boolean);
  return slice.length ? slice : keywordList.slice(0, 10);
}

const DEFAULT_PROMPT = `По ключевому слову "{keyword}" и НЧ-запросам: {keywords}.
Сгенерируй 30 заголовков статей для блога питомника (лаконичные, с пользой для читателя).
Для каждого заголовка подбери свой набор из 5–10 наиболее релевантных НЧ-запросов из списка выше. Разные заголовки — разные подмножества КЗ (например, заголовок про сорт Voyage — КЗ про Voyage, про Роз де Цистерсьен — КЗ про него).
Формат ответа — строго:
1. [Заголовок]
КЗ: [запрос1, запрос2, ...]

2. [Заголовок]
КЗ: [запрос1, запрос2, ...]
...
(и так до 30)`;

export async function generateHeadlines(
  keyword: string,
  keywordList: string[],
  prompt1: string
): Promise<HeadlinesResult> {
  const kwList = keywordList.length ? keywordList.join(', ') : keyword;
  const userPrompt = prompt1
    ? prompt1.replace(/\{keyword\}/g, keyword).replace(/\{keywords\}/g, kwList)
    : DEFAULT_PROMPT.replace(/\{keyword\}/g, keyword).replace(/\{keywords\}/g, kwList);

  const res = await openrouter.chat.completions.create({
    model: config.openrouter.textModel,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = res.choices[0]?.message?.content ?? '';
  let items = parseHeadlinesWithKeywords(content, keywordList);

  logInfo('parseHeadlinesWithKeywords', {
    count: items.length,
    sampleKeywords: items.slice(0, 3).map((i) => i.keywords),
    rawPreview: content.slice(0, 400),
  });

  if (items.length === 0) {
    const headlinesLegacy = parseHeadlinesLegacy(content);
    items = headlinesLegacy.map((h, i) => ({
      headline: h,
      keywords: getFallbackKeywords(keywordList, i),
    }));
  } else if (items.length < 30) {
    const headlinesLegacy = parseHeadlinesLegacy(content);
    const seen = new Set(items.map((i) => i.headline.toLowerCase()));
    for (const h of headlinesLegacy) {
      if (items.length >= 30) break;
      const key = h.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ headline: h, keywords: getFallbackKeywords(keywordList, items.length) });
      }
    }
  }

  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: u?.cost ?? u?.total_cost,
    model: config.openrouter.textModel,
  };

  return { items, usage };
}
