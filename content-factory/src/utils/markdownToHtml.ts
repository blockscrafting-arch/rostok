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
 * - Экранирует & < > " внутри текста.
 */
export function markdownToTelegramHtml(text: string): string {
  if (!text || !text.length) return '';

  let out = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    // [text](url)
    const linkMatch = text.slice(i).match(/^\[([^\]]*)\]\(([^)]+)\)/);
    if (linkMatch) {
      out += '<a href="' + escapeHtml(linkMatch[2].trim()) + '">' + escapeHtml(linkMatch[1]) + '</a>';
      i += linkMatch[0].length;
      continue;
    }

    // **bold**
    if (text.slice(i, i + 2) === '**') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        out += '<b>' + escapeHtml(text.slice(i + 2, end)) + '</b>';
        i = end + 2;
        continue;
      }
    }

    // *italic* (не **)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && text[end + 1] !== '*') {
        out += '<i>' + escapeHtml(text.slice(i + 1, end)) + '</i>';
        i = end + 1;
        continue;
      }
    }

    // `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        out += '<code>' + escapeHtml(text.slice(i + 1, end)) + '</code>';
        i = end + 1;
        continue;
      }
    }

    // Обычный символ
    const ch = text[i];
    if (ch === '&' || ch === '<' || ch === '>' || ch === '"') {
      out += escapeHtml(ch);
    } else {
      out += ch;
    }
    i += 1;
  }

  return out;
}
