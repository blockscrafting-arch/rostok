import { describe, it, expect, vi } from 'vitest';
import type { TokenUsage } from '../types';
import { totalCostRub, splitCostRub } from './cost';

vi.mock('../config', () => ({ config: { usdRubRate: 100 } }));

describe('cost', () => {

  describe('totalCostRub', () => {
    it('суммирует total_cost и переводит в рубли по курсу 100', () => {
      const usages: TokenUsage[] = [
        { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.01 },
        { prompt_tokens: 20, completion_tokens: 10, total_cost: 0.02 },
      ];
      expect(totalCostRub(usages)).toBe(3);
    });

    it('игнорирует usage без total_cost', () => {
      const usages: TokenUsage[] = [
        { prompt_tokens: 10, completion_tokens: 5 },
        { prompt_tokens: 20, completion_tokens: 10, total_cost: 0.05 },
      ];
      expect(totalCostRub(usages)).toBe(5);
    });
  });

  describe('splitCostRub', () => {
    it('разделяет текст и картинку, считает итого', () => {
      const textUsages: TokenUsage[] = [
        { prompt_tokens: 1, completion_tokens: 1, total_cost: 0.01 },
      ];
      const r = splitCostRub(textUsages, 0.02);
      expect(r.costTextRub).toBe(1);
      expect(r.costImageRub).toBe(2);
      expect(r.costTotalRub).toBe(3);
    });

    it('без imageCostUsd возвращает 0 за картинку', () => {
      const r = splitCostRub([], undefined);
      expect(r.costTextRub).toBe(0);
      expect(r.costImageRub).toBe(0);
      expect(r.costTotalRub).toBe(0);
    });
  });
});
