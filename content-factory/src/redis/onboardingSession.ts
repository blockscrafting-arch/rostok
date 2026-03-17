/**
 * Сессии онбординг-бота в Redis (переживают перезапуск процесса).
 * Структурированные данные по шагам (inline-кнопки + свободный ввод).
 */
import { connection } from '../queue';

const KEY_PREFIX = 'cf:onboarding:';
const TTL_SEC = 86400; // 24 часа

export interface OnboardingData {
  tonality?: string;
  targetAudience?: string;
  productDna?: string;
  imageStyle?: string;
  contentTypes?: string[];
  role?: string;
  trustedSites?: string[];
  negativePrompt?: string;
  /** Callback IDs выбранных стоп-слов (stop_prices и т.д.) до нажатия «Сохранить». */
  negativePromptList?: string[];
  negativePromptCustom?: string;
  operationMode?: string;
  moderationEnabled?: boolean;
  cta?: string;
  companyName?: string;
  niche?: string;
  logoUrl?: string;
  freeformAnswers?: string[];
  /** Поле, для которого ждём ввод голосом/текстом (tonality, targetAudience, role, cta и т.д.). */
  waitingCustomInput?: string;
}

export type OnboardingStepId =
  | 'welcome'
  | 1
  | 2
  | 3
  | 4
  | 5
  | '5.1'
  | 6
  | 7
  | 8
  | '8.1'
  | 9
  | 'email';

export interface OnboardingSession {
  step: OnboardingStepId;
  data: OnboardingData;
  status: 'steps' | 'waiting_email';
}

/** @deprecated Старая структура (stepIndex + answers). Используется для совместимости при чтении. */
export interface LegacyOnboardingSession {
  stepIndex?: number;
  answers?: string[];
  status?: 'steps' | 'waiting_email';
}

function sessionKey(chatId: number): string {
  return `${KEY_PREFIX}${chatId}`;
}

export async function getOnboardingSession(chatId: number): Promise<OnboardingSession | null> {
  const key = sessionKey(chatId);
  const raw = await connection.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OnboardingSession | LegacyOnboardingSession;
    if ('step' in parsed && typeof parsed.step !== 'undefined' && 'data' in parsed) {
      return parsed as OnboardingSession;
    }
    if (typeof (parsed as LegacyOnboardingSession).stepIndex === 'number') {
      const leg = parsed as LegacyOnboardingSession;
      const status = (leg.status as 'steps' | 'waiting_email') ?? 'steps';
      const step: OnboardingStepId =
        status === 'waiting_email' ? 'email' : ((leg.stepIndex ?? 0) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
      return {
        step,
        data: { freeformAnswers: leg.answers ?? [] },
        status,
      };
    }
    return parsed as OnboardingSession;
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
