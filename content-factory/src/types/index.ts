/**
 * Общие типы Контент-Завод: задачи, настройки, статья, стоимость.
 */

export type TaskStatus =
  | 'Новое'
  | 'На согласовании'
  | 'Согласован заголовок'
  | 'Генерация'
  | 'Текст готов, ждём картинку'
  | 'Готово к проверке'
  | 'Одобрено на публикацию'
  | 'Опубликовано'
  | 'Ошибка'
  | 'На доработку'
  | 'Перегенерировать картинку';

/** Лимит частотности: одно число (минимум) или диапазон "min-max". */
export type FrequencyLimit = number | { min: number; max: number };

/** Строка листа «Задания» (индексы колонок для чтения/записи задаются в sheets/tasks и writer). Колонка «Площадка» удалена. */
export interface Task {
  rowIndex: number;
  keyword: string;
  /** Минимум частотности или { min, max }. Из ячейки парсится "300-500" → { min: 300, max: 500 }, "300" → 300. */
  frequencyLimit: FrequencyLimit;
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
  /** Запланированная дата/время публикации: ДД.ММ.ГГГГ ЧЧ:ММ или ЧЧ:ММ. Пусто — без ограничения по времени строки. */
  scheduledAt: string | null;
}

/** Настройки из листа «Настройки». */
export interface Settings {
  role: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  /** Промпт для генерации картинки без референса. Плейсхолдер: {headline}. */
  promptImage?: string;
  /** Промпт для генерации картинки с референсным фото. Плейсхолдер: {headline}. */
  promptImageWithReference?: string;
  dnaBrandUrl: string;
  catalogDocUrl: string;
  dnaBrandText: string;
  catalogMap: Record<string, string>;
  /** Справочник фото сортов: «Название сорта/раздела» → URL картинки (для референса при генерации). */
  referencePhotoMap: Record<string, string>;
  utmTemplate: string;
  telegramChannelId: string;
  maxArticlesPerDay: number;
  moderationEnabled: boolean;
  pollInterval: number;
  dailySummaryTime: string;
  /** Время суток, после которого запускать генерацию картинки для статуса «Текст готов, ждём картинку». Используется только при imageGenerationMode === 'scheduled'. */
  generationTime: string;
  /** Режим генерации картинки: сразу после текста или по времени (generationTime). */
  imageGenerationMode: 'immediate' | 'scheduled';
  /** URL логотипа для наложения на картинку (опционально). */
  logoUrl?: string;
  /** Интервал между публикациями одобренных статей, минуты. */
  publishIntervalMin: number;
  /** Время начала окна публикации (ЧЧ:ММ). Пусто — без ограничения. */
  publishWindowStart: string;
  /** Время окончания окна публикации (ЧЧ:ММ). Пусто — без ограничения. */
  publishWindowEnd: string;
  /** Модель для граундинга (поиск фактов). Пусто — из env. */
  groundingModel?: string;
  /** Модель для текста (черновик и очеловечивание). Пусто — из env. */
  textModel?: string;
  /** Модель для генерации картинки. Пусто — из env. */
  imageModel?: string;
  /** Кол-во заголовков на одно ключевое слово. По умолчанию 30. */
  headlinesCount?: number;
}

/** Результат генерации одной статьи (для записи в таблицу). */
export interface ArticleResult {
  previewText: string;
  sources: string;
  imageUrl: string;
  utmUrl: string;
  costTextUsd: number;
  costImageUsd: number;
  costTotalUsd: number;
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
  /** Стоимость в USD (OpenRouter отдаёт в usage.cost). */
  total_cost?: number;
  /** Идентификатор модели (для fallback-расчёта стоимости по токенам). */
  model?: string;
}
