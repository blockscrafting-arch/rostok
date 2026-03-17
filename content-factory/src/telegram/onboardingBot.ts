/**
 * Telegram-бот онбординга Контент-Завод 2.0: 10 шагов с inline-кнопками, кружки из БД,
 * транскрибация голоса, создание клиента и таблицы.
 */
import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';

const managerInstructionUrl = config.telegram.managerInstructionUrl?.trim() || '';
import { prisma } from '../db/client';
import { downloadAndConvertToMp3Base64, transcribeAudio } from './media';
import { extractClientSettingsFromData } from '../ai/extractor';
import { createClientTable } from '../sheets/templateCopier';
import { logInfo, logWarn, serializeError } from '../utils/logger';
import {
  getOnboardingSession,
  setOnboardingSession,
  deleteOnboardingSession,
  type OnboardingSession,
  type OnboardingData,
} from '../redis/onboardingSession';

/** Проверка формата email. Экспорт для тестов. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function getChatId(ctx: Context): number | undefined {
  return ctx.chat?.id;
}

function getNotifyChatIds(): string[] {
  return config.telegram.notifyChatId
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

async function notifyAdminsAboutNewBrief(
  bot: InstanceType<typeof Telegraf>,
  payload: { clientName: string; email: string; niche: string; spreadsheetUrl?: string }
): Promise<void> {
  const chatIds = getNotifyChatIds();
  if (chatIds.length === 0) return;
  const linkLine = payload.spreadsheetUrl
    ? `Ссылка на таблицу: ${payload.spreadsheetUrl}`
    : 'Таблица: будет создана администратором.';
  const text = [
    'Новый клиент заполнил бриф!',
    `Имя: ${payload.clientName}`,
    `Email: ${payload.email}`,
    `Ниша: ${payload.niche}`,
    linkLine,
  ].join('\n');
  const results = await Promise.allSettled(
    chatIds.map((chatId) => bot.telegram.sendMessage(chatId, text))
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logWarn('Onboarding admin notify failed', {
        chatId: chatIds[i],
        errorMessage: serializeError(r.reason).message,
      });
    }
  });
}

const WELCOME_TEXT = `🚀 Добро пожаловать в Контент Решалу!

Как все проходит: Вы даете нам всего одно слово — а получаете крутую продающую статью!

Что делает наш Решала особенным?
🎯 Бьет точно в цель (SEO + Факты)
🧬 Пишет ВАШИМ голосом
🔗 Генерирует лиды (Авто-UTM)
🎨 Создает уникальный визуал
🔥 Авто-публикация в Дзен и Telegram!

⚙️ Настройка займёт 10 минут. Готовы создать личную контент-звезду? 👇`;

const STEP_TEXTS: Record<number, string> = {
  1: 'Шаг 1 из 10. Выберите стиль общения:',
  2: 'Шаг 2 из 10. Ваша основная аудитория:',
  3: 'Шаг 3 из 10. Расскажите о продукте:\n🎤 Жду ваше голосовое или текстовое сообщение.',
  4: 'Шаг 4 из 10. Какими будут картинки к вашим статьям? Выберите фирменный стиль!',
  5: 'Шаг 5 из 10. О чем пишем и кто автор? Выберите форматы (можно несколько). Важно: после нажатия «Сохранить» напишите отдельным сообщением роль ИИ (например: «Ты — прораб с 20-летним стажем»).',
  6: 'Шаг 6 из 10. Пришлите основную ссылку на ваш сайт (и при желании — ГОСТы, профильные блоги). Или пропустите шаг.',
  7: 'Шаг 7 из 10. Чего писать НЕЛЬЗЯ? Отметьте кнопки. Свои стоп-слова можно написать в чат.',
  8: 'Шаг 9 из 10. Технические настройки конвейера. Выберите режим работы:',
  '8.1': 'Будете проверять статьи перед отправкой в канал?',
  9: 'Шаг 10 из 10. Как завершаем статью? Выберите призыв к действию.',
};

const TONALITY_LABELS: Record<string, string> = {
  tone_official: '👔 Официально-деловой',
  tone_caring: '💖 Заботливый и эмпатичный',
  tone_friendly: '😎 Дружелюбно-свойский',
  tone_personal: '✍️ Личный блог',
  tone_bold: '🔥 Дерзкий и с юмором',
  tone_dry: '📊 Сухой и краткий',
  tone_custom: '🎙 Свой стиль (голосом)',
};

const AUDIENCE_LABELS: Record<string, string> = {
  aud_b2b: '👨‍🔧 Суровые профи / B2B',
  aud_family: '🤱 Семья / Мамочки',
  aud_house: '🏡 Владельцы загородных домов',
  aud_universal: '🌍 Универсальная',
  aud_custom: '🎙 Своя аудитория (голосом)',
};

const IMAGE_STYLE_LABELS: Record<string, string> = {
  img_photo: '📸 Фотореализм',
  img_3d: '🧊 3D-рендер',
  img_flat: '🖍 Flat-иллюстрация',
  img_anime: '🌸 Аниме',
  img_checklist: '📋 Чек-лист / Инфографика',
  img_magazine: '🖼 Журнальная обложка',
  img_aesthetic: '🌌 Эстетичный фон + Заголовок',
  img_custom: '🎙 Свой стиль (голосом/текстом)',
};

const CTA_LABELS: Record<string, string> = {
  cta_subscribe: '📢 Подписка',
  cta_site: '🛍 Переход на сайт',
  cta_consult: '💬 Консультация',
  cta_custom: '🎙 Свой призыв (голосом)',
};

const TONALITY_VALUES: Record<string, string> = {
  tone_official: 'Официально-деловой: на «Вы», факты, без эмоций.',
  tone_caring: 'Заботливый и эмпатичный: уют, доверие, тепло.',
  tone_friendly: 'Дружелюбно-свойский: на «ты», динамично.',
  tone_personal: 'Личный блог: от первого лица «Я/Мы».',
  tone_bold: 'Дерзкий и с юмором: креатив, ирония.',
  tone_dry: 'Сухой и краткий: без воды, списки.',
  tone_custom: '',
};

const AUDIENCE_VALUES: Record<string, string> = {
  aud_b2b: 'Суровые профи, B2B, эксперты.',
  aud_family: 'Семья, мамочки, дом.',
  aud_house: 'Владельцы загородных домов.',
  aud_universal: 'Широкий круг читателей.',
  aud_custom: '',
};

const IMAGE_STYLE_VALUES: Record<string, string> = {
  img_photo: 'Фотореализм: живые, сочные фото.',
  img_3d: '3D-рендер: объемно и современно.',
  img_flat: 'Flat-иллюстрация: минимализм.',
  img_anime: 'Аниме: креативный стиль.',
  img_checklist: 'Чек-лист / Инфографика.',
  img_magazine: 'Журнальная обложка под заголовок.',
  img_aesthetic: 'Эстетичный фон + заголовок статьи.',
  img_custom: '',
};

const CTA_VALUES: Record<string, string> = {
  cta_subscribe: 'Подписывайтесь на канал...',
  cta_site: 'Переходите по ссылке...',
  cta_consult: 'Остались вопросы? Пишите...',
  cta_custom: '',
};

const STOP_WORDS_OPTIONS: Array<{ cb: string; label: string; value: string }> = [
  { cb: 'stop_prices', label: 'Не указывать точные цены', value: 'Не указывать точные цены.' },
  { cb: 'stop_diminutive', label: 'Без уменьшительно-ласкательных', value: 'Без уменьшительно-ласкательных слов.' },
  { cb: 'stop_formal', label: 'Без канцеляризмов', value: 'Без сухих канцеляризмов.' },
  { cb: 'stop_guarantee', label: 'Не давать 100% гарантий', value: 'Не давать 100% гарантий результата.' },
  { cb: 'stop_banal', label: 'Без банальных фраз', value: 'Без банальных фраз («В наше время...» и т.п.).' },
  { cb: 'stop_custom', label: '🎙 Свой ответ (голосом)', value: '' },
];

const CONTENT_FORMATS: Array<{ cb: string; label: string; value: string }> = [
  { cb: 'fmt_top10', label: '🏆 ТОП-10 и подборки', value: 'ТОП-10, полезные подборки' },
  { cb: 'fmt_compare', label: '⚖️ Сравнения До/После', value: 'Сравнения форматов До/После' },
  { cb: 'fmt_expert', label: '🎓 Советы эксперта', value: 'Советы эксперта и разбор ошибок' },
  { cb: 'fmt_custom', label: '🎙 Свой формат', value: '' },
];

function getStepsByOrder() {
  return prisma.onboardingStep.findMany({ orderBy: { stepOrder: 'asc' } });
}

async function sendStep1(bot: Telegraf, chatId: number, steps: { fileId: string; stepOrder: number }[]) {
  const step1 = steps.find((s) => s.stepOrder === 1);
  if (step1?.fileId) await bot.telegram.sendVideoNote(chatId, step1.fileId);
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[1], {
    reply_markup: {
      inline_keyboard: [
        [{ text: TONALITY_LABELS.tone_official, callback_data: 'tone_official' }],
        [{ text: TONALITY_LABELS.tone_caring, callback_data: 'tone_caring' }],
        [{ text: TONALITY_LABELS.tone_friendly, callback_data: 'tone_friendly' }],
        [{ text: TONALITY_LABELS.tone_personal, callback_data: 'tone_personal' }],
        [{ text: TONALITY_LABELS.tone_bold, callback_data: 'tone_bold' }],
        [{ text: TONALITY_LABELS.tone_dry, callback_data: 'tone_dry' }],
        [{ text: TONALITY_LABELS.tone_custom, callback_data: 'tone_custom' }],
      ],
    },
  });
}

async function sendStep2(bot: Telegraf, chatId: number, steps: { fileId: string; stepOrder: number }[]) {
  const step2 = steps.find((s) => s.stepOrder === 2);
  if (step2?.fileId) await bot.telegram.sendVideoNote(chatId, step2.fileId);
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[2], {
    reply_markup: {
      inline_keyboard: [
        [{ text: AUDIENCE_LABELS.aud_b2b, callback_data: 'aud_b2b' }],
        [{ text: AUDIENCE_LABELS.aud_family, callback_data: 'aud_family' }],
        [{ text: AUDIENCE_LABELS.aud_house, callback_data: 'aud_house' }],
        [{ text: AUDIENCE_LABELS.aud_universal, callback_data: 'aud_universal' }],
        [{ text: AUDIENCE_LABELS.aud_custom, callback_data: 'aud_custom' }],
      ],
    },
  });
}

async function sendStep3(bot: Telegraf, chatId: number, steps: { fileId: string; stepOrder: number }[]) {
  const step3 = steps.find((s) => s.stepOrder === 3);
  if (step3?.fileId) await bot.telegram.sendVideoNote(chatId, step3.fileId);
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[3]);
}

async function sendStep4(bot: Telegraf, chatId: number) {
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[4], {
    reply_markup: {
      inline_keyboard: Object.entries(IMAGE_STYLE_LABELS).map(([cb, label]) => [
        { text: label, callback_data: cb },
      ]),
    },
  });
}

async function sendStep5(bot: Telegraf, chatId: number, selected: string[]) {
  const formatButtons = CONTENT_FORMATS.map((f) => ({
    text: selected.includes(f.cb) ? `✅ ${f.label}` : f.label,
    callback_data: f.cb,
  }));
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[5], {
    reply_markup: {
      inline_keyboard: [
        formatButtons.slice(0, 2).map((b) => b),
        formatButtons.slice(2, 4).map((b) => b),
        [{ text: '➡️ Сохранить и продолжить', callback_data: 'fmt_save' }],
      ],
    },
  });
}

async function sendStep6(bot: Telegraf, chatId: number) {
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[6], {
    reply_markup: {
      inline_keyboard: [[{ text: '⏭ Пропустить шаг', callback_data: 'skip_sources' }]],
    },
  });
}

async function sendStep7(bot: Telegraf, chatId: number, selected: string[]) {
  const rows = STOP_WORDS_OPTIONS.map((o) => ({
    text: selected.includes(o.cb) ? `✅ ${o.label}` : o.label,
    callback_data: o.cb,
  }));
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[7], {
    reply_markup: {
      inline_keyboard: [
        rows.slice(0, 2).map((b) => b),
        rows.slice(2, 4).map((b) => b),
        rows.slice(4, 6).map((b) => b),
        [{ text: '➡️ Сохранить и продолжить', callback_data: 'stop_save' }],
      ],
    },
  });
}

async function sendStep8(bot: Telegraf, chatId: number) {
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[8], {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛡 Безопасный (рекомендуем)', callback_data: 'mode_safe' }],
        [{ text: '🚀 Турбо (на свой риск)', callback_data: 'mode_turbo' }],
      ],
    },
  });
}

async function sendStep8_1(bot: Telegraf, chatId: number) {
  await bot.telegram.sendMessage(chatId, STEP_TEXTS['8.1'], {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👀 Да, отправлять на модерацию', callback_data: 'mod_yes' }],
        [{ text: '⚡️ Нет, публиковать на автомате', callback_data: 'mod_no' }],
      ],
    },
  });
}

async function sendStep9(bot: Telegraf, chatId: number) {
  await bot.telegram.sendMessage(chatId, STEP_TEXTS[9], {
    reply_markup: {
      inline_keyboard: [
        [{ text: CTA_LABELS.cta_subscribe, callback_data: 'cta_subscribe' }],
        [{ text: CTA_LABELS.cta_site, callback_data: 'cta_site' }],
        [{ text: CTA_LABELS.cta_consult, callback_data: 'cta_consult' }],
        [{ text: CTA_LABELS.cta_custom, callback_data: 'cta_custom' }],
      ],
    },
  });
}

function applySafeMode(data: OnboardingData): void {
  data.operationMode = 'safe';
}

function applyTurboMode(data: OnboardingData): void {
  data.operationMode = 'turbo';
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
    });
    if (existing?.onboardingDone) {
      await ctx.reply('Бриф уже заполнен! Если нужна новая настройка — обратитесь к администратору.');
      return;
    }
    const steps = await getStepsByOrder();
    const welcomeStep = steps.find((s) => s.stepOrder === 0);
    if (welcomeStep?.fileId) await ctx.replyWithVideoNote(welcomeStep.fileId);
    await ctx.reply(WELCOME_TEXT, {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Настроить Контент Решалу', callback_data: 'start_onboarding' }]],
      },
    });
  });

  bot.action('start_onboarding', async (ctx) => {
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (typeof chatId !== 'number') return;
    await ctx.answerCbQuery();
    await setOnboardingSession(chatId, {
      step: 1,
      data: {},
      status: 'steps',
    });
    const steps = await getStepsByOrder();
    await sendStep1(bot, chatId, steps);
  });

  bot.on('callback_query', async (ctx) => {
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (typeof chatId !== 'number') return;
    const session = await getOnboardingSession(chatId);
    if (!session || session.status !== 'steps') {
      await ctx.answerCbQuery();
      return;
    }
    const data = session.data;
    const cb = (ctx.callbackQuery as { data?: string }).data;
    if (!cb) {
      await ctx.answerCbQuery();
      return;
    }

    if (cb.startsWith('tone_')) {
      if (cb === 'tone_custom') {
        data.waitingCustomInput = 'tonality';
        await setOnboardingSession(chatId, { ...session, data });
        await ctx.answerCbQuery();
        await ctx.reply('Надиктуйте или напишите свой стиль общения.');
        return;
      }
      data.tonality = TONALITY_VALUES[cb] ?? cb;
      await setOnboardingSession(chatId, { ...session, step: 2, data });
      await ctx.answerCbQuery();
      const steps = await getStepsByOrder();
      await sendStep2(bot, chatId, steps);
      return;
    }

    if (cb.startsWith('aud_')) {
      if (cb === 'aud_custom') {
        data.waitingCustomInput = 'targetAudience';
        await setOnboardingSession(chatId, { ...session, data });
        await ctx.answerCbQuery();
        await ctx.reply('Надиктуйте или напишите свою аудиторию.');
        return;
      }
      data.targetAudience = AUDIENCE_VALUES[cb] ?? cb;
      await setOnboardingSession(chatId, { ...session, step: 3, data });
      await ctx.answerCbQuery();
      const steps = await getStepsByOrder();
      await sendStep3(bot, chatId, steps);
      return;
    }

    if (cb.startsWith('img_')) {
      if (cb === 'img_custom') {
        data.waitingCustomInput = 'imageStyle';
        await setOnboardingSession(chatId, { ...session, data });
        await ctx.answerCbQuery();
        await ctx.reply('Напишите или надиктуйте свой стиль картинок.');
        return;
      }
      data.imageStyle = IMAGE_STYLE_VALUES[cb] ?? cb;
      await setOnboardingSession(chatId, { ...session, step: 5, data });
      await ctx.answerCbQuery();
      await sendStep5(bot, chatId, data.contentTypes ?? []);
      return;
    }

    if (cb.startsWith('fmt_')) {
      if (cb === 'fmt_save') {
        await setOnboardingSession(chatId, { ...session, step: '5.1', data });
        await ctx.answerCbQuery();
        await ctx.reply('Напишите отдельным сообщением роль ИИ (например: «Ты — прораб с 20-летним стажем»).');
        return;
      }
      if (cb === 'fmt_custom') {
        data.waitingCustomInput = 'contentFormats';
        await setOnboardingSession(chatId, { ...session, data });
        await ctx.answerCbQuery();
        await ctx.reply('Напишите или надиктуйте свой формат.');
        return;
      }
      const list = data.contentTypes ?? [];
      const idx = list.indexOf(cb);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(cb);
      data.contentTypes = list;
      await setOnboardingSession(chatId, { ...session, data });
      await ctx.answerCbQuery();
      await sendStep5(bot, chatId, data.contentTypes);
      return;
    }

    if (cb === 'skip_sources') {
      data.trustedSites = [];
      await setOnboardingSession(chatId, { ...session, step: 7, data });
      await ctx.answerCbQuery();
      await sendStep7(bot, chatId, data.negativePromptList ?? []);
      return;
    }

    if (cb.startsWith('stop_')) {
      if (cb === 'stop_save') {
        const parts = (data.negativePromptList ?? []).map((c) => STOP_WORDS_OPTIONS.find((o) => o.cb === c)?.value).filter(Boolean);
        if (data.negativePromptCustom) parts.push(data.negativePromptCustom);
        data.negativePrompt = parts.join(' ');
        await setOnboardingSession(chatId, { ...session, step: 8, data });
        await ctx.answerCbQuery();
        await sendStep8(bot, chatId);
        return;
      }
      if (cb === 'stop_custom') {
        data.waitingCustomInput = 'negativePrompt';
        await setOnboardingSession(chatId, { ...session, data });
        await ctx.answerCbQuery();
        await ctx.reply('Напишите или надиктуйте свои стоп-слова.');
        return;
      }
      const list = data.negativePromptList ?? [];
      const idx = list.indexOf(cb);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(cb);
      data.negativePromptList = list;
      await setOnboardingSession(chatId, { ...session, data });
      await ctx.answerCbQuery();
      await sendStep7(bot, chatId, data.negativePromptList);
      return;
    }

    if (cb === 'mode_safe') {
      applySafeMode(data);
      await setOnboardingSession(chatId, { ...session, step: '8.1', data });
      await ctx.answerCbQuery();
      await sendStep8_1(bot, chatId);
      return;
    }
    if (cb === 'mode_turbo') {
      applyTurboMode(data);
      await setOnboardingSession(chatId, { ...session, step: '8.1', data });
      await ctx.answerCbQuery();
      await sendStep8_1(bot, chatId);
      return;
    }

    if (cb === 'mod_yes') {
      data.moderationEnabled = true;
      await setOnboardingSession(chatId, { ...session, step: 9, data });
      await ctx.answerCbQuery();
      await sendStep9(bot, chatId);
      return;
    }
    if (cb === 'mod_no') {
      data.moderationEnabled = false;
      await setOnboardingSession(chatId, { ...session, step: 9, data });
      await ctx.answerCbQuery();
      await sendStep9(bot, chatId);
      return;
    }

    if (cb.startsWith('cta_')) {
      if (cb === 'cta_custom') {
        data.waitingCustomInput = 'cta';
        await setOnboardingSession(chatId, { ...session, data });
        await ctx.answerCbQuery();
        await ctx.reply('Надиктуйте свой призыв к действию.');
        return;
      }
      data.cta = CTA_VALUES[cb] ?? cb;
      await setOnboardingSession(chatId, { ...session, step: 'email', status: 'waiting_email', data });
      await ctx.answerCbQuery();
      const summary = [
        '🎉 Готово! Настройка Контент-Завода успешно завершена!',
        'Вы великолепны! Вот как выглядит ваш личный конвейер контента.',
        '🛠 Все ваши ответы будут перенесены в Рабочую Таблицу.',
        'Пожалуйста, напишите ваш Google Email, чтобы мы выдали доступ к таблице.',
      ].join('\n\n');
      await ctx.reply(summary);
      return;
    }

    await ctx.answerCbQuery();
  });

  async function handleTextOrTranscribed(chatId: number, text: string, session: OnboardingSession) {
    const data = session.data;

    if (data.waitingCustomInput) {
      const field = data.waitingCustomInput;
      delete data.waitingCustomInput;
      if (field === 'tonality') {
        data.tonality = text;
        await setOnboardingSession(chatId, { ...session, step: 2, data });
        const steps = await getStepsByOrder();
        await sendStep2(bot, chatId, steps);
        return;
      }
      if (field === 'targetAudience') {
        data.targetAudience = text;
        await setOnboardingSession(chatId, { ...session, step: 3, data });
        const steps = await getStepsByOrder();
        await sendStep3(bot, chatId, steps);
        return;
      }
      if (field === 'imageStyle') {
        data.imageStyle = text;
        await setOnboardingSession(chatId, { ...session, step: 5, data });
        await sendStep5(bot, chatId, data.contentTypes ?? []);
        return;
      }
      if (field === 'contentFormats') {
        data.contentTypes = [...(data.contentTypes ?? []), text];
        await setOnboardingSession(chatId, { ...session, step: '5.1', data });
        await bot.telegram.sendMessage(chatId, 'Напишите роль ИИ (например: «Ты — прораб с 20-летним стажем»).');
        return;
      }
      if (field === 'negativePrompt') {
        data.negativePromptCustom = text;
        await setOnboardingSession(chatId, { ...session, step: 8, data });
        await sendStep8(bot, chatId);
        return;
      }
      if (field === 'cta') {
        data.cta = text;
        await setOnboardingSession(chatId, { ...session, step: 'email', status: 'waiting_email', data });
        await bot.telegram.sendMessage(chatId, 'Пожалуйста, напишите ваш Google Email для доступа к таблице.');
        return;
      }
      if (field === 'role') {
        data.role = text;
        await setOnboardingSession(chatId, { ...session, step: 6, data });
        await sendStep6(bot, chatId);
        return;
      }
      return;
    }

    if (session.step === 3) {
      data.productDna = text;
      data.freeformAnswers = [...(data.freeformAnswers ?? []), text];
      await setOnboardingSession(chatId, { ...session, step: 4, data });
      await sendStep4(bot, chatId);
      return;
    }

    if (session.step === '5.1') {
      data.role = text;
      await setOnboardingSession(chatId, { ...session, step: 6, data });
      await sendStep6(bot, chatId);
      return;
    }

    if (session.step === 6) {
      const urls = text.split(/\s+/).filter((s) => /^https?:\/\//i.test(s));
      data.trustedSites = urls.length > 0 ? urls : (data.trustedSites ?? []);
      await setOnboardingSession(chatId, { ...session, step: 7, data });
      await sendStep7(bot, chatId, data.negativePromptList ?? []);
      return;
    }

    await bot.telegram.sendMessage(chatId, 'Нажмите кнопку или напишите ответ по текущему шагу. Если нужна помощь — /start.');
  }

  bot.on(message('text'), async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const session = await getOnboardingSession(chatId);
    if (!session) {
      await ctx.reply('Нажмите /start, чтобы начать.');
      return;
    }
    const text = ctx.message.text.trim();

    if (session.status === 'waiting_email' && session.step === 'email') {
      if (!isValidEmail(text)) {
        await ctx.reply('Введите корректный email (например, name@gmail.com).');
        return;
      }
      await ctx.reply('⏳ Создаю вашу фабрику контента...');
      try {
        const { clientName, niche, settings } = await extractClientSettingsFromData(session.data);
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
        const templateId = config.google.templateSpreadsheetId?.trim();
        if (templateId) {
          const { spreadsheetId, spreadsheetUrl } = await createClientTable(templateId, clientName, {
            shareWithEmail: text,
            hideTechnicalColumns: true,
          });
          await prisma.client.update({
            where: { id: client.id },
            data: { spreadsheetId, onboardingDone: true, isActive: true },
          });
          const instructionLine = managerInstructionUrl
            ? `\n\n📋 Инструкция для менеджера: ${managerInstructionUrl}`
            : '';
          await ctx.reply(
            `🎉 Готово! Ваша таблица управления: ${spreadsheetUrl}\n\nДобавьте OpenRouter API Key в настройки (администратор подскажет).${instructionLine}`
          );
          await notifyAdminsAboutNewBrief(bot, {
            clientName,
            email: text,
            niche,
            spreadsheetUrl,
          });
        } else {
          await prisma.client.update({
            where: { id: client.id },
            data: { onboardingDone: true },
          });
          const instructionLine = managerInstructionUrl
            ? `\n\n📋 Инструкция для менеджера: ${managerInstructionUrl}`
            : '';
          await ctx.reply(`Бриф сохранён. Администратор создаст таблицу и вышлет ссылку.${instructionLine}`);
          await notifyAdminsAboutNewBrief(bot, { clientName, email: text, niche });
        }
        await deleteOnboardingSession(chatId);
      } catch (e) {
        logWarn('Onboarding provisioning error', { chatId, error: (e as Error).message });
        await ctx.reply('Произошла ошибка. Обратитесь к администратору.');
      }
      return;
    }

    await handleTextOrTranscribed(chatId, text, session);
  });

  bot.on(message('voice'), async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const session = await getOnboardingSession(chatId);
    if (!session || session.status !== 'steps') {
      await ctx.reply('Нажмите /start или ответьте текстом.');
      return;
    }
    await ctx.reply('⏳ Расшифровываю...');
    let text = '';
    try {
      const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const href = typeof link === 'string' ? link : (link as { href: string }).href;
      const base64 = await downloadAndConvertToMp3Base64(href);
      text = await transcribeAudio(base64) || '';
    } catch (e) {
      logWarn('Voice transcription error', { chatId, error: (e as Error).message });
      await ctx.reply('Не удалось расшифровать. Напишите текстом.');
      return;
    }
    if (text) await handleTextOrTranscribed(chatId, text, session);
  });

  bot.on(message('video_note'), async (ctx) => {
    const chatId = getChatId(ctx);
    if (chatId === undefined) return;
    const session = await getOnboardingSession(chatId);
    if (!session || session.status !== 'steps') return;
    await ctx.reply('⏳ Расшифровываю...');
    let text = '';
    try {
      const link = await ctx.telegram.getFileLink(ctx.message.video_note.file_id);
      const href = typeof link === 'string' ? link : (link as { href: string }).href;
      const base64 = await downloadAndConvertToMp3Base64(href);
      text = await transcribeAudio(base64) || '';
    } catch (e) {
      logWarn('Video note transcription error', { chatId, error: (e as Error).message });
      await ctx.reply('Не удалось расшифровать. Напишите текстом.');
      return;
    }
    if (text) await handleTextOrTranscribed(chatId, text, session);
  });

  bot.launch().then(() => logInfo('Onboarding bot started')).catch((e) => {
    logWarn('Onboarding bot launch failed', { error: (e as Error).message });
  });
}
