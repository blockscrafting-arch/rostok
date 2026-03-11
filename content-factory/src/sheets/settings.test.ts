import { describe, it, expect } from 'vitest';
import { parseCatalogMap, parseImageGenerationMode } from './settings';

describe('parseImageGenerationMode', () => {
  it('"Сразу" → immediate', () => {
    expect(parseImageGenerationMode('Сразу')).toBe('immediate');
    expect(parseImageGenerationMode('  Сразу  ')).toBe('immediate');
  });

  it('immediate / 1 → immediate', () => {
    expect(parseImageGenerationMode('immediate')).toBe('immediate');
    expect(parseImageGenerationMode('1')).toBe('immediate');
  });

  it('по умолчанию и "По времени" → scheduled', () => {
    expect(parseImageGenerationMode('')).toBe('scheduled');
    expect(parseImageGenerationMode('По времени')).toBe('scheduled');
    expect(parseImageGenerationMode('scheduled')).toBe('scheduled');
  });
});

describe('parseCatalogMap', () => {
  it('парсит строки с табуляцией', () => {
    const text = 'Раздел\thttps://example.com/page\nДругой\thttps://example.com/other';
    expect(parseCatalogMap(text)).toEqual({
      'Раздел': 'https://example.com/page',
      'Другой': 'https://example.com/other',
    });
  });

  it('парсит строки с вертикальной чертой', () => {
    const text = 'Раздел | https://example.com/page\nДругой | https://example.com/other';
    expect(parseCatalogMap(text)).toEqual({
      'Раздел': 'https://example.com/page',
      'Другой': 'https://example.com/other',
    });
  });

  it('игнорирует пустые строки', () => {
    const text = '\n\nРаздел\turl\n\n\n';
    expect(parseCatalogMap(text)).toEqual({ 'Раздел': 'url' });
  });

  it('триммит пробелы по краям', () => {
    const text = '  Раздел  \t  https://url  ';
    expect(parseCatalogMap(text)).toEqual({ 'Раздел': 'https://url' });
  });

  it('игнорирует строки без разделителя', () => {
    const text = 'Раздел\turl\nТолько текст без таба';
    expect(parseCatalogMap(text)).toEqual({ 'Раздел': 'url' });
  });

  it('при пустой строке или пустом имени/url не добавляет запись', () => {
    expect(parseCatalogMap('')).toEqual({});
    const text = '\turl\nname\t';
    expect(parseCatalogMap(text)).toEqual({});
  });

  it('поддерживает \\r\\n', () => {
    const text = 'A\thttps://a.com\r\nB\thttps://b.com';
    expect(parseCatalogMap(text)).toEqual({ 'A': 'https://a.com', 'B': 'https://b.com' });
  });
});
