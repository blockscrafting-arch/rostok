/**
 * Типы данных для задач в очередях BullMQ.
 * Контекст передаётся сериализуемо; aiClient создаётся в воркере из openrouterApiKey.
 */
import type { SheetTask, Settings } from '../types';

export interface QueueContextPayload {
  clientId: string;
  spreadsheetId: string;
  openrouterApiKey: string;
  telegramChannelId?: string;
}

export interface SemanticsJobPayload extends QueueContextPayload {
  task: SheetTask;
  settings: Settings;
}

export interface GenerationJobPayload extends QueueContextPayload {
  task: SheetTask;
  settings: Settings;
  options?: { isRevision?: boolean; editorComment?: string; keepImage?: boolean };
}

export interface ImageJobPayload extends QueueContextPayload {
  task: SheetTask;
  settings: Settings;
}

export interface PublishJobPayload extends QueueContextPayload {
  task: SheetTask;
}
