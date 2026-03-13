/**
 * Сборка рабочего промпта из мастер-шаблона (admin_settings) и данных клиента (client_settings).
 * Конфиденциальные мастер-промпты никогда не отдаются клиенту — только результат подстановки.
 */

export interface PromptContext {
  role: string;
  niche: string;
  contentTypes: string[];
  trustedSites: string[];
  dnaBrand: string;
  cta: string;
  imageStyle: string;
  headlineRules: string;
  keyword?: string;
  keywords?: string;
  count?: string | number;
  headline?: string;
  facts?: string;
  productDetails?: string;
  [key: string]: string | string[] | number | undefined;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Подставляет в шаблон значения из контекста.
 * Плейсхолдеры: {role}, {niche}, {content_types}, {trusted_sites}, {dna_brand}, {cta}, {image_style}, {headline_rules}, {keyword}, {keywords}, {count}, {headline}, {facts}, {product_details}.
 */
export function buildPrompt(template: string, ctx: PromptContext): string {
  if (!template || typeof template !== 'string') {
    return '';
  }

  let result = template;

  const replacements: Array<{ key: string; value: string }> = [
    ['role', ctx.role],
    ['niche', ctx.niche],
    ['content_types', Array.isArray(ctx.contentTypes) ? ctx.contentTypes.join(', ') : String(ctx.contentTypes ?? '')],
    ['trusted_sites', Array.isArray(ctx.trustedSites) ? ctx.trustedSites.join('\n') : String(ctx.trustedSites ?? '')],
    ['dna_brand', ctx.dnaBrand],
    ['cta', ctx.cta],
    ['image_style', ctx.imageStyle],
    ['headline_rules', ctx.headlineRules],
    ['keyword', ctx.keyword ?? ''],
    ['keywords', ctx.keywords ?? ''],
    ['count', ctx.count !== undefined ? String(ctx.count) : ''],
    ['headline', ctx.headline ?? ''],
    ['facts', ctx.facts ?? ''],
    ['product_details', ctx.productDetails ?? ''],
  ].map(([k, v]) => ({ key: k, value: String(v) }));

  for (const { key, value } of replacements) {
    const re = new RegExp(escapeRe('{' + key + '}'), 'g');
    result = result.replace(re, value);
  }

  return result;
}
