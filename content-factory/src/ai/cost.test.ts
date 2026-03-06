import { describe, it, expect } from 'vitest';
import type { TokenUsage } from '../types';
import { totalCostUsd, splitCostUsd } from './cost';

describe('cost', () => {

  describe('totalCostUsd', () => {
    it('суммирует total_cost без умножения', () => {
      const usages: TokenUsage[] = [
        { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.01 },
        { prompt_tokens: 20, completion_tokens: 10, total_cost: 0.02 },
      ];
      expect(totalCostUsd(usages)).toBe(0.03);
    });

    it('игнорирует usage без total_cost', () => {
      const usages: TokenUsage[] = [
        { prompt_tokens: 10, completion_tokens: 5 }, // fallback посчитает копейки, так что сумма будет 0.05 + копейки, но для теста проверим
        { prompt_tokens: 20, completion_tokens: 10, total_cost: 0.05 },
      ];
      // prompt(10)*0.32/1M + completion(5)*0.89/1M = 0.0000032 + 0.00000445 = 0.000008
      expect(totalCostUsd(usages)).toBe(0.050008);
    });
  });

  describe('splitCostUsd', () => {
    it('разделяет текст и картинку, считает итого', () => {
      const textUsages: TokenUsage[] = [
        { prompt_tokens: 1, completion_tokens: 1, total_cost: 0.01 },
      ];
      const r = splitCostUsd(textUsages, 0.02);
      expect(r.costTextUsd).toBe(0.01);
      expect(r.costImageUsd).toBe(0.02);
      expect(r.costTotalUsd).toBe(0.03);
    });

    it('без imageCostUsd возвращает 0 за картинку', () => {
      const r = splitCostUsd([], undefined);
      expect(r.costTextUsd).toBe(0);
      expect(r.costImageUsd).toBe(0);
      expect(r.costTotalUsd).toBe(0);
    });
  });
});
