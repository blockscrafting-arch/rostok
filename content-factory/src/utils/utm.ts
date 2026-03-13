/**
 * Генерация UTM-ссылки: тема статьи → поиск в справочнике каталога → подстановка в шаблон.
 */
import { Settings } from '../types';

/**
 * Из темы/заголовка извлекаем ключевое слово для каталога (например «Розы»).
 * Ищем в catalogMap ключ (раздел каталога) и подставляем base URL + UTM.
 */
function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-яё0-9-]/gi, '');
}

/**
 * По заголовку/теме подбираем раздел каталога и собираем UTM-ссылку.
 * template пример: "https://site.ru/catalog/{topic}?utm_source=dzen&utm_medium=article&utm_campaign={campaign}&utm_content={keyword}"
 * catalogMap: { "Розы": "https://site.ru/catalog/roses", ... }
 * Плейсхолдеры: {topic}, {campaign} — slug заголовка; {keyword} — ключевое слово задачи (URL-кодируется).
 */
export function buildUtmUrl(
  headline: string,
  settings: Settings,
  keyword: string = ''
): string {
  const { catalogMap, utmTemplate } = settings;
  const topicSlug = slugifyTopic(headline);
  const keywordEncoded = encodeURIComponent(keyword.trim());

  // Ищем первый ключ, который входит в заголовок (без учёта регистра)
  const headlineLower = headline.toLowerCase();
  let baseUrl = '';
  for (const [section, url] of Object.entries(catalogMap)) {
    if (headlineLower.includes(section.toLowerCase())) {
      baseUrl = url;
      break;
    }
  }

  // Если не нашли — берём первый URL из справочника или только UTM-параметры
  if (!baseUrl && Object.keys(catalogMap).length > 0) {
    baseUrl = Object.values(catalogMap)[0];
  }

  // Декодируем шаблон: браузер/Дзен могли превратить { } в %7B %7D при копировании
  let decodedTemplate = utmTemplate;
  try {
    decodedTemplate = decodeURI(utmTemplate);
  } catch {
    // В случае кривого URL оставляем как есть
  }

  // Подставляем {topic}, {campaign} и {keyword} в шаблон
  let url = decodedTemplate
    .replace(/\{topic\}/gi, topicSlug)
    .replace(/\{campaign\}/gi, topicSlug)
    .replace(/\{keyword\}/gi, keywordEncoded);

  // Если в шаблоне нет полного URL, префиксируем baseUrl
  if (url.startsWith('?')) {
    url = (baseUrl || '').replace(/\?.*$/, '') + url;
  } else if (!url.startsWith('http') && baseUrl) {
    url = baseUrl.replace(/\?.*$/, '') + (url.startsWith('/') ? url : `?${url}`);
  }

  return url || decodedTemplate;
}
