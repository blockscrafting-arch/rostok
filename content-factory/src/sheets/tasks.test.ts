import { describe, it, expect } from 'vitest';
import { parseFrequencyLimit, parseRow } from './tasks';

describe('parseFrequencyLimit', () => {
  it('парсит число', () => {
    expect(parseFrequencyLimit(300)).toBe(300);
    expect(parseFrequencyLimit('500')).toBe(500);
  });

  it('парсит диапазон "min-max"', () => {
    const r = parseFrequencyLimit('300-500') as { min: number; max: number };
    expect(r).toEqual({ min: 300, max: 500 });
    const r2 = parseFrequencyLimit('100-200') as { min: number; max: number };
    expect(r2).toEqual({ min: 100, max: 200 });
  });

  it('при min > max меняет местами', () => {
    const r = parseFrequencyLimit('500-300') as { min: number; max: number };
    expect(r).toEqual({ min: 300, max: 500 });
  });

  it('при пустой строке возвращает 0 (Number("") === 0)', () => {
    expect(parseFrequencyLimit('')).toBe(0);
  });

  it('при некорректной строке возвращает 300', () => {
    expect(parseFrequencyLimit('abc')).toBe(300);
  });

  it('при null/undefined через (v ?? "") получается пустая строка → 0', () => {
    expect(parseFrequencyLimit(null)).toBe(0);
  });

  it('при отрицательном числе возвращает 300', () => {
    expect(parseFrequencyLimit(-1)).toBe(300);
  });
});

function row(
  keyword: string,
  status: string,
  frequencyLimit: string | number = 300,
  headline = '',
  keywords = ''
): unknown[] {
  return [
    keyword,
    frequencyLimit,
    headline,
    keywords,
    status,
    '', '', '', '', '', '', '', '', '', '',
  ];
}

describe('parseRow', () => {
  it('возвращает Task для валидной строки', () => {
    const r = parseRow(row('роза', 'Согласован заголовок', '300-500', 'Заголовок', 'роза, куст'), 2);
    expect(r).not.toBeNull();
    expect(r!.keyword).toBe('роза');
    expect(r!.status).toBe('Согласован заголовок');
    expect(r!.rowIndex).toBe(2);
    expect(r!.frequencyLimit).toEqual({ min: 300, max: 500 });
    expect(r!.headline).toBe('Заголовок');
    expect(r!.keywords).toBe('роза, куст');
  });

  it('возвращает null при пустом ключевом слове', () => {
    expect(parseRow(row('', 'Новое'), 2)).toBeNull();
  });

  it('возвращает null при пустом статусе', () => {
    expect(parseRow(row('роза', ''), 2)).toBeNull();
  });

  it('возвращает null при невалидном статусе', () => {
    expect(parseRow(row('роза', 'Черновик'), 2)).toBeNull();
  });

  it('принимает все допустимые статусы', () => {
    const statuses = [
      'Новое', 'На согласовании', 'Согласован заголовок', 'Генерация',
      'Текст готов, ждём картинку', 'Готово к проверке', 'Одобрено на публикацию',
      'Опубликовано', 'Ошибка', 'На доработку', 'Перегенерировать картинку',
    ];
    for (const status of statuses) {
      const r = parseRow(row('к', status), 5);
      expect(r).not.toBeNull();
      expect(r!.status).toBe(status);
    }
  });
});
