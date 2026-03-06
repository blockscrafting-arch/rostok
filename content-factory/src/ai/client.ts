/**
 * OpenRouter API: один клиент для всех моделей (граундинг, текст, картинки).
 */
import OpenAI from 'openai';
import { config } from '../config';

export const openrouter = new OpenAI({
  apiKey: config.openrouter.apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
});
