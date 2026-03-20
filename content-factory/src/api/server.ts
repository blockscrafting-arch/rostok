/**
 * HTTP API сервер (Fastify): POST /api/onboarding.
 * Запускается только при заданных API_PORT и ONBOARDING_API_SECRET.
 */
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import bearerAuth from '@fastify/bearer-auth';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config';
import { formatIsoLikeMsk } from '../utils/dateMsk';
import { onboardingRoute } from './routes/onboarding';

const REQUEST_TIMEOUT_MS = 180_000; // 3 мин (аудио + LLM + Sheets)
const BODY_LIMIT = 512 * 1024; // 512 KB

/** Экземпляр сервера для graceful shutdown. */
let apiServer: FastifyInstance | null = null;

export function getApiServer(): FastifyInstance | null {
  return apiServer;
}

export async function startApiServer(): Promise<void> {
  const port = config.api.port;
  const secret = config.api.secret?.trim();

  if (!port || !secret) {
    return;
  }

  const app = Fastify({
    trustProxy: config.api.trustProxy,
    logger: {
      level: 'info',
      timestamp: () => `,"time":"${formatIsoLikeMsk()}"`,
    },
    bodyLimit: BODY_LIMIT,
    requestTimeout: REQUEST_TIMEOUT_MS,
    ajv: {
      plugins: [require('ajv-formats')],
    },
  });
  apiServer = app;

  await app.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
  });

  await app.register(bearerAuth, {
    keys: new Set([secret]),
    errorResponse: () => ({
      ok: false,
      error: 'Invalid API secret',
    }),
  });

  app.setErrorHandler((err, request, reply) => {
    const fastifyErr = err as { validation?: unknown; message?: string };
    if (fastifyErr.validation) {
      return reply.status(400).send({
        ok: false,
        error: fastifyErr.message || 'Ошибка валидации',
      });
    }
    request.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({
      ok: false,
      error: 'Внутренняя ошибка сервера',
    });
  });

  await app.register(onboardingRoute);

  await app.listen({ port, host: '0.0.0.0' });
}
