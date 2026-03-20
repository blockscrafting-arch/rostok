/**
 * Календарь и часы в часовом поясе Europe/Moscow (без зависимости от TZ контейнера).
 * Россия: постоянное смещение +03:00 (летнего перевода нет).
 */

export const MSK_TIMEZONE = 'Europe/Moscow';

const intlParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: MSK_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Компоненты даты/времени «настенных часов» в Москве для момента d (UTC). */
export function getMskParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = intlParts.formatToParts(d);
  const n = (t: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: n('hour'),
    minute: n('minute'),
    second: n('second'),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Момент времени по московским «настенным часам» (интерпретация как UTC+3).
 */
export function mskWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  return new Date(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+03:00`
  );
}

/** Начало текущих суток по Москве (00:00:00 MSK). */
export function mskTodayStart(d: Date = new Date()): Date {
  const { year, month, day } = getMskParts(d);
  return mskWallTimeToDate(year, month, day, 0, 0, 0);
}

/** Дата YYYY-MM-DD по календарю Москвы. */
export function formatDateYYYYMMDDInMsk(d: Date = new Date()): string {
  const { year, month, day } = getMskParts(d);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Строка для консольных логов: `[2026-03-20 15:30:45 MSK]`. */
export function formatLogTimestampMsk(d: Date = new Date()): string {
  const { year, month, day, hour, minute, second } = getMskParts(d);
  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)} MSK`;
}

/** Дата+время для листа «Лог» и JSON-логов (ISO-подобно, зона +03:00). */
export function formatIsoLikeMsk(d: Date = new Date()): string {
  const { year, month, day, hour, minute, second } = getMskParts(d);
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+03:00`;
}

/** Минуты с полуночи по Москве (для окон публикации, сводки и т.д.). */
export function minutesSinceMidnightMsk(d: Date = new Date()): number {
  const { hour, minute } = getMskParts(d);
  return hour * 60 + minute;
}

/** Ключ дня YYYY-MM-DD по Москве (лимит статей в день и т.п.). */
export function todayKeyMsk(d: Date = new Date()): string {
  return formatDateYYYYMMDDInMsk(d);
}

/** Число дней в календарном месяце (month 1–12), без привязки к TZ процесса. */
export function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}
