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
  },
  openrouter: {
    apiKey: env('OPENROUTER_API_KEY'),
    groundingModel: env('OPENROUTER_GROUNDING_MODEL', 'perplexity/sonar'),
    textModel: env('OPENROUTER_TEXT_MODEL', 'deepseek/deepseek-chat'),
    imageModel: env('OPENROUTER_IMAGE_MODEL', 'google/gemini-3.1-flash-image-preview'),
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
  schedule: {
    pollIntervalMs: envNum('POLL_INTERVAL_MS', 60_000),
    maxArticlesPerDay: envNum('MAX_ARTICLES_PER_DAY', 10),
    retryAttempts: envNum('RETRY_ATTEMPTS', 3),
    retryBaseDelayMs: envNum('RETRY_BASE_DELAY_MS', 2000),
  },
  usdRubRate: envNum('USD_RUB_RATE', 100),
} as const;
