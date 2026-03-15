/**
 * Сессии онбординг-бота в Redis (переживают перезапуск процесса).
 */
import { connection } from '../queue';

const KEY_PREFIX = 'cf:onboarding:';
const TTL_SEC = 86400; // 24 часа

export interface OnboardingSession {
  stepIndex: number;
  answers: string[];
  status: 'steps' | 'waiting_email';
}

function sessionKey(chatId: number): string {
  return `${KEY_PREFIX}${chatId}`;
}

export async function getOnboardingSession(chatId: number): Promise<OnboardingSession | null> {
  const key = sessionKey(chatId);
  const raw = await connection.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OnboardingSession;
  } catch {
    return null;
  }
}

export async function setOnboardingSession(chatId: number, session: OnboardingSession): Promise<void> {
  const key = sessionKey(chatId);
  await connection.set(key, JSON.stringify(session), 'EX', TTL_SEC);
}

export async function deleteOnboardingSession(chatId: number): Promise<void> {
  await connection.del(sessionKey(chatId));
}
