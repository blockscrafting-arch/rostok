import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFetchUrlAllowed } from './urlAllowlist';

describe('isFetchUrlAllowed', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('разрешает https drive.google.com', () => {
    expect(isFetchUrlAllowed('https://drive.google.com/file/d/123/view')).toBe(true);
  });

  it('разрешает docs.google.com', () => {
    expect(isFetchUrlAllowed('https://docs.google.com/document/d/abc')).toBe(true);
  });

  it('запрещает http', () => {
    expect(isFetchUrlAllowed('http://drive.google.com/file/d/123/view')).toBe(false);
  });

  it('запрещает data: URL', () => {
    expect(isFetchUrlAllowed('data:image/png;base64,abc')).toBe(false);
  });

  it('запрещает пустую строку и не-URL', () => {
    expect(isFetchUrlAllowed('')).toBe(false);
    expect(isFetchUrlAllowed('not-a-url')).toBe(false);
  });

  it('запрещает file: и внутренние хосты', () => {
    expect(isFetchUrlAllowed('file:///etc/passwd')).toBe(false);
    expect(isFetchUrlAllowed('https://localhost/')).toBe(false);
    expect(isFetchUrlAllowed('https://192.168.1.1/')).toBe(false);
  });
});
