/**
 * Типы данных для задач в очередях BullMQ.
 * В payload передаём только идентификаторы; task и settings воркер поднимает по rowIndex/spreadsheetId/clientId.
 */
import type { SheetTask, Settings } from '../types';

export interface QueueContextPayload {
  clientId: string;
  spreadsheetId: string;
  openrouterApiKey: string;
  telegramChannelId?: string;
}

/** Базовый payload с номером строки листа «Задания». */
export interface BaseJobPayload extends QueueContextPayload {
  rowIndex: number;
}

export interface SemanticsJobPayload extends BaseJobPayload {}

export interface GenerationJobPayload extends BaseJobPayload {
  options?: { isRevision?: boolean; editorComment?: string; keepImage?: boolean };
}

export interface ImageJobPayload extends BaseJobPayload {}

export interface RegenerateImageJobPayload extends BaseJobPayload {}

export interface PublishJobPayload extends BaseJobPayload {}

/** Результат загрузки данных джоба (task + settings) в воркере. */
export interface LoadedJobData {
  task: SheetTask;
  settings: Settings;
}
