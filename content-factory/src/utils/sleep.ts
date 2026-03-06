/**
 * Задержка с опциональным jitter (мс).
 */
export function sleep(ms: number, jitterMs = 0): Promise<void> {
  const delay = jitterMs > 0 ? ms + Math.random() * jitterMs : ms;
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
}
