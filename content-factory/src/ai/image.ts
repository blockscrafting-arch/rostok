/**
 * Генерация фотореалистичной картинки растения (Gemini 3.1 Flash Image Preview / image-capable model).
 * Опционально: референсное фото сорта — модель генерирует изображение на его основе.
 */
import { openrouter } from './client';
import { config } from '../config';
import type { TokenUsage } from '../types';

export interface ImageResult {
  imageUrl: string;
  usage: TokenUsage;
  costUsd?: number;
}

/** Скачать картинку по URL и вернуть как data URL (base64). */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const base64 = buf.toString('base64');
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

/**
 * Сгенерировать изображение по названию растения. Если передан referenceImageUrl (реальное фото сорта),
 * модель получает его в сообщении и генерирует картинку на его основе.
 * OpenRouter: chat/completions с modalities: ["image", "text"].
 */
export async function generatePlantImage(
  plantNameOrHeadline: string,
  referenceImageUrl?: string
): Promise<ImageResult> {
  const textPrompt = referenceImageUrl
    ? `This is a reference photo of the plant variety. Generate a new photorealistic image of the same plant in a natural garden or nursery setting, similar appearance and style, high quality, smartphone photo style. Plant/variety: ${plantNameOrHeadline}.`
    : `Photorealistic photo of ${plantNameOrHeadline}, natural lighting, garden or nursery setting, high quality, smartphone photo style.`;

  let messageContent: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
  if (referenceImageUrl) {
    const dataUrl =
      referenceImageUrl.startsWith('data:image/') || referenceImageUrl.startsWith('data:application/')
        ? referenceImageUrl
        : await fetchImageAsDataUrl(referenceImageUrl);
    messageContent = [
      { type: 'image_url' as const, image_url: { url: dataUrl } },
      { type: 'text' as const, text: textPrompt },
    ];
  } else {
    messageContent = textPrompt;
  }

  const res = await openrouter.chat.completions.create({
    model: config.openrouter.imageModel,
    messages: [{ role: 'user', content: messageContent }],
    max_tokens: 4096,
    // @ts-expect-error OpenRouter extension
    modalities: ['image'],
  });

  const msg = res.choices[0]?.message as
    | { content?: string | unknown[]; images?: Array<{ image_url?: { url?: string } }> }
    | undefined;
  let imageUrl = '';
  // Ищем Base64 картинку в специальном блоке (OpenRouter extension: message.images)
  if (msg?.images && Array.isArray(msg.images) && msg.images.length > 0) {
    const firstImage = msg.images[0];
    if (firstImage.image_url && typeof firstImage.image_url.url === 'string') {
      imageUrl = firstImage.image_url.url;
    }
  }

  // Fallback (если вдруг пришла ссылка в тексте)
  if (!imageUrl) {
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
  }

  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const costUsd = u?.cost ?? u?.total_cost;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: costUsd,
    model: config.openrouter.imageModel,
  };

  return {
    imageUrl,
    usage,
    costUsd,
  };
}
