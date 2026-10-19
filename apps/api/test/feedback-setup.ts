import {
  feedbackDetailSchema,
  publicFeedbackUploadSchema,
  type PublicFeedbackSubmit,
} from '@kite/shared';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { ORIGIN, randomIp } from './fixtures.js';

/** The 8-byte PNG signature plus a little: enough for the content check. */
export const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3,
]);
export const PDF = new TextEncoder().encode('%PDF-1.7\n% feedback attachment\n');

export const fileForm = (name: string, bytes: Uint8Array | string, type: string) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  return form;
};

export const validFeedback = (
  overrides: Partial<PublicFeedbackSubmit> = {},
): PublicFeedbackSubmit => ({
  type: 'bug',
  title: 'App freezes on the payment step',
  body: 'When I tap Pay the app freezes and I have to restart it.',
  name: 'Enkhjin D.',
  email: 'enkhjin@example.com',
  phone: '+976 9911 2233',
  ...overrides,
});

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

/** Anonymous calls to the public form, each from its own IP unless `ip` is given. */
export function publicForm(app: FastifyInstance, slug: string) {
  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload?: unknown,
    { ip = randomIp(), headers = {} }: { ip?: string; headers?: Record<string, string> } = {},
  ) =>
    app.inject({
      method,
      url: `/api/v1/public/feedback${path}`,
      headers: {
        'user-agent': IPHONE,
        ...(method === 'GET' ? {} : { origin: ORIGIN }),
        ...headers,
      },
      remoteAddress: ip,
      ...(payload === undefined ? {} : { payload: payload as never }),
    });
  const submit = (body: PublicFeedbackSubmit = validFeedback(), opts?: { ip?: string }) =>
    call('POST', `/${slug}`, body, opts);
  const upload = async (
    name = 'shot.png',
    bytes: Uint8Array | string = PNG,
    type = 'image/png',
  ) => {
    const res = await call('POST', `/${slug}/uploads`, fileForm(name, bytes, type));
    expect(res.statusCode, res.body).toBe(201);
    return publicFeedbackUploadSchema.parse(res.json());
  };
  return { call, submit, upload };
}

export const detailOf = (res: { statusCode: number; body: string; json: () => unknown }) => {
  expect(res.statusCode, res.body).toBeLessThan(300);
  return feedbackDetailSchema.parse(res.json());
};
