/**
 * Типы для Яндекс Wordstat API (Директ).
 */
export interface WordstatKeywordItem {
  keyword: string;
  frequency: number;
}

export interface WordstatReportInfo {
  reportID: number;
  status: 'Done' | 'Pending' | 'Failed';
}
