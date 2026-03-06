/**
 * Калькулятор стоимости: агрегация usage из вызовов OpenRouter, конвертация в рубли.
 * Если OpenRouter не вернул total_cost, используется расчёт по токенам (fallback).
 */
import { config } from '../config';
import type { TokenUsage } from '../types';

const usdRub = (): number => config.usdRubRate;

/** USD за 1M токенов (input, output). Fallback при отсутствии total_cost в ответе. */
const OPENROUTER_PRICES: Record<string, { promptPerMillion: number; completionPerMillion: number }> = {
  'deepseek/deepseek-chat': { promptPerMillion: 0.32, completionPerMillion: 0.89 },
  'perplexity/sonar': { promptPerMillion: 0.5, completionPerMillion: 1.5 },
  'google/gemini-3.1-flash-image-preview': { promptPerMillion: 0.5, completionPerMillion: 3.0 },
};

function estimateCostUsd(u: TokenUsage): number {
  // OpenRouter отдаёт usage.cost; total_cost заполняем из cost в модулях ai/*.
  if (typeof u.total_cost === 'number') return u.total_cost;
  const prompt = u.prompt_tokens ?? 0;
  const completion = u.completion_tokens ?? 0;
  if (prompt === 0 && completion === 0) return 0;
  const prices = u.model ? OPENROUTER_PRICES[u.model] : null;
  const { promptPerMillion, completionPerMillion } = prices ?? OPENROUTER_PRICES['deepseek/deepseek-chat'];
  return (prompt / 1e6) * promptPerMillion + (completion / 1e6) * completionPerMillion;
}

/**
 * Суммировать стоимость в USD из нескольких usage и перевести в рубли.
 * При отсутствии total_cost считается по токенам (fallback).
 */
export function totalCostRub(usages: TokenUsage[]): number {
  let totalUsd = 0;
  for (const u of usages) {
    totalUsd += estimateCostUsd(u);
  }
  return Math.round(totalUsd * usdRub() * 100) / 100;
}

/**
 * Разбить общую стоимость на "текст" и "картинка" по переданным usage (граундинг + черновик + очеловечивание = текст; отдельно картинка).
 * При отсутствии total_cost используется расчёт по токенам.
 */
export function splitCostRub(
  textUsages: TokenUsage[],
  imageCostUsd?: number
): { costTextRub: number; costImageRub: number; costTotalRub: number } {
  let textUsd = 0;
  for (const u of textUsages) {
    textUsd += estimateCostUsd(u);
  }
  const imgUsd = typeof imageCostUsd === 'number' ? imageCostUsd : 0;
  const costTextRub = Math.round(textUsd * usdRub() * 100) / 100;
  const costImageRub = Math.round(imgUsd * usdRub() * 100) / 100;
  return {
    costTextRub,
    costImageRub,
    costTotalRub: costTextRub + costImageRub,
  };
}
