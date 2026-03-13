/**
 * Генерация фотореалистичной картинки растения (Gemini 3.1 Flash Image Preview / image-capable model).
 * Опционально: референсное фото сорта — модель генерирует изображение на его основе.
 * Промпты и модель можно задать в Настройках; в промпте подставляются {headline} и {text} (текст статьи).
 */
import type OpenAI from 'openai';
import { config } from '../config';
import { logInfo, logWarn } from '../utils/logger';
import { convertDriveUrlToDirectDownload } from '../utils/url';
import { isFetchUrlAllowed } from '../utils/urlAllowlist';
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
  /** Текст статьи для подстановки в плейсхолдер {text}. */
  articleText?: string;
}

/** Скачать картинку по URL и вернуть как data URL (base64). Только разрешённые хосты. */
async function fetchImageAsDataUrl(url: string): Promise<string> {
  const directUrl = convertDriveUrlToDirectDownload(url);
  if (!isFetchUrlAllowed(directUrl)) {
    throw new Error('URL not allowed for fetch (SSRF protection)');
  }
  const resp = await fetch(directUrl);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const base64 = buf.toString('base64');
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

function applyPlaceholders(template: string, headline: string, text: string = ''): string {
  return template
    .replace(/\{headline\}/gi, headline)
    .replace(/\{text\}/gi, text);
}

/**
 * Сгенерировать изображение по названию растения. Если передан referenceImageUrl (реальное фото сорта),
 * модель получает его в сообщении и генерирует картинку на его основе.
 * options: промпты из Настроек (пустые — дефолты из кода), модель (пустая — из config).
 * OpenRouter: chat/completions с modalities: ["image", "text"].
 */
export async function generatePlantImage(
  aiClient: OpenAI,
  plantNameOrHeadline: string,
  referenceImageUrl?: string,
  options: ImageGenerationOptions = {}
): Promise<ImageResult> {
  const promptNoRef = (options.promptImage?.trim() || DEFAULT_PROMPT_NO_REF).trim();
  const promptWithRef = (options.promptImageWithReference?.trim() || DEFAULT_PROMPT_WITH_REF).trim();
  const articleText = options.articleText ?? '';
  const textPrompt = referenceImageUrl
    ? applyPlaceholders(promptWithRef, plantNameOrHeadline, articleText)
    : applyPlaceholders(promptNoRef, plantNameOrHeadline, articleText);

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
  const promptLen = typeof messageContent === 'string' ? messageContent.length : messageContent.reduce((n, p) => n + (typeof (p as { text?: string }).text === 'string' ? (p as { text: string }).text.length : 0), 0);
  logInfo('Image API: request', {
    model,
    hasReferenceImage: !!referenceImageUrl,
    promptLength: promptLen,
    headlinePreview: plantNameOrHeadline.slice(0, 60),
  });

  const res = await aiClient.chat.completions.create({
    model,
    messages: [{ role: 'user', content: messageContent }],
    max_tokens: 4096,
    // OpenRouter extension: image output modality (SDK типизирует только "text" | "audio")
    modalities: ['image'] as unknown as Array<'text' | 'audio'>,
  });

  const choice0 = res.choices?.[0];
  const resAny = res as unknown as Record<string, unknown>;
  logInfo('Image API: response summary', {
    model,
    choicesLength: res.choices?.length ?? 0,
    choice0Keys: choice0 && typeof choice0 === 'object' ? Object.keys(choice0) : [],
    messageKeys: choice0?.message && typeof choice0.message === 'object' ? Object.keys(choice0.message as object) : [],
    responseTopKeys: Object.keys(resAny),
    hasError: 'error' in resAny && resAny.error != null,
  });
  if (resAny.error != null) {
    const errStr = typeof resAny.error === 'string' ? resAny.error : JSON.stringify(resAny.error);
    logWarn('Image API: response contains error field', { errorPreview: errStr.slice(0, 200) });
  }
  const msg = choice0?.message as
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
    const msgObj = msg && typeof msg === 'object' ? (msg as Record<string, unknown>) : null;
    /** Сериализация для лога без огромных base64. */
    const safeForLog = (obj: unknown, maxLen: number): unknown => {
      if (obj == null) return obj;
      if (typeof obj === 'string') {
        if (obj.startsWith('data:image/') || obj.startsWith('data:application/'))
          return `[BASE64, ${obj.length} chars]`;
        return obj.length > maxLen ? obj.slice(0, maxLen) + '...' : obj;
      }
      if (Array.isArray(obj)) return obj.map((x) => safeForLog(x, maxLen));
      if (typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = safeForLog(v, maxLen);
        return out;
      }
      return obj;
    };
    const resAny = res as unknown as Record<string, unknown>;
    logWarn('Image API: no image in response, full message structure', {
      model,
      choiceFinishReason: res.choices[0]?.finish_reason,
      messageKeys: msgObj ? Object.keys(msgObj) : [],
      message: safeForLog(msg, 500),
      contentPreview,
      responseError: resAny.error != null ? safeForLog(resAny.error, 200) : undefined,
    });
  } else {
    logInfo('Image API: image found', {
      model,
      source: msg?.images?.length ? 'images' : 'content',
      imageLength: imageUrl.length,
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
