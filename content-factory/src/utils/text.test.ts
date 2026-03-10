import { describe, it, expect } from 'vitest';
import { cleanArticleFirstLine, truncateAtSentence } from './text';

describe('cleanArticleFirstLine', () => {
  it('убирает префикс "Заголовок:" с первой строки', () => {
    const input = 'Заголовок: Как вырастить розы\nВторой абзац.';
    expect(cleanArticleFirstLine(input)).toBe('Как вырастить розы\nВторой абзац.');
  });

  it('убирает префикс "{Заголовок}:" с первой строки', () => {
    const input = '{Заголовок}: 5 сортов для Сибири\nТекст статьи.';
    expect(cleanArticleFirstLine(input)).toBe('5 сортов для Сибири\nТекст статьи.');
  });

  it('убирает кавычки вокруг первой строки', () => {
    const input = '"Розы для начинающих"\nПервый абзац.';
    expect(cleanArticleFirstLine(input)).toBe('Розы для начинающих\nПервый абзац.');
  });

  it('убирает и префикс, и кавычки', () => {
    const input = 'Заголовок: "Как ухаживать"\nТекст.';
    expect(cleanArticleFirstLine(input)).toBe('Как ухаживать\nТекст.');
  });

  it('не меняет первую строку без артефактов', () => {
    const input = 'Обычный заголовок статьи\nВторой абзац.';
    expect(cleanArticleFirstLine(input)).toBe(input);
  });

  it('возвращает текст как есть при пустом массиве строк (пустая строка)', () => {
    expect(cleanArticleFirstLine('')).toBe('');
  });

  it('обрабатывает одну строку', () => {
    expect(cleanArticleFirstLine('Заголовок: Одна строка')).toBe('Одна строка');
  });

  it('регистронезависимо убирает префикс Заголовок', () => {
    expect(cleanArticleFirstLine('заголовок: С маленькой буквы')).toBe('С маленькой буквы');
  });
});

describe('truncateAtSentence', () => {
  it('не обрезает короткий текст', () => {
    const short = 'Один абзац.';
    expect(truncateAtSentence(short, 4000)).toBe(short);
  });

  it('обрезает по границе предложения', () => {
    const long = 'A. '.repeat(500) + 'Последнее предложение.';
    const result = truncateAtSentence(long, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toMatch(/\.\s*$/);
  });
});
