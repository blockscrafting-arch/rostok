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
  /** Алиас из mergeSettings / листа (подстановка в {dna_brand}). */
  dnaBrandText?: string;
  cta: string;
  imageStyle: string;
  tonality: string;
  targetAudience: string;
  negativePrompt: string;
  headlineRules: string;
  keyword?: string;
  keywords?: string;
  count?: string | number;
  headline?: string;
  facts?: string;
  productDetails?: string;
  text?: string;
  [key: string]: string | string[] | number | undefined;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Плейсхолдеры клиента (подставляются в mergeSettings до запуска задачи). */
const STATIC_PLACEHOLDER_KEYS = new Set([
  'role',
  'niche',
  'content_types',
  'trusted_sites',
  'dna_brand',
  'cta',
  'image_style',
  'tonality',
  'target_audience',
  'negative_prompt',
  'headline_rules',
  'product_details',
]);

function replacementRows(ctx: PromptContext): Array<{ key: string; value: string }> {
  const dna = String(ctx.dnaBrand ?? ctx.dnaBrandText ?? '');
  return [
    ['role', ctx.role],
    ['niche', ctx.niche],
    ['content_types', Array.isArray(ctx.contentTypes) ? ctx.contentTypes.join(', ') : String(ctx.contentTypes ?? '')],
    ['trusted_sites', Array.isArray(ctx.trustedSites) ? ctx.trustedSites.join('\n') : String(ctx.trustedSites ?? '')],
    ['dna_brand', dna],
    ['cta', ctx.cta],
    ['image_style', ctx.imageStyle],
    ['tonality', ctx.tonality],
    ['target_audience', ctx.targetAudience],
    ['negative_prompt', ctx.negativePrompt],
    ['headline_rules', ctx.headlineRules],
    ['text', ctx.text ?? ''],
    ['keyword', ctx.keyword ?? ''],
    ['keywords', ctx.keywords ?? ''],
    ['count', ctx.count !== undefined ? String(ctx.count) : ''],
    ['headline', ctx.headline ?? ''],
    ['facts', ctx.facts ?? ''],
    ['product_details', ctx.productDetails ?? ''],
  ].map(([k, v]) => ({ key: k, value: String(v) }));
}

function applyReplacements(
  template: string,
  rows: Array<{ key: string; value: string }>,
  keyFilter: Set<string> | null
): string {
  let result = template;
  for (const { key, value } of rows) {
    if (keyFilter && !keyFilter.has(key)) continue;
    const re = new RegExp(escapeRe('{' + key + '}'), 'g');
    result = result.replace(re, value);
  }
  return result;
}

/**
 * Подставляет в шаблон значения из контекста (все известные плейсхолдеры).
 * Плейсхолдеры: {role}, {niche}, {content_types}, {trusted_sites}, {dna_brand}, {cta}, {image_style}, {tonality}, {target_audience}, {negative_prompt}, {headline_rules}, {keyword}, {keywords}, {count}, {headline}, {facts}, {product_details}, {text}.
 */
export function buildPrompt(template: string, ctx: PromptContext): string {
  if (!template || typeof template !== 'string') {
    return '';
  }
  return applyReplacements(template, replacementRows(ctx), null);
}

/** Только клиентский контекст: оставляет {keyword}, {headline}, {facts} и т.д. для второй фазы. */
export function buildPromptStatic(template: string, ctx: PromptContext): string {
  if (!template || typeof template !== 'string') {
    return '';
  }
  return applyReplacements(template, replacementRows(ctx), STATIC_PLACEHOLDER_KEYS);
}

/** Только поля задачи (черновик / опционально дозаполнение). */
export function buildPromptDynamic(template: string, ctx: Partial<PromptContext>): string {
  if (!template || typeof template !== 'string') {
    return '';
  }
  const rows = [
    ['text', ctx.text ?? ''],
    ['keyword', ctx.keyword ?? ''],
    ['keywords', ctx.keywords ?? ''],
    ['count', ctx.count !== undefined ? String(ctx.count) : ''],
    ['headline', ctx.headline ?? ''],
    ['facts', ctx.facts ?? ''],
  ].map(([k, v]) => ({ key: k, value: String(v) }));
  return applyReplacements(template, rows, null);
}
