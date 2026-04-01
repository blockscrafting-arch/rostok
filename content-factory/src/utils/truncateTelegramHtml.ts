/**
 * Усечение HTML для Telegram (parse_mode HTML), лимит сообщения 4096 символов.
 * Не режет теги пополам и не оставляет незакрытых тегов / обрезанных &amp;… сущностей.
 */

export const TELEGRAM_MESSAGE_MAX_HTML = 4096;

const TAG_RE = /<(\/?)(b|i|code|pre)>|<a\s[^>]*>|<\/a>/g;

/**
 * Усечь HTML до maxChars; при необходимости закрыть незакрытые теги в конце.
 */
export function truncateTelegramHtml(
  html: string,
  maxChars: number = TELEGRAM_MESSAGE_MAX_HTML
): string {
  if (html.length <= maxChars) return html;

  for (let cut = maxChars; cut > 0; cut--) {
    let c = cut;
    while (c > 0) {
      const lastLt = html.lastIndexOf('<', c - 1);
      const lastGt = html.lastIndexOf('>', c - 1);
      if (lastLt > lastGt) {
        c = lastLt;
      } else {
        break;
      }
    }
    const prefix = trimIncompleteHtmlEntity(html.slice(0, c));
    const candidate = closeOpenTelegramTags(prefix);
    if (candidate.length <= maxChars) {
      return candidate;
    }
  }
  return '';
}

function trimIncompleteHtmlEntity(s: string): string {
  const lastAmp = s.lastIndexOf('&');
  if (lastAmp === -1) return s;
  const tail = s.slice(lastAmp);
  if (/^&(amp|lt|gt|quot);/.test(tail)) return s;
  return s.slice(0, lastAmp);
}

function closeOpenTelegramTags(html: string): string {
  const stack: string[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    const full = m[0];
    if (full.startsWith('<a')) {
      stack.push('a');
    } else if (full === '</a>') {
      if (stack.length && stack[stack.length - 1] === 'a') stack.pop();
    } else if (m[1] === '') {
      stack.push(m[2]);
    } else {
      const tag = m[2];
      if (stack.length && stack[stack.length - 1] === tag) stack.pop();
    }
  }
  if (stack.length === 0) return html;
  const closers: Record<string, string> = {
    b: '</b>',
    i: '</i>',
    code: '</code>',
    pre: '</pre>',
    a: '</a>',
  };
  let suffix = '';
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += closers[stack[i]];
  }
  return html + suffix;
}
