/**
 * Генерация фотореалистичной картинки растения (Gemini 3.1 Flash Image Preview / image-capable model).
 */
import { openrouter } from './client';
import { config } from '../config';
import type { TokenUsage } from '../types';

export interface ImageResult {
  imageUrl: string;
  usage: TokenUsage;
  costUsd?: number;
}

/**
 * Сгенерировать изображение по названию растения. Возвращает URL (если модель отдаёт URL) или base64.
 * OpenRouter: chat/completions с modalities: ["image", "text"].
 */
export async function generatePlantImage(plantNameOrHeadline: string): Promise<ImageResult> {
  const prompt = `Photorealistic photo of ${plantNameOrHeadline}, natural lighting, garden or nursery setting, high quality, smartphone photo style.`;

  const res = await openrouter.chat.completions.create({
    model: config.openrouter.imageModel,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4096,
    // @ts-expect-error OpenRouter extension
    modalities: ['image', 'text'],
  });

  const msg = res.choices[0]?.message;
  let imageUrl = '';
  const content = msg?.content;
  if (typeof content === 'string' && content.startsWith('http')) {
    imageUrl = content.trim().split(/\s/)[0];
  } else if (Array.isArray(msg?.content)) {
    for (const part of msg.content as { type: string; image_url?: { url: string }; url?: string }[]) {
      if (part.type === 'image_url' && part.image_url?.url) {
        imageUrl = part.image_url.url;
        break;
      }
      if (part.url) {
        imageUrl = part.url;
        break;
      }
    }
  }

  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: u?.total_cost ?? u?.cost,
  };

  return {
    imageUrl,
    usage,
    costUsd: u?.total_cost ?? u?.cost,
  };
}
