import { describe, it, expect } from 'vitest';
import {
  buildAssignOpenRouterCallbackData,
  isPlausibleOpenRouterKey,
} from './openRouterKeyUtils';

describe('adminOpenRouterKey', () => {
  it('buildAssignOpenRouterCallbackData — валидный UUID', () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    expect(buildAssignOpenRouterCallbackData(id)).toBe(`ork:${id}`);
  });

  it('buildAssignOpenRouterCallbackData — невалидный id', () => {
    expect(() => buildAssignOpenRouterCallbackData('not-uuid')).toThrow();
  });

  it('isPlausibleOpenRouterKey', () => {
    expect(isPlausibleOpenRouterKey('sk-or-v1-012345678901234567890')).toBe(true);
    expect(isPlausibleOpenRouterKey('  sk-or-v1-abc  ')).toBe(false);
    expect(isPlausibleOpenRouterKey('short')).toBe(false);
    expect(isPlausibleOpenRouterKey('sk-openai-xxx')).toBe(false);
  });
});
