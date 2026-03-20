/**
 * POST /api/onboarding — веб-онбординг клиентов.
 */
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { processWebOnboarding } from '../../services/onboardingService';
import { isOnboardingValidationError } from '../errors';

const bodySchema = {
  type: 'object',
  required: ['user', 'answers'],
  properties: {
    user: {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 255 },
        email: { type: 'string', minLength: 5, maxLength: 255, format: 'email' },
      },
      additionalProperties: false,
    },
    answers: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        required: ['step', 'question'],
        properties: {
          step: { type: 'integer', minimum: 1, maximum: 30 },
          question: { type: 'string', maxLength: 500 },
          answer: { type: ['string', 'null'], maxLength: 5000 },
          audio: { type: ['string', 'null'], maxLength: 2048 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export async function onboardingRoute(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.post<{
    Body: {
      user: { name: string; email: string };
      answers: Array<{
        step: number;
        question: string;
        answer: string | null;
        audio: string | null;
      }>;
    };
  }>(
    '/api/onboarding',
    {
      schema: {
        body: bodySchema,
        response: {
          201: {
            type: 'object',
            properties: {
              ok: { type: 'boolean', const: true },
              clientId: { type: 'string' },
              spreadsheetUrl: { type: ['string', 'null'] },
              spreadsheetId: { type: ['string', 'null'] },
            },
            required: ['ok', 'clientId'],
          },
          400: {
            type: 'object',
            properties: {
              ok: { type: 'boolean', const: false },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await processWebOnboarding(request.body);
        return reply.status(201).send({
          ok: true,
          clientId: result.clientId,
          spreadsheetUrl: result.spreadsheetUrl,
          spreadsheetId: result.spreadsheetId,
        });
      } catch (e) {
        const err = e as Error;
        if (isOnboardingValidationError(err)) {
          return reply.status(400).send({ ok: false, error: err.message });
        }
        const msg = err.message ?? '';
        const allowedPrefixes = [
          'Недопустимый URL',
          'Нет ни одного ответа',
          'Forbidden URL hostname',
          'File too large',
          'File size exceeded',
        ];
        if (allowedPrefixes.some((p) => msg.startsWith(p))) {
          return reply.status(400).send({ ok: false, error: msg });
        }
        request.log.error({ err }, 'Onboarding API server error');
        return reply.status(500).send({
          ok: false,
          error: 'Внутренняя ошибка сервера',
        });
      }
    }
  );
}
