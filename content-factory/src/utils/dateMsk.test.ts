import { describe, expect, it } from 'vitest';
import {
  daysInCalendarMonth,
  formatDateYYYYMMDDInMsk,
  formatLogTimestampMsk,
  getMskParts,
  minutesSinceMidnightMsk,
  mskWallTimeToDate,
} from './dateMsk';

describe('dateMsk', () => {
  it('getMskParts: 18:00 UTC = 21:00 same calendar day MSK', () => {
    const d = new Date('2026-03-20T18:00:00.000Z');
    expect(getMskParts(d)).toMatchObject({
      year: 2026,
      month: 3,
      day: 20,
      hour: 21,
      minute: 0,
      second: 0,
    });
  });

  it('formatDateYYYYMMDDInMsk', () => {
    expect(formatDateYYYYMMDDInMsk(new Date('2026-03-20T18:00:00.000Z'))).toBe('2026-03-20');
  });

  it('formatLogTimestampMsk содержит MSK', () => {
    const s = formatLogTimestampMsk(new Date('2026-03-20T18:00:00.000Z'));
    expect(s).toContain('2026-03-20');
    expect(s).toContain('21:00:00');
    expect(s).toContain('MSK');
  });

  it('mskWallTimeToDate интерпретирует часы как Москву', () => {
    const t = mskWallTimeToDate(2026, 6, 15, 10, 30, 0);
    expect(t.toISOString()).toBe('2026-06-15T07:30:00.000Z');
  });

  it('minutesSinceMidnightMsk', () => {
    const d = new Date('2026-03-20T18:00:00.000Z');
    expect(minutesSinceMidnightMsk(d)).toBe(21 * 60);
  });

  it('daysInCalendarMonth февраль високосный', () => {
    expect(daysInCalendarMonth(2024, 2)).toBe(29);
    expect(daysInCalendarMonth(2025, 2)).toBe(28);
  });
});
