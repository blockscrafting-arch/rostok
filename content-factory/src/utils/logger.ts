/**
 * Логирование: консоль + при необходимости запись в лист «Лог».
 * Ошибки сериализуются с message и stack, чтобы в логах не было пустого {}.
 */
import { google } from 'googleapis';
import { config } from '../config';

const LOG_SHEET_NAME = 'Лог';
const MAX_STACK_LENGTH = 800;

const MAX_RESPONSE_PREVIEW = 400;

/** Извлечь безопасный превью ответа API из ошибки (OpenRouter/Axios-подобные). Для отладки при сбоях. */
export function getApiErrorResponsePreview(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const o = error as Record<string, unknown>;
  const errObj = o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>) : null;
  const data = o.response ?? errObj?.response ?? o.data;
  if (data == null) return undefined;
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.length > MAX_RESPONSE_PREVIEW ? str.slice(0, MAX_RESPONSE_PREVIEW) + '...' : str;
  } catch {
    return undefined;
  }
}

/** Сериализация ошибки для логов: сообщение и стек (обрезанный). */
export function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ? error.stack.slice(0, MAX_STACK_LENGTH) : undefined,
    };
  }
  return { message: String(error) };
}

/** При JSON.stringify подменяем Error на { message, stack }, иначе выйдет {}. */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.slice(0, MAX_STACK_LENGTH) };
  }
  return value;
}

function formatMsg(level: string, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const extra = meta !== undefined ? ` ${JSON.stringify(meta, jsonReplacer)}` : '';
  return `[${ts}] ${level} ${message}${extra}`;
}

export function logInfo(message: string, meta?: unknown): void {
  console.log(formatMsg('INFO', message, meta));
}

export function logWarn(message: string, meta?: unknown): void {
  console.warn(formatMsg('WARN', message, meta));
}

export function logError(message: string, error?: unknown): void {
  const { message: errMsg, stack } = serializeError(error ?? new Error(message));
  const meta = stack ? { message: errMsg, stack } : { message: errMsg };
  console.error(formatMsg('ERROR', message, meta));
}

/**
 * Записать строку в лист «Лог» (время, действие, результат, ошибка).
 * Не бросает исключение при сбое записи.
 * @param options.spreadsheetId — таблица клиента; при отсутствии используется config (одна таблица).
 */
export async function logToSheet(
  action: string,
  result: 'ok' | 'error',
  errorMessage?: string,
  options?: { spreadsheetId?: string }
): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const s = google.sheets({ version: 'v4', auth });
    const spreadsheetId = options?.spreadsheetId?.trim() || config.google.spreadsheetId;
    await s.spreadsheets.values.append({
      spreadsheetId,
      range: `'${LOG_SHEET_NAME}'!A:D`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), action, result, errorMessage ?? '']],
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Failed to write to Log sheet:', msg);
  }
}
