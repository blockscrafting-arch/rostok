/**
 * Allowlist URL для fetch: защита от SSRF (только https, разрешённые хосты).
 * Используется перед запросами к логотипам, референсным фото, картинкам из API.
 */
import { config } from '../config';

const ALLOWED_HOST_PATTERNS = [
  /^drive\.google\.com$/i,
  /^docs\.google\.com$/i,
  /\.googleapis\.com$/i,
  /\.googleusercontent\.com$/i,
  /^lh[0-9]+\.googleusercontent\.com$/i,
  /^www\.google\.com$/i,
];

// Ленивая инициализация: паттерны создаются один раз при первом вызове,
// config читается как const, поэтому пересчёт не нужен.
let _s3HostPattern: RegExp | null | undefined;
let _contentHostPattern: RegExp | null | undefined;

function getS3HostPattern(): RegExp | null {
  if (_s3HostPattern !== undefined) return _s3HostPattern;
  try {
    const u = new URL(config.s3.endpoint);
    const host = u.hostname.replace(/\./g, '\\.');
    _s3HostPattern = new RegExp(`^${host}$`, 'i');
  } catch {
    _s3HostPattern = null;
  }
  return _s3HostPattern;
}

function getContentHostPattern(): RegExp | null {
  if (_contentHostPattern !== undefined) return _contentHostPattern;
  const raw = config.s3.contentHost?.trim();
  if (!raw) {
    _contentHostPattern = null;
    return null;
  }
  try {
    // Принимаем как hostname или как полный URL (https://content.ex-ai.pro)
    const host = raw.startsWith('http') ? new URL(raw).hostname : raw;
    const escaped = host.replace(/\./g, '\\.');
    _contentHostPattern = new RegExp(`^${escaped}$`, 'i');
  } catch {
    _contentHostPattern = null;
  }
  return _contentHostPattern;
}

/**
 * Проверить, разрешён ли URL для исходящего fetch (только https, хосты в allowlist).
 * data: URL не разрешены для fetch (возвращает false).
 */
export function isFetchUrlAllowed(url: string): boolean {
  const s = (url ?? '').trim();
  if (!s) return false;
  if (s.startsWith('data:')) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname;
    for (const p of ALLOWED_HOST_PATTERNS) {
      if (p.test(host)) return true;
    }
    const s3 = getS3HostPattern();
    if (s3 && s3.test(host)) return true;
    const content = getContentHostPattern();
    if (content && content.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}
