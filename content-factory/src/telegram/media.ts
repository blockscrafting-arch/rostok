/**
 * Скачивание голосовых и видеокружочков из Telegram, конвертация в mp3 и транскрибация через OpenRouter (Gemini).
 * Конвертация через child_process.spawn (без deprecated fluent-ffmpeg).
 */
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { config } from '../config';

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

/**
 * Скачать файл из Telegram по file_id, конвертировать аудиодорожку в mp3 и вернуть base64.
 * Скачивание — потоком на диск (без загрузки всего файла в память).
 * @param fileLinkUrl — URL файла (результат getFileLink).
 */
export async function downloadAndConvertToMp3Base64(fileLinkUrl: string): Promise<string> {
  const res = await fetch(fileLinkUrl);
  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`);
  }
  const ext = fileLinkUrl.includes('.oga') || fileLinkUrl.includes('voice') ? '.ogg' : '.mp4';
  const tempIn = path.join(os.tmpdir(), `tg-in-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const tempOut = path.join(os.tmpdir(), `tg-out-${Date.now()}.mp3`);
  const body = res.body;
  if (!body) {
    throw new Error('Response has no body');
  }
  const nodeReadable = Readable.fromWeb(body as import('stream/web').ReadableStream);
  const writeStream = fs.createWriteStream(tempIn);
  await pipeline(nodeReadable, writeStream);
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
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        if (proc) {
          proc.kill('SIGKILL');
          proc = null;
        }
        reject(new Error('ffmpeg timeout'));
      }, FFMPEG_TIMEOUT_MS);
    });
    await Promise.race([ffmpegPromise, timeoutPromise]);
    const outBuf = fs.readFileSync(tempOut);
    return outBuf.toString('base64');
  } finally {
    try { fs.unlinkSync(tempIn); } catch { /* ignore */ }
    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
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
