/**
 * Фабрика OpenAI-совместимого клиента для OpenRouter.
 * Каждому клиенту — свой API Key, расходы учитываются по ключу.
 */
import OpenAI from 'openai';
import { config } from '../config';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE,
    timeout: config.schedule.openrouterTimeoutMs,
  });
}
