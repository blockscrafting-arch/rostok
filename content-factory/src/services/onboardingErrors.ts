/**
 * Ошибки валидации веб-онбординга (доменный слой, без привязки к HTTP).
 */
export class OnboardingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingValidationError';
    Object.setPrototypeOf(this, OnboardingValidationError.prototype);
  }
}

/** Проверка после instanceof (разные контексты бандла / Vitest). */
export function isOnboardingValidationError(e: unknown): e is OnboardingValidationError {
  return (
    e instanceof OnboardingValidationError ||
    (e instanceof Error && e.name === 'OnboardingValidationError')
  );
}
