import { describe, it, expect } from 'vitest';
import { isDisallowedResolvedIp } from './ssrfResolve';

describe('isDisallowedResolvedIp', () => {
  it('блокирует loopback и частные IPv4', () => {
    expect(isDisallowedResolvedIp('127.0.0.1')).toBe(true);
    expect(isDisallowedResolvedIp('10.0.0.1')).toBe(true);
    expect(isDisallowedResolvedIp('192.168.1.1')).toBe(true);
    expect(isDisallowedResolvedIp('172.16.0.1')).toBe(true);
    expect(isDisallowedResolvedIp('169.254.0.1')).toBe(true);
    expect(isDisallowedResolvedIp('169.254.169.254')).toBe(true);
  });

  it('разрешает публичные IPv4', () => {
    expect(isDisallowedResolvedIp('8.8.8.8')).toBe(false);
    expect(isDisallowedResolvedIp('1.1.1.1')).toBe(false);
  });

  it('блокирует ::1 и IPv4-mapped loopback', () => {
    expect(isDisallowedResolvedIp('::1')).toBe(true);
    expect(isDisallowedResolvedIp('::ffff:127.0.0.1')).toBe(true);
  });
});
