import { describe, it, expect } from 'vitest';
import { convertDriveUrlToDirectDownload } from './url';

describe('convertDriveUrlToDirectDownload', () => {
  it('конвертирует ссылку формата /file/d/ID', () => {
    const url = 'https://drive.google.com/file/d/1ABC123xyz_DEF456/view?usp=sharing';
    const expected = 'https://drive.google.com/uc?export=download&id=1ABC123xyz_DEF456';
    expect(convertDriveUrlToDirectDownload(url)).toBe(expected);
  });

  it('конвертирует ссылку формата /open?id=ID', () => {
    const url = 'https://drive.google.com/open?id=1ABC123xyz_DEF456';
    const expected = 'https://drive.google.com/uc?export=download&id=1ABC123xyz_DEF456';
    expect(convertDriveUrlToDirectDownload(url)).toBe(expected);
  });

  it('оставляет обычную ссылку без изменений', () => {
    const url = 'https://example.com/image.jpg';
    expect(convertDriveUrlToDirectDownload(url)).toBe(url);
  });

  it('оставляет пустую строку без изменений', () => {
    expect(convertDriveUrlToDirectDownload('')).toBe('');
  });

  it('оставляет уже прямую ссылку на drive без изменений', () => {
    const url = 'https://drive.google.com/uc?export=download&id=123';
    expect(convertDriveUrlToDirectDownload(url)).toBe(url);
  });
});
