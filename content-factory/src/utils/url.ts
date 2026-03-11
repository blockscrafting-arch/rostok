/**
 * Утилиты для работы с URL.
 */

/**
 * Конвертирует ссылки просмотра Google Drive в прямые ссылки на скачивание.
 * Поддерживает форматы:
 * - https://drive.google.com/file/d/ID/view?usp=sharing
 * - https://drive.google.com/open?id=ID
 * 
 * Если URL не относится к Google Drive, возвращает его без изменений.
 */
export function convertDriveUrlToDirectDownload(url: string): string {
  if (!url) return url;

  // Ищем формат /file/d/ID
  const fileIdMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }

  // Ищем формат /open?id=ID
  const openIdMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch && openIdMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${openIdMatch[1]}`;
  }

  return url;
}
