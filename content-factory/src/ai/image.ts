/**
 * Генерация фотореалистичной картинки растения (Gemini 3.1 Flash Image Preview / image-capable model).
 * Опционально: референсное фото сорта — модель генерирует изображение на его основе.
 * Промпты и модель можно задать в Настройках; в промпте подставляется {headline}.
 */
import { openrouter } from './client';
import { config } from '../config';
import { logWarn } from '../utils/logger';
import { convertDriveUrlToDirectDownload } from '../utils/url';
import type { TokenUsage } from '../types';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';

export interface ImageResult {
  imageUrl: string;
  usage: TokenUsage;
  costUsd?: number;
}

const DEFAULT_PROMPT_NO_REF =
  'Photorealistic photo of {headline}, natural lighting, garden or nursery setting, high quality, smartphone photo style.';
const DEFAULT_PROMPT_WITH_REF =
  'This is a reference photo of the plant variety. Generate a new photorealistic image of the same plant in a natural garden or nursery setting, similar appearance and style, high quality, smartphone photo style. Plant/variety: {headline}.';

export interface ImageGenerationOptions {
  promptImage?: string;
  promptImageWithReference?: string;
  imageModel?: string;
}

/** Скачать картинку по URL и вернуть как data URL (base64). */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  const directUrl = convertDriveUrlToDirectDownload(url);
  const resp = await fetch(directUrl);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const base64 = buf.toString('base64');
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

function applyHeadline(template: string, headline: string): string {
  return template.replace(/\{headline\}/g, headline);
}

/**
 * Сгенерировать изображение по названию растения. Если передан referenceImageUrl (реальное фото сорта),
 * модель получает его в сообщении и генерирует картинку на его основе.
 * options: промпты из Настроек (пустые — дефолты из кода), модель (пустая — из config).
 * OpenRouter: chat/completions с modalities: ["image", "text"].
 */
export async function generatePlantImage(
  plantNameOrHeadline: string,
  referenceImageUrl?: string,
  options: ImageGenerationOptions = {}
): Promise<ImageResult> {
  const promptNoRef = (options.promptImage?.trim() || DEFAULT_PROMPT_NO_REF).trim();
  const promptWithRef = (options.promptImageWithReference?.trim() || DEFAULT_PROMPT_WITH_REF).trim();
  const textPrompt = referenceImageUrl
    ? applyHeadline(promptWithRef, plantNameOrHeadline)
    : applyHeadline(promptNoRef, plantNameOrHeadline);

  let messageContent: string | ChatCompletionContentPart[];
  if (referenceImageUrl) {
    const dataUrl =
      referenceImageUrl.startsWith('data:image/') || referenceImageUrl.startsWith('data:application/')
        ? referenceImageUrl
        : await fetchImageAsDataUrl(referenceImageUrl);
    messageContent = [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: textPrompt },
    ];
  } else {
    messageContent = textPrompt;
  }

  const model = options.imageModel?.trim() || config.openrouter.imageModel;
  const res = await openrouter.chat.completions.create({
    model,
    messages: [{ role: 'user', content: messageContent }],
    max_tokens: 4096,
    // OpenRouter extension: image output modality (SDK типизирует только "text" | "audio")
    modalities: ['image'] as unknown as Array<'text' | 'audio'>,
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

  if (!imageUrl) {
    const content = msg?.content;
    const contentPreview =
      typeof content === 'string'
        ? content.slice(0, 300)
        : Array.isArray(content)
          ? content.map((p: unknown) => (p && typeof p === 'object' && 'type' in p ? (p as { type: string }).type : typeof p))
          : undefined;
    const msgObj = msg && typeof msg === 'object' ? msg as Record<string, unknown> : null;
    logWarn('Image API: no image in response, logging structure', {
      model,
      hasMessage: !!msg,
      messageKeys: msgObj ? Object.keys(msgObj) : [],
      hasImages: !!(msg as { images?: unknown[] })?.images,
      imagesLength: Array.isArray((msg as { images?: unknown[] })?.images) ? (msg as { images?: unknown[] }).images!.length : 0,
      contentType: typeof content,
      contentPreview,
      choiceFinishReason: res.choices[0]?.finish_reason,
    });
  }

  const u = res.usage as { total_cost?: number; cost?: number } | undefined;
  const costUsd = u?.cost ?? u?.total_cost;
  const usage: TokenUsage = {
    prompt_tokens: res.usage?.prompt_tokens ?? 0,
    completion_tokens: res.usage?.completion_tokens ?? 0,
    total_tokens: res.usage?.total_tokens,
    total_cost: costUsd,
    model,
  };

  return {
    imageUrl,
    usage,
    costUsd,
  };
}
