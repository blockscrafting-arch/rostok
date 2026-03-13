import { prisma } from '../client';
import type { AdminSettings } from '@prisma/client';

const ADMIN_ID = 'global';

export async function getAdminSettings(): Promise<AdminSettings | null> {
  return prisma.adminSettings.findUnique({
    where: { id: ADMIN_ID },
  });
}

export async function getAdminSettingsOrThrow(): Promise<AdminSettings> {
  const row = await getAdminSettings();
  if (!row) {
    throw new Error('AdminSettings not found. Run prisma seed.');
  }
  return row;
}
