/**
 * Интеграционные тесты POST /api/onboarding: schema validation, bearer auth.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import bearerAuth from '@fastify/bearer-auth';
import rateLimit from '@fastify/rate-limit';
import { onboardingRoute } from './onboarding';

vi.mock('../../services/onboardingService', () => ({
  processWebOnboarding: vi.fn().mockResolvedValue({
    clientId: 'client-123',
    spreadsheetId: 'sheet-123',
    spreadsheetUrl: 'https://docs.google.com/...',
  }),
}));

const SECRET = 'test-secret-123';

async function buildApp() {
  const app = Fastify({
    logger: false,
    ajv: {
      plugins: [require('ajv-formats')],
    },
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(bearerAuth, {
    keys: new Set([SECRET]),
    errorResponse: () => ({ ok: false, error: 'Invalid API secret' }),
  });
  await app.register(onboardingRoute);
  return app;
}

describe('POST /api/onboarding integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 без Authorization', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      payload: { user: { name: 'Test', email: 'a@b.com' }, answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }] },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Invalid');
  });

  it('401 при неверном Bearer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { user: { name: 'Test', email: 'a@b.com' }, answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('400 при невалидном email (schema)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: {
        user: { name: 'Test', email: 'not-an-email' },
        answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok === false || body.message || body.error).toBeTruthy();
  });

  it('400 при отсутствии user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: { answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 при step вне диапазона 1-30', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: {
        user: { name: 'Test', email: 'a@b.com' },
        answers: [{ step: 99, question: 'Q', answer: 'A', audio: null }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('201 при валидном запросе', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: {
        user: { name: 'Test', email: 'valid@example.com' },
        answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.clientId).toBe('client-123');
    expect(body.spreadsheetUrl).toContain('docs.google.com');
  });
});
