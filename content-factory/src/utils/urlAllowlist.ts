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

function getS3HostPattern(): RegExp | null {
  try {
    const u = new URL(config.s3.endpoint);
    const host = u.hostname.replace(/\./g, '\\.');
    return new RegExp(`^${host}$`, 'i');
  } catch {
    return null;
  }
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
    return false;
  } catch {
    return false;
  }
}
