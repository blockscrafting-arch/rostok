/**
 * Построение PipelineContext из данных задачи очереди (для воркеров).
 */
import { createOpenRouterClient } from '../ai/clientFactory';
import type { PipelineContext } from '../types';
import type { QueueContextPayload } from '../queue/types';

export function buildContextFromPayload(payload: QueueContextPayload): PipelineContext {
  return {
    aiClient: createOpenRouterClient(payload.openrouterApiKey),
    sheetContext: { spreadsheetId: payload.spreadsheetId },
    telegramChannelId: payload.telegramChannelId,
  };
}
