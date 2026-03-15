/**
 * Telegram-бот онбординга: кружочки из БД, сбор ответов (текст/голос/видео), транскрибация через OpenRouter, создание клиента и таблицы.
 */
import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';
import { prisma } from '../db/client';
import { downloadAndConvertToMp3Base64, transcribeAudio } from './media';
import { extractClientSettings } from '../ai/extractor';
import { createClientTable } from '../sheets/templateCopier';
import { logInfo, logWarn } from '../utils/logger';
import {
  getOnboardingSession,
  setOnboardingSession,
  deleteOnboardingSession,
  type OnboardingSession,
} from '../redis/onboardingSession';

/** Проверка формата email: локаль@домен.зона (минимум 2 символа в зоне). Экспорт для тестов. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function getChatId(ctx: Context): number | undefined {
  return ctx.chat?.id;
}

export function launchOnboardingBot(): void {
  const token = config.telegram.onboardingBotToken;
  if (!token?.trim()) {
    logWarn('Onboarding bot disabled: ONBOARDING_BOT_TOKEN not set');
    return;
  }
  const bot = new Telegraf(token);

  bot.command('start', async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const chatIdStr = String(chatId);
    const existing = await prisma.client.findFirst({
      where: { telegramChatId: chatIdStr },
      include: { settings: true },
    });
    if (existing?.onboardingDone) {
      await ctx.reply('Бриф уже заполнен! Если нужна новая настройка — обратитесь к администратору.');
      return;
    }
    const steps = await prisma.onboardingStep.findMany({ orderBy: { stepOrder: 'asc' } });
    if (steps.length === 0) {
      await ctx.reply('Шаги онбординга ещё не настроены. Обратитесь к администратору.');
      return;
    }
    await setOnboardingSession(chatId, { stepIndex: 0, answers: [], status: 'steps' });
    await ctx.replyWithVideoNote(steps[0].fileId);
  });

  bot.on(message('text'), async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const session = await getOnboardingSession(chatId);
    if (!session) {
      await ctx.reply('Нажмите /start, чтобы начать онбординг.');
      return;
    }
    const text = ctx.message.text.trim();
    if (session.status === 'waiting_email') {
      const email = text.trim();
      if (!isValidEmail(email)) {
        await ctx.reply('Пожалуйста, введите корректный email (например, name@gmail.com).');
        return;
      }
      await ctx.reply('⏳ Создаю вашу фабрику контента, это займёт пару минут...');
      try {
        const extracted = await extractClientSettings(session.answers);
        const clientName = extracted.dnaBrand?.slice(0, 80) || `Клиент ${chatId}`;
        const niche = extracted.productDetails?.slice(0, 200) || 'общее';
        const client = await prisma.client.create({
          data: {
            name: clientName,
            niche,
            telegramChatId: String(chatId),
            openrouterApiKey: 'PENDING',
            isActive: false,
            onboardingDone: false,
          },
        });
        await prisma.clientSettings.create({
          data: {
            clientId: client.id,
            role: 'Эксперт',
            dnaBrand: extracted.dnaBrand,
            productDetails: extracted.productDetails,
            cta: extracted.cta,
            imageStyle: extracted.imageStyle,
            logoUrl: extracted.logoUrl,
          },
        });
        const templateId = config.google.templateSpreadsheetId?.trim();
        if (templateId) {
          const { spreadsheetId, spreadsheetUrl } = await createClientTable(templateId, clientName, {
            shareWithEmail: email,
            hideTechnicalColumns: true,
          });
          await prisma.client.update({
            where: { id: client.id },
            data: { spreadsheetId, onboardingDone: true, isActive: true },
          });
          await ctx.reply(
            `Готово! Ваша таблица управления: ${spreadsheetUrl}\n\nДобавьте свой OpenRouter API Key в настройки (администратор подскажет, как).`
          );
        } else {
          await prisma.client.update({
            where: { id: client.id },
            data: { onboardingDone: true },
          });
          await ctx.reply(
            'Бриф сохранён. Администратор создаст для вас таблицу и вышлет ссылку. Не забудьте добавить OpenRouter API Key.'
          );
        }
        await deleteOnboardingSession(chatId);
      } catch (e) {
        logWarn('Onboarding provisioning error', { chatId, error: (e as Error).message });
        await ctx.reply('Произошла ошибка при создании таблицы. Обратитесь к администратору.');
      }
      return;
    }
    const nextSession: OnboardingSession = {
      ...session,
      answers: [...session.answers, text],
      stepIndex: session.stepIndex + 1,
    };
    const steps = await prisma.onboardingStep.findMany({ orderBy: { stepOrder: 'asc' } });
    if (nextSession.stepIndex >= steps.length) {
      nextSession.status = 'waiting_email';
      await setOnboardingSession(chatId, nextSession);
      await ctx.reply('Спасибо! Пожалуйста, напишите ваш Google Email, чтобы мы выдали вам доступ к таблице управления.');
    } else {
      await setOnboardingSession(chatId, nextSession);
      await ctx.replyWithVideoNote(steps[nextSession.stepIndex].fileId);
    }
  });

  bot.on(message('voice'), async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const session = await getOnboardingSession(chatId);
    if (!session || session.status !== 'steps') {
      await ctx.reply('Нажмите /start или ответьте текстом на текущий вопрос.');
      return;
    }
    const fileId = ctx.message.voice.file_id;
    await ctx.reply('⏳ Расшифровываю...');
    let text = '(пусто)';
    try {
      const link = await ctx.telegram.getFileLink(fileId);
      const href = typeof link === 'string' ? link : (link as { href: string }).href;
      const base64 = await downloadAndConvertToMp3Base64(href);
      text = await transcribeAudio(base64) || text;
    } catch (e) {
      logWarn('Voice transcription error', { chatId, error: (e as Error).message });
      await ctx.reply('Не удалось расшифровать голос. Попробуйте написать текстом.');
      return;
    }
    const nextSession: OnboardingSession = {
      ...session,
      answers: [...session.answers, text],
      stepIndex: session.stepIndex + 1,
    };
    const steps = await prisma.onboardingStep.findMany({ orderBy: { stepOrder: 'asc' } });
    if (nextSession.stepIndex >= steps.length) {
      nextSession.status = 'waiting_email';
      await setOnboardingSession(chatId, nextSession);
      await ctx.reply('Спасибо! Пожалуйста, напишите ваш Google Email, чтобы мы выдали вам доступ к таблице управления.');
    } else {
      await setOnboardingSession(chatId, nextSession);
      await ctx.replyWithVideoNote(steps[nextSession.stepIndex].fileId);
    }
  });

  bot.on(message('video_note'), async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const session = await getOnboardingSession(chatId);
    if (!session || session.status !== 'steps') {
      await ctx.reply('Нажмите /start или ответьте текстом на текущий вопрос.');
      return;
    }
    const fileId = ctx.message.video_note.file_id;
    await ctx.reply('⏳ Расшифровываю...');
    let text = '(пусто)';
    try {
      const link = await ctx.telegram.getFileLink(fileId);
      const href = typeof link === 'string' ? link : (link as { href: string }).href;
      const base64 = await downloadAndConvertToMp3Base64(href);
      text = await transcribeAudio(base64) || text;
    } catch (e) {
      logWarn('Video note transcription error', { chatId, error: (e as Error).message });
      await ctx.reply('Не удалось расшифровать видео. Попробуйте написать текстом.');
      return;
    }
    const nextSession: OnboardingSession = {
      ...session,
      answers: [...session.answers, text],
      stepIndex: session.stepIndex + 1,
    };
    const steps = await prisma.onboardingStep.findMany({ orderBy: { stepOrder: 'asc' } });
    if (nextSession.stepIndex >= steps.length) {
      nextSession.status = 'waiting_email';
      await setOnboardingSession(chatId, nextSession);
      await ctx.reply('Спасибо! Пожалуйста, напишите ваш Google Email, чтобы мы выдали вам доступ к таблице управления.');
    } else {
      await setOnboardingSession(chatId, nextSession);
      await ctx.replyWithVideoNote(steps[nextSession.stepIndex].fileId);
    }
  });

  bot.launch().then(() => {
    logInfo('Onboarding bot started');
  }).catch((e) => {
    logWarn('Onboarding bot launch failed', { error: (e as Error).message });
  });
}
