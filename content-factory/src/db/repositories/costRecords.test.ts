import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStatsByClientAndPeriod,
  getArticleCountByClientAndPeriod,
  getTotalCostByClientAndPeriod,
} from './costRecords';

const mockAggregate = vi.fn();
const mockCount = vi.fn();

vi.mock('../client', () => ({
  prisma: {
    costRecord: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

describe('costRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStatsByClientAndPeriod', () => {
    it('возвращает count, totalCostUsd и avgCostUsd за период', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costUsd: 0.15 } });
      mockCount.mockResolvedValue(3);

      const from = new Date('2026-03-01T00:00:00Z');
      const to = new Date('2026-03-01T23:59:59Z');
      const result = await getStatsByClientAndPeriod('client-uuid', from, to);

      expect(result.count).toBe(3);
      expect(result.totalCostUsd).toBe(0.15);
      expect(result.avgCostUsd).toBeCloseTo(0.05, 10);
      expect(mockAggregate).toHaveBeenCalledWith({
        where: { clientId: 'client-uuid', createdAt: { gte: from, lte: to } },
        _sum: { costUsd: true },
      });
      expect(mockCount).toHaveBeenCalledWith({
        where: { clientId: 'client-uuid', createdAt: { gte: from, lte: to } },
      });
    });

    it('при отсутствии записей возвращает нули', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costUsd: null } });
      mockCount.mockResolvedValue(0);

      const from = new Date('2026-03-10T00:00:00Z');
      const to = new Date('2026-03-10T23:59:59Z');
      const result = await getStatsByClientAndPeriod('', from, to);

      expect(result).toEqual({ count: 0, totalCostUsd: 0, avgCostUsd: 0 });
    });
  });

  describe('getArticleCountByClientAndPeriod', () => {
    it('считает только записи с operation text', async () => {
      mockCount.mockResolvedValue(5);

      const from = new Date('2026-03-01T00:00:00Z');
      const to = new Date('2026-03-07T23:59:59Z');
      const result = await getArticleCountByClientAndPeriod('client-uuid', from, to);

      expect(result).toBe(5);
      expect(mockCount).toHaveBeenCalledWith({
        where: {
          clientId: 'client-uuid',
          operation: 'text',
          createdAt: { gte: from, lte: to },
        },
      });
    });
  });

  describe('getTotalCostByClientAndPeriod', () => {
    it('возвращает сумму costUsd за период', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costUsd: 1.25 } });

      const from = new Date('2026-03-01T00:00:00Z');
      const to = new Date('2026-03-31T23:59:59Z');
      const result = await getTotalCostByClientAndPeriod('client-uuid', from, to);

      expect(result).toBe(1.25);
      expect(mockAggregate).toHaveBeenCalledWith({
        where: { clientId: 'client-uuid', createdAt: { gte: from, lte: to } },
        _sum: { costUsd: true },
      });
    });

    it('при null _sum.costUsd возвращает 0', async () => {
      mockAggregate.mockResolvedValue({ _sum: { costUsd: null } });
      const from = new Date();
      const to = new Date();
      const result = await getTotalCostByClientAndPeriod('x', from, to);
      expect(result).toBe(0);
    });
  });
});
