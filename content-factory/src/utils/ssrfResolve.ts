/**
 * Дополнительная защита от SSRF: после проверки hostname в URL — проверка,
 * что DNS не указывает на loopback / частные / link-local адреса.
 */
import * as net from 'net';
import { promises as dns } from 'dns';

/** true, если IP нельзя использовать для исходящего fetch (аудио). */
export function isDisallowedResolvedIp(ip: string): boolean {
  const v = ip.toLowerCase().trim();
  if (v.includes(':')) {
    if (v === '::1') return true;
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]{1,3}:/i.test(v)) return true;
    // Unique local fc00::/7
    if (v.startsWith('fc') || v.startsWith('fd')) return true;
    if (v.startsWith('::ffff:')) {
      const ipv4 = v.slice(7);
      if (net.isIPv4(ipv4)) return isDisallowedResolvedIp(ipv4);
    }
    return false;
  }
  const parts = v.split('.').map((x) => parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b, c, d] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  return false;
}

/**
 * Убедиться, что hostname не резолвится в запрещённые адреса.
 * Для литеральных IP — только проверка диапазона.
 */
export async function assertHostnameResolvesToPublicIp(hostname: string): Promise<void> {
  const host =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  if (net.isIP(host)) {
    if (isDisallowedResolvedIp(host)) {
      throw new Error('Forbidden URL hostname');
    }
    return;
  }

  const ips: string[] = [];
  try {
    ips.push(...(await dns.resolve4(host)));
  } catch {
    /* нет A */
  }
  try {
    ips.push(...(await dns.resolve6(host)));
  } catch {
    /* нет AAAA */
  }

  if (ips.length === 0) {
    throw new Error('Forbidden URL hostname');
  }
  for (const ip of ips) {
    if (isDisallowedResolvedIp(ip)) {
      throw new Error('Forbidden URL hostname');
    }
  }
}
