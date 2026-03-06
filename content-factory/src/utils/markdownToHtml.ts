/**
 * Конвертация Markdown в HTML для Telegram (parse_mode: 'HTML').
 * Поддерживаются только теги: <b>, <i>, <a href="...">, <code>, <pre>.
 * Спецсимволы & < > " экранируются.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Преобразует Markdown-подобный текст в HTML для Telegram.
 * - **bold** → <b>bold</b>
 * - *italic* → <i>italic</i>
 * - [text](url) → <a href="url">text</a>
 * - `code` → <code>code</code>
 * - Заголовки (#, ##, ...) → <b>Заголовок</b>
 * - Экранирует & < > " внутри текста.
 */
export function markdownToTelegramHtml(text: string): string {
  if (!text || !text.length) return '';

  let out = '';
  let i = 0;
  
  // Предварительно уберем Markdown-заголовки
  let processed = text.replace(/^(#+)\s+(.+)$/gm, '<b>$2</b>');
  const len = processed.length;

  // Теги Telegram, которые мы сами вставляем — не экранировать (выводим как есть)
  const telegramTagRe = /^<\/?(b|i|code|pre)>/;

  while (i < len) {
    // [text](url)
    const linkMatch = processed.slice(i).match(/^\[([^\]]*)\]\(([^)]+)\)/);
    if (linkMatch) {
      out += '<a href="' + escapeHtml(linkMatch[2].trim()) + '">' + escapeHtml(linkMatch[1]) + '</a>';
      i += linkMatch[0].length;
      continue;
    }

    // Уже вставленные теги <b>, </b>, <i>, </i> и т.д. — не экранировать
    const tagMatch = processed.slice(i).match(telegramTagRe);
    if (tagMatch) {
      out += tagMatch[0];
      i += tagMatch[0].length;
      continue;
    }

    // **bold**
    if (processed.slice(i, i + 2) === '**') {
      const end = processed.indexOf('**', i + 2);
      if (end !== -1) {
        out += '<b>' + escapeHtml(processed.slice(i + 2, end)) + '</b>';
        i = end + 2;
        continue;
      }
    }

    // *italic* (не **)
    if (processed[i] === '*' && processed[i + 1] !== '*') {
      const end = processed.indexOf('*', i + 1);
      if (end !== -1 && processed[end + 1] !== '*') {
        out += '<i>' + escapeHtml(processed.slice(i + 1, end)) + '</i>';
        i = end + 1;
        continue;
      }
    }

    // `code`
    if (processed[i] === '`') {
      const end = processed.indexOf('`', i + 1);
      if (end !== -1) {
        out += '<code>' + escapeHtml(processed.slice(i + 1, end)) + '</code>';
        i = end + 1;
        continue;
      }
    }

    // Обычный символ (экранируем только то, что не является нашим тегом)
    const ch = processed[i];
    if (ch === '&' || ch === '<' || ch === '>' || ch === '"') {
      out += escapeHtml(ch);
    } else {
      out += ch;
    }
    i += 1;
  }

  return out;
}
