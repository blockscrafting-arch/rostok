/**
 * Калькулятор стоимости: агрегация usage из вызовов OpenRouter, конвертация в рубли.
 */
import { config } from '../config';
import type { TokenUsage } from '../types';

const usdRub = (): number => config.usdRubRate;

/**
 * Суммировать стоимость в USD из нескольких usage и перевести в рубли.
 */
export function totalCostRub(usages: TokenUsage[]): number {
  let totalUsd = 0;
  for (const u of usages) {
    if (typeof u.total_cost === 'number') totalUsd += u.total_cost;
  }
  return Math.round(totalUsd * usdRub() * 100) / 100;
}

/**
 * Разбить общую стоимость на "текст" и "картинка" по переданным usage (граундинг + черновик + очеловечивание = текст; отдельно картинка).
 */
export function splitCostRub(
  textUsages: TokenUsage[],
  imageCostUsd?: number
): { costTextRub: number; costImageRub: number; costTotalRub: number } {
  let textUsd = 0;
  for (const u of textUsages) {
    if (typeof u.total_cost === 'number') textUsd += u.total_cost;
  }
  const costTextRub = Math.round(textUsd * usdRub() * 100) / 100;
  const costImageRub = Math.round((imageCostUsd ?? 0) * usdRub() * 100) / 100;
  return {
    costTextRub,
    costImageRub,
    costTotalRub: costTextRub + costImageRub,
  };
}
