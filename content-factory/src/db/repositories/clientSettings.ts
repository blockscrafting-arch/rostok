import { prisma } from '../client';
import type { ClientSettings, Prisma } from '@prisma/client';

export async function getClientSettingsByClientId(clientId: string): Promise<ClientSettings | null> {
  return prisma.clientSettings.findUnique({
    where: { clientId },
  });
}

export async function upsertClientSettings(
  clientId: string,
  data: Omit<Prisma.ClientSettingsUncheckedCreateInput, 'clientId'>
): Promise<ClientSettings> {
  return prisma.clientSettings.upsert({
    where: { clientId },
    create: { ...data, clientId },
    update: data,
  });
}

export async function createClientSettings(
  data: Prisma.ClientSettingsUncheckedCreateInput
): Promise<ClientSettings> {
  return prisma.clientSettings.create({ data });
}
