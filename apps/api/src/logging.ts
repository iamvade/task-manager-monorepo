import { createRequire } from 'node:module';
import type { FastifyRequest, FastifyServerOptions } from 'fastify';
import { stdSerializers, type LoggerOptions } from 'pino';
import type { Config } from './config.js';

/** Invite tokens travel in the URL path; anyone reading logs could otherwise accept them. */
const SECRET_PATH = /(\/invites\/)[^/?#]+/g;

export const redactUrl = (url: string): string => url.replace(SECRET_PATH, '$1[redacted]');

/**
 * Values bound to a failed query: drizzle appends them to the message (`\nparams: ...`, possibly
 * multi-line), which the stack repeats before its first frame.
 */
const QUERY_PARAMS = /\nparams: [\s\S]*?(?=\n\s+at |$)/;
const scrub = (value: unknown) =>
  typeof value === 'string' ? value.replace(QUERY_PARAMS, '\nparams: [redacted]') : value;

/** Logged errors without bound query parameters (password hashes, emails, names...). */
function serializeError(err: Error): Record<string, unknown> {
  const serialized: Record<string, unknown> = { ...stdSerializers.err(err) };
  delete serialized.params;
  delete serialized.query;
  serialized.message = scrub(serialized.message);
  serialized.stack = scrub(serialized.stack);
  const cause: unknown = err.cause;
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    // Postgres errors: keep what identifies the failure, not the row (`detail` echoes values).
    serialized.cause = {
      type: cause.constructor.name,
      message: c.message,
      code: c.code,
      constraint: c.constraint,
      table: c.table,
      column: c.column,
    };
  }
  return serialized;
}

export const logSerializers = {
  req: (request: FastifyRequest) => ({
    method: request.method,
    url: redactUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort,
  }),
  err: serializeError,
};

/** Belt and braces: whatever ends up logged, these never print. */
export const LOG_REDACT = {
  paths: [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
    'headers.cookie',
    'headers.authorization',
    'password',
    'passwordHash',
    'token',
    '*.password',
    '*.passwordHash',
    '*.token',
    '*.tokenHash',
    'err.params',
  ],
  censor: '[redacted]',
};

const hasPrettyTransport = () => {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
};

export function loggerOptions(
  config: Config,
  stream?: NodeJS.WritableStream,
): FastifyServerOptions['logger'] {
  const base: LoggerOptions = {
    level: config.LOG_LEVEL,
    serializers: logSerializers,
    redact: LOG_REDACT,
  };
  if (stream) return { ...base, stream };
  if (config.NODE_ENV === 'test') return false;
  if (config.NODE_ENV === 'development' && hasPrettyTransport()) {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    };
  }
  return base;
}
