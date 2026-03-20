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
    spreadsheetId: env('SPREADSHEET_ID'),
    /** ID эталонной таблицы для копирования новым клиентам (опционально). */
    templateSpreadsheetId: envOptional('TEMPLATE_SPREADSHEET_ID'),
    /**
     * ID папки Google Drive, куда класть копии таблиц клиентов.
     * Обязательно задать, если копирует сервисный аккаунт: без parents копия попадает в «Мой диск» SA (~0 квоты) → storageQuotaExceeded.
     * Папка должна быть расшарена на email сервисного аккаунта с правом редактора (или общий диск Shared drive).
     */
    clientTablesFolderId: envOptional('GOOGLE_DRIVE_CLIENT_TABLES_FOLDER_ID'),
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
  },
} as const;
