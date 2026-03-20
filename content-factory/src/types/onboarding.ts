/**
 * Настройки клиента для записи в БД при веб-онбординге (после извлечения LLM или маппинга формы).
 */
export interface OnboardingSettingsForDb {
  role: string;
  contentTypes: string[];
  trustedSites: string[];
  productDetails: string;
  dnaBrand: string;
  cta: string;
  imageStyle: string;
  tonality: string;
  targetAudience: string;
  negativePrompt: string;
  operationMode: string;
  maxArticlesPerDay: number;
  publishIntervalMin: number;
  generationTime: string;
  imageGenMode: string;
  moderationEnabled: boolean;
  logoUrl?: string | null;
}
