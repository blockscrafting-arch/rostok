/**
 * Кэш с TTL и coalescing: один и тот же in-flight Promise возвращается всем одновременным вызывающим.
 * При ошибке запись удаляется, чтобы следующий вызов повторил запрос.
 */
export class PromiseCache<T> {
  private cache = new Map<string, { promise: Promise<T>; expiresAt: number }>();

  constructor(private ttlMs: number) {}

  getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > now) return entry.promise;

    const promise = fetcher();
    this.cache.set(key, { promise, expiresAt: now + this.ttlMs });

    promise.catch(() => {
      if (this.cache.get(key)?.promise === promise) this.cache.delete(key);
    });
    return promise;
  }
}
