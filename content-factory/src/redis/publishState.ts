/**
 * Состояние лимита публикаций в Redis (персистентность при перезапуске).
 */
import { connection } from '../queue';

const KEY_PREFIX = 'cf:publish:';

export interface PublishState {
  publishedToday: number;
  lastPublishedAt: number;
  lastDateKey: string;
  lastPublishSkippedLogAt: number;
  lastPublishSkippedReason: string;
}

function stateKey(clientId: string): string {
  return `${KEY_PREFIX}${clientId || '_single_'}`;
}

export async function getPublishState(clientId: string): Promise<PublishState> {
  const key = stateKey(clientId);
  const raw = await connection.get(key);
  if (!raw) {
    return {
      publishedToday: 0,
      lastPublishedAt: 0,
      lastDateKey: '',
      lastPublishSkippedLogAt: 0,
      lastPublishSkippedReason: '',
    };
  }
  try {
    return JSON.parse(raw) as PublishState;
  } catch {
    return {
      publishedToday: 0,
      lastPublishedAt: 0,
      lastDateKey: '',
      lastPublishSkippedLogAt: 0,
      lastPublishSkippedReason: '',
    };
  }
}

export async function setPublishState(clientId: string, state: PublishState): Promise<void> {
  const key = stateKey(clientId);
  await connection.set(key, JSON.stringify(state));
}
