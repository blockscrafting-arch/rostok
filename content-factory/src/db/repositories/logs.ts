import { prisma } from '../client';
import type { Log, Prisma } from '@prisma/client';

export async function createLog(data: Prisma.LogUncheckedCreateInput): Promise<Log> {
  return prisma.log.create({ data });
}

export async function getLogsByClientId(
  clientId: string,
  options?: { level?: string; limit?: number }
): Promise<Log[]> {
  const where: Prisma.LogWhereInput = { clientId };
  if (options?.level) where.level = options.level;
  return prisma.log.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 100,
  });
}
