import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ApiErrorBody } from '@kite/shared';

const codeByStatus: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

export function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Makes every error response use the `{ error: { code, message } }` envelope. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((err, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send(errorBody('VALIDATION_ERROR', err.message));
    }
    const status = err.statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send(errorBody(codeByStatus[status] ?? 'BAD_REQUEST', err.message));
    }
    request.log.error(err);
    return reply.code(500).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url} not found`)),
  );
}
