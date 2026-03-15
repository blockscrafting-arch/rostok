import { describe, it, expect } from 'vitest';
import { isValidEmail } from './onboardingBot';

describe('isValidEmail', () => {
  it('принимает корректные email', () => {
    expect(isValidEmail('a@gmail.com')).toBe(true);
    expect(isValidEmail('user@company.co')).toBe(true);
    expect(isValidEmail('name.surname@domain.ru')).toBe(true);
    expect(isValidEmail('x@y.zz')).toBe(true);
  });

  it('отклоняет невалидные значения', () => {
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('no-at-sign.com')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@.com')).toBe(false);
    expect(isValidEmail('user@domain')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('  a@gmail.com  ')).toBe(false);
  });
});
