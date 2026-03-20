/**
 * Загрузка .env, константы и типы конфигурации.
 */
import 'dotenv/config';
import path from 'path';

function env(key: string, defaultValue?: string): string {
  const v = process.env[key] ?? defaultValue;
  if (v === undefined) throw new Error(`Missing env: ${key}`);
  return v;
}

function envOptional(key: string, defaultValue = ''): string {
  return process.env[key] ?? defaultValue;
}

function envNum(key: string, defaultValue: number): number {
  const v = process.env[key];
  if (v === undefined) return defaultValue;
  const n = Number(v);
  if (Number.isNaN(n)) return defaultValue;
  return n;
}

export const config = {
  google: {
    serviceAccountKey: path.resolve(process.cwd(), env('GOOGLE_SERVICE_ACCOUNT_KEY')),
    /** Рабочая таблица (планировщик при одном канале / legacy). Не использовать как источник копии для онбординга. */
    spreadsheetId: env('SPREADSHEET_ID'),
    /**
     * Отдельная эталонная таблица для копии при онбординге / create-client-table.
     * Обязан отличаться от SPREADSHEET_ID; иначе копируется «основная» таблица с данными.
     */
    templateSpreadsheetId: envOptional('TEMPLATE_SPREADSHEET_ID'),
    /**
     * ID папки Google Drive, куда класть копии таблиц клиентов.
     * Важно: при копировании от имени SA владельцем файла остаётся SA — у него нет квоты → storageQuotaExceeded,
     * даже если папка в вашем «Моём диске». Обход: папка на Shared drive (Workspace) + SA в участниках, либо OAuth ниже.
     */
    clientTablesFolderId: envOptional('GOOGLE_DRIVE_CLIENT_TABLES_FOLDER_ID'),
    /**
     * OAuth 2.0 (Desktop app) + refresh token владельца с квотой: копирование шаблона через Drive API от имени этого пользователя.
     * После копии права как раньше выдаются сервисному аккаунту. Задавать все три или ни одного.
     * Scope при выдаче токена: https://www.googleapis.com/auth/drive (шаблон и папка должны быть доступны этому Google-аккаунту).
     */
    driveCopyOAuthClientId: envOptional('GOOGLE_DRIVE_COPY_OAUTH_CLIENT_ID'),
    driveCopyOAuthClientSecret: envOptional('GOOGLE_DRIVE_COPY_OAUTH_CLIENT_SECRET'),
    driveCopyOAuthRefreshToken: envOptional('GOOGLE_DRIVE_COPY_OAUTH_REFRESH_TOKEN'),
    /** Email админа — всегда выдаётся доступ writer к новым таблицам клиентов. */
    adminEmail: envOptional('ADMIN_GOOGLE_EMAIL'),
  },
  openrouter: {
    apiKey: env('OPENROUTER_API_KEY'),
    groundingModel: env('OPENROUTER_GROUNDING_MODEL', 'perplexity/sonar'),
    textModel: env('OPENROUTER_TEXT_MODEL', 'deepseek/deepseek-chat'),
    imageModel: env('OPENROUTER_IMAGE_MODEL', 'google/gemini-3.1-flash-image-preview'),
    /** Модель для транскрибации голоса/видео (поддержка input_audio). */
    transcriptionModel: envOptional('OPENROUTER_TRANSCRIPTION_MODEL', 'google/gemini-2.5-flash'),
  },
  yandex: {
    oauthToken: envOptional('YANDEX_OAUTH_TOKEN'),
    wordstatClientId: envOptional('YANDEX_WORDSTAT_CLIENT_ID'),
  },
  s3: {
    endpoint: envOptional('S3_ENDPOINT', 'https://s3.beget.com'),
    accessKey: envOptional('S3_ACCESS_KEY'),
    secretKey: envOptional('S3_SECRET_KEY'),
    bucket: envOptional('S3_BUCKET', 'content-factory-images'),
  },
  telegram: {
    botToken: env('TELEGRAM_BOT_TOKEN'),
    channelId: env('TELEGRAM_CHANNEL_ID'),
    notifyChatId: env('TELEGRAM_NOTIFY_CHAT_ID'),
  },
  redis: {
    url: envOptional('REDIS_URL', 'redis://localhost:6379'),
  },
  api: {
    /** Порт HTTP API (POST /api/onboarding). При 0 или отсутствии ONBOARDING_API_SECRET — API не запускается. */
    port: envNum('API_PORT', 3100),
    /** Bearer-токен для авторизации веб-онбординга. Обязателен для запуска API. */
    secret: envOptional('ONBOARDING_API_SECRET'),
  },
  schedule: {
    pollIntervalMs: envNum('POLL_INTERVAL_MS', 60_000),
    maxArticlesPerDay: envNum('MAX_ARTICLES_PER_DAY', 10),
    retryAttempts: envNum('RETRY_ATTEMPTS', 3),
    retryBaseDelayMs: envNum('RETRY_BASE_DELAY_MS', 2000),
    /** Таймаут запросов к OpenRouter, мс (защита от зависания). */
    openrouterTimeoutMs: envNum('OPENROUTER_TIMEOUT_MS', 120_000),
    /**
     * Мульти-клиент: на каждом цикле планировщика — лист «Настройки» → client_settings в БД.
     * Отключить: DISABLE_SHEET_SETTINGS_SYNC=1
     */
    sheetSettingsSyncFromSheet: !/^(1|true|yes)$/i.test(
      (process.env.DISABLE_SHEET_SETTINGS_SYNC ?? '').trim()
    ),
  },
} as const;
