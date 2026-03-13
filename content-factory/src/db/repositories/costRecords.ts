import { prisma } from '../client';
import type { CostRecord, Prisma } from '@prisma/client';

export async function createCostRecord(
  data: Prisma.CostRecordUncheckedCreateInput
): Promise<CostRecord> {
  return prisma.costRecord.create({ data });
}

export async function getCostRecordsByClientId(
  clientId: string,
  options?: { from?: Date; to?: Date; limit?: number }
): Promise<CostRecord[]> {
  const where: Prisma.CostRecordWhereInput = { clientId };
  if (options?.from || options?.to) {
    where.createdAt = {};
    if (options.from) (where.createdAt as Prisma.DateTimeFilter).gte = options.from;
    if (options.to) (where.createdAt as Prisma.DateTimeFilter).lte = options.to;
  }
  return prisma.costRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 1000,
  });
}

export async function getTotalCostByClientAndPeriod(
  clientId: string,
  from: Date,
  to: Date
): Promise<number> {
  const agg = await prisma.costRecord.aggregate({
    where: { clientId, createdAt: { gte: from, lte: to } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}
