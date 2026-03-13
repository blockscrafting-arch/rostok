import { prisma } from '../client';
import type { Task, Prisma } from '@prisma/client';

export async function getTasksByClientId(clientId: string): Promise<Task[]> {
  return prisma.task.findMany({
    where: { clientId },
    orderBy: [{ sheetRow: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getTasksByClientIdAndStatus(
  clientId: string,
  status: string
): Promise<Task[]> {
  return prisma.task.findMany({
    where: { clientId, status },
  });
}

export async function getTaskById(id: string): Promise<Task | null> {
  return prisma.task.findUnique({
    where: { id },
  });
}

export async function createTask(data: Prisma.TaskUncheckedCreateInput): Promise<Task> {
  return prisma.task.create({ data });
}

export async function updateTask(id: string, data: Prisma.TaskUpdateInput): Promise<Task> {
  return prisma.task.update({ where: { id }, data });
}

export async function findTaskByClientAndSheetRow(
  clientId: string,
  sheetRow: number
): Promise<Task | null> {
  return prisma.task.findFirst({
    where: { clientId, sheetRow },
    orderBy: { updatedAt: 'desc' },
  });
}
