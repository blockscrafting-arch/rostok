import { describe, it, expect } from 'vitest';
import { cleanArticleFirstLine, truncateAtSentence, insertCatalogLinks } from './text';

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

describe('insertCatalogLinks', () => {
  const url = 'https://site.ru/catalog?utm_source=dzen';

  it('заменяет маркер [ССЫЛКА НА КАТАЛОГ] на ссылку', () => {
    const text = 'Текст. Перейти: [ССЫЛКА НА КАТАЛОГ]';
    expect(insertCatalogLinks(text, url)).toBe(
      'Текст. Перейти: https://site.ru/catalog?utm_source=dzen'
    );
  });

  it('заменяет все вхождения маркера', () => {
    const text = 'Середина: [ССЫЛКА НА КАТАЛОГ]. Конец: [ССЫЛКА НА КАТАЛОГ]';
    const result = insertCatalogLinks(text, url);
    expect(result).not.toContain('[ССЫЛКА НА КАТАЛОГ]');
    expect(result).toBe(
      'Середина: https://site.ru/catalog?utm_source=dzen. Конец: https://site.ru/catalog?utm_source=dzen'
    );
  });

  it('если маркера нет — добавляет ссылку в конец', () => {
    const text = 'Статья без маркера.';
    expect(insertCatalogLinks(text, url)).toBe(
      'Статья без маркера.\n\nПерейти на сайт: https://site.ru/catalog?utm_source=dzen'
    );
  });

  it('при пустом utmUrl возвращает текст без изменений', () => {
    const text = 'Текст [ССЫЛКА НА КАТАЛОГ] конец';
    expect(insertCatalogLinks(text, '')).toBe(text);
    expect(insertCatalogLinks(text, '   ')).toBe(text);
  });

  it('при пустом тексте и отсутствии маркера не добавляет ссылку', () => {
    expect(insertCatalogLinks('', url)).toBe('');
  });

  it('при тексте из пробелов не добавляет ссылку', () => {
    expect(insertCatalogLinks('  \n  ', url)).toBe('  \n  ');
  });

  it('регистронезависимо находит маркер', () => {
    const text = 'Ссылка: [ссылка на каталог]';
    expect(insertCatalogLinks(text, url)).toBe(
      'Ссылка: https://site.ru/catalog?utm_source=dzen'
    );
  });
});
