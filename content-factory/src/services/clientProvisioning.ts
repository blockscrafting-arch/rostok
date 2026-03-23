/**
 * Общая логика провижининга клиента: client → clientSettings → createClientTable → update.
 * Используется в веб-онбординге.
 */
import { prisma } from '../db/client';
import { createClientTable } from '../sheets/templateCopier';
import { syncOnboardingSettingsToSettingsSheet } from '../sheets/settingsWriter';
import { config } from '../config';
import { logInfo } from '../utils/logger';
import type { OnboardingSettingsForDb } from '../types/onboarding';

export interface ProvisionClientInput {
  clientName: string;
  email: string;
  niche: string;
  settings: OnboardingSettingsForDb;
  /** Опционально: telegramChatId для бота. */
  telegramChatId?: string | null;
  /** Опционально: канал для публикации (от пользователя веб-онбординга). */
  telegramChannelId?: string;
  /** Опционально: индивидуальный токен бота клиента. */
  telegramBotToken?: string;
}

export interface ProvisionClientResult {
  clientId: string;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
}

/**
 * Создать клиента, настройки и (при наличии шаблона) Google Таблицу.
 */
export async function provisionClient(input: ProvisionClientInput): Promise<ProvisionClientResult> {
  const { clientName, email, niche, settings, telegramChatId, telegramChannelId, telegramBotToken } = input;

  const client = await prisma.$transaction(async (tx) => {
    const c = await tx.client.create({
      data: {
        name: clientName,
        niche,
        telegramChatId: telegramChatId ?? null,
        telegramChannelId: telegramChannelId ?? null,
        telegramBotToken: telegramBotToken ?? null,
        openrouterApiKey: 'PENDING',
        isActive: false,
        onboardingDone: false,
      },
    });
    await tx.clientSettings.create({
      data: {
        clientId: c.id,
        role: settings.role,
        contentTypes: settings.contentTypes,
        trustedSites: settings.trustedSites,
        productDetails: settings.productDetails,
        dnaBrand: settings.dnaBrand,
        cta: settings.cta,
        imageStyle: settings.imageStyle,
        tonality: settings.tonality,
        targetAudience: settings.targetAudience,
        negativePrompt: settings.negativePrompt,
        operationMode: settings.operationMode ?? 'safe',
        maxArticlesPerDay: settings.maxArticlesPerDay ?? 5,
        publishIntervalMin: settings.publishIntervalMin ?? 60,
        generationTime: settings.generationTime ?? '05:00',
        imageGenMode: settings.imageGenMode ?? 'scheduled',
        moderationEnabled: settings.moderationEnabled ?? true,
        logoUrl: settings.logoUrl ?? null,
      },
    });
    return c;
  });

  const templateId = config.google.templateSpreadsheetId?.trim();
  let spreadsheetId: string | null = null;
  let spreadsheetUrl: string | null = null;

  if (templateId) {
    logInfo('Provision client table: Drive copy source = TEMPLATE_SPREADSHEET_ID (not SPREADSHEET_ID)', {
      templateSpreadsheetId: templateId,
    });
    const result = await createClientTable(templateId, clientName, {
      shareWithEmail: email,
      hideTechnicalColumns: true,
    });
    spreadsheetId = result.spreadsheetId;
    spreadsheetUrl = result.spreadsheetUrl;

    await syncOnboardingSettingsToSettingsSheet(spreadsheetId, settings);

    await prisma.client.update({
      where: { id: client.id },
      data: { spreadsheetId, onboardingDone: true, isActive: true },
    });
  } else {
    await prisma.client.update({
      where: { id: client.id },
      data: { onboardingDone: true },
    });
  }

  return {
    clientId: client.id,
    spreadsheetId,
    spreadsheetUrl,
  };
}
