/**
 * Скачивание голосовых и видеокружочков из Telegram, конвертация в mp3 и транскрибация через OpenRouter (Gemini).
 * Конвертация через child_process.spawn (без deprecated fluent-ffmpeg).
 */
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import pLimit from 'p-limit';
import { config } from '../config';
import { assertHostnameResolvesToPublicIp } from '../utils/ssrfResolve';

/** Семафор для ffmpeg: не более 2 одновременных конвертаций (DoS-защита). */
const ffmpegLimit = pLimit(2);

const MAX_DOWNLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const DOWNLOAD_TIMEOUT_MS = 60_000; // 60 seconds

const TRANSCRIBE_PROMPT = `Ты — профессиональный транскрибатор. Твоя задача — точно перевести речь из прикрепленного аудио в текст.
Правила:
1. Выведи ТОЛЬКО расшифрованный текст.
2. Не добавляй от себя никаких комментариев, приветствий или описаний звуков.
3. Сохраняй смысл и термины как есть.`;

/** Путь к ffmpeg из пакета @ffmpeg-installer/ffmpeg. */
function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path as string;
  } catch {
    return 'ffmpeg';
  }
}

/** Определить расширение по URL для корректной работы ffmpeg. */
function getExtensionFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.webm')) return '.webm';
  if (lower.includes('.ogg') || lower.includes('.oga') || lower.includes('voice')) return '.ogg';
  if (lower.includes('.mp3')) return '.mp3';
  if (lower.includes('.m4a')) return '.m4a';
  if (lower.includes('.wav')) return '.wav';
  return '.mp4';
}

/**
 * Скачать аудио/видео по URL, конвертировать в mp3 и вернуть base64.
 * Поддерживает URL из Telegram (getFileLink) и внешние ссылки (webm, mp3, ogg и т.д.).
 * Реализованы защиты: таймаут на скачивание, лимит размера (25 МБ), блокировка локальных IP.
 * @param fileLinkUrl — URL файла.
 */
export async function downloadAndConvertToMp3Base64(fileLinkUrl: string): Promise<string> {
  const parsedUrl = new URL(fileLinkUrl);
  const hostname = parsedUrl.hostname;
  const protocol = parsedUrl.protocol;

  if (protocol !== 'https:') {
    throw new Error('Forbidden URL hostname');
  }

  // Защита от SSRF: блокировка локальных и приватных адресов
  const blocked: string[] = [
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    // IPv6-mapped IPv4
    '::ffff:127.0.0.1',
    '::ffff:127.0.0.0',
    '::ffff:0.0.0.0',
    // IPv6 loopback
    '::1',
  ];
  if (blocked.includes(hostname.toLowerCase())) {
    throw new Error('Forbidden URL hostname');
  }
  if (
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    throw new Error('Forbidden URL hostname');
  }
  // IPv6 loopback, link-local, unique-local
  if (
    hostname === '[::1]' ||
    /^\[::ffff:127\./.test(hostname) ||
    /^\[::ffff:0\./.test(hostname) ||
    /^\[fe80:/i.test(hostname) ||
    /^\[fc00:/i.test(hostname) ||
    /^\[fd00:/i.test(hostname)
  ) {
    throw new Error('Forbidden URL hostname');
  }
  // Cloud metadata: 169.254.169.254 (AWS, GCP, etc.)
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    throw new Error('Forbidden URL hostname');
  }

  await assertHostnameResolvesToPublicIp(hostname);

  const ac = new AbortController();
  const fetchTimeout = setTimeout(() => ac.abort(), DOWNLOAD_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(fileLinkUrl, { signal: ac.signal });
  } catch (e) {
    clearTimeout(fetchTimeout);
    throw new Error(`Failed to fetch file: ${(e as Error).message}`);
  }
  clearTimeout(fetchTimeout);

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`);
  }

  const contentLength = Number(res.headers.get('content-length'));
  if (!Number.isNaN(contentLength) && contentLength > MAX_DOWNLOAD_SIZE_BYTES) {
    throw new Error(`File too large (max ${MAX_DOWNLOAD_SIZE_BYTES} bytes)`);
  }

  const ext = getExtensionFromUrl(fileLinkUrl);
  const tempIn = path.join(os.tmpdir(), `tg-in-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const tempOut = path.join(os.tmpdir(), `tg-out-${Date.now()}.mp3`);
  
  const body = res.body;
  if (!body) {
    throw new Error('Response has no body');
  }

  const nodeReadable = Readable.fromWeb(body as import('stream/web').ReadableStream);
  const writeStream = fs.createWriteStream(tempIn);

  let downloadedBytes = 0;
  const sizeLimiter = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      if (downloadedBytes > MAX_DOWNLOAD_SIZE_BYTES) {
        callback(new Error(`File size exceeded ${MAX_DOWNLOAD_SIZE_BYTES} bytes limit during download`));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(nodeReadable, sizeLimiter, writeStream);

  return ffmpegLimit(async () => runFfmpegConversion(tempIn, tempOut));
}

async function runFfmpegConversion(tempIn: string, tempOut: string): Promise<string> {
  const FFMPEG_TIMEOUT_MS = 60_000;
  try {
    const ffmpegPath = getFfmpegPath();
    let proc: childProcess.ChildProcess | null = null;
    const ffmpegPromise = new Promise<void>((resolve, reject) => {
      proc = childProcess.spawn(ffmpegPath, ['-y', '-i', tempIn, '-f', 'mp3', tempOut], {
        stdio: 'ignore',
      });
      proc.on('error', reject);
      proc.on('close', (code, signal) => {
        proc = null;
        if (code === 0) resolve();
        else reject(new Error(signal ? `ffmpeg ${signal}` : `ffmpeg exit ${code}`));
      });
    });
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (proc) {
          proc.kill('SIGKILL');
          proc = null;
        }
        reject(new Error('ffmpeg timeout'));
      }, FFMPEG_TIMEOUT_MS);
    });
    try {
      await Promise.race([ffmpegPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
    const outBuf = fs.readFileSync(tempOut);
    return outBuf.toString('base64');
  } finally {
    try {
      fs.unlinkSync(tempIn);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tempOut);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Транскрибировать аудио (base64 mp3) через OpenRouter (модель с поддержкой input_audio).
 */
export async function transcribeAudio(base64Audio: string): Promise<string> {
  const apiKey = config.openrouter.apiKey;
  const body = {
    model: config.openrouter.transcriptionModel || 'google/gemini-2.5-flash',
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: TRANSCRIBE_PROMPT },
          {
            type: 'input_audio' as const,
            input_audio: {
              data: base64Audio,
              format: 'mp3' as const,
            },
          },
        ],
      },
    ],
    stream: false,
  };
  const timeoutMs = config.schedule.openrouterTimeoutMs ?? 120_000;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: ac.signal,
  });
  clearTimeout(timeoutId);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter transcription failed: ${res.status} ${errText}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  return text;
}
