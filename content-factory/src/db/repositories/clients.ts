import { prisma } from '../client';
import type { Client, Prisma } from '@prisma/client';

export type ClientWithSettings = Client & { settings: Prisma.ClientGetPayload<{ include: { settings: true } }>['settings'] };

export async function getClientById(id: string): Promise<Client | null> {
  return prisma.client.findUnique({
    where: { id },
  });
}

export async function getClientWithSettings(id: string): Promise<ClientWithSettings | null> {
  return prisma.client.findUnique({
    where: { id },
    include: { settings: true },
  }) as Promise<ClientWithSettings | null>;
}

export async function getActiveClientsWithSettings(): Promise<ClientWithSettings[]> {
  return prisma.client.findMany({
    where: { isActive: true },
    include: { settings: true },
  }) as Promise<ClientWithSettings[]>;
}

export async function getClientByTelegramChatId(telegramChatId: string): Promise<Client | null> {
  return prisma.client.findUnique({
    where: { telegramChatId },
  });
}

export async function createClient(data: Prisma.ClientCreateInput): Promise<Client> {
  return prisma.client.create({ data });
}

export async function updateClient(id: string, data: Prisma.ClientUpdateInput): Promise<Client> {
  return prisma.client.update({ where: { id }, data });
}
