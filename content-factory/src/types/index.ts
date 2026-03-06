/**
 * Общие типы Контент-Завод: задачи, настройки, статья, стоимость.
 */

export type TaskStatus =
  | 'Новое'
  | 'На согласовании'
  | 'Согласовано'
  | 'Генерация'
  | 'Готово к проверке'
  | 'Одобрено'
  | 'Опубликовано'
  | 'Ошибка'
  | 'На доработку';

/** Строка листа «Задания» (индексы колонок для чтения/записи задаются в sheets/tasks и writer). */
export interface Task {
  rowIndex: number;
  platform: string;
  keyword: string;
  frequencyLimit: number;
  headline: string | null;
  keywords: string | null;
  status: TaskStatus;
  previewText: string | null;
  sources: string | null;
  imageUrl: string | null;
  utmUrl: string | null;
  postUrl: string | null;
  costText: string | null;
  costImage: string | null;
  costTotal: string | null;
  date: string | null;
  comment: string | null;
}

/** Настройки из листа «Настройки». */
export interface Settings {
  role: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  dnaBrandUrl: string;
  catalogDocUrl: string;
  dnaBrandText: string;
  catalogMap: Record<string, string>;
  utmTemplate: string;
  telegramChannelId: string;
  maxArticlesPerDay: number;
  moderationEnabled: boolean;
  pollInterval: number;
  dailySummaryTime: string;
}

/** Результат генерации одной статьи (для записи в таблицу). */
export interface ArticleResult {
  previewText: string;
  sources: string;
  imageUrl: string;
  utmUrl: string;
  costTextRub: number;
  costImageRub: number;
  costTotalRub: number;
}

/** Агрегированная стоимость по токенам (для калькулятора). */
export interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd?: number;
}

/** Использование токенов из ответа OpenRouter. */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  total_cost?: number;
}
