import {
  FEEDBACK_MAX_FILE_BYTES,
  FEEDBACK_UPLOAD_TOKEN_HEADER,
  PUBLIC_FEEDBACK_FORM_LIMITS,
  apiErrorSchema,
  formatFeedbackRef,
  publicFeedbackFormSchema,
  publicFeedbackResultSchema,
  publicFeedbackSubmitSchema,
  publicFeedbackUploadSchema,
  validateFeedbackForm,
} from '@kite/shared';
import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { randomInt } from 'node:crypto';
import { Readable } from 'node:stream';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { quotaFull, storedBytes } from '../attachments/quota.js';
import { normalizeMime, sanitizeFilename } from '../attachments/validate.js';
import { hashToken, newToken } from '../auth/tokens.js';
import { one } from '../db/rows.js';
import { feedback, feedbackActivity, feedbackAttachments, workspaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { parseDevice } from '../feedback/device.js';
import { broadcastFeedbackChanged } from '../feedback/link.js';
import { IpWindowThrottle } from '../feedback/throttle.js';
import { checkFeedbackFile, sniffDeclared } from '../feedback/validate.js';

const err = apiErrorSchema;
const slugParams = z.object({ slug: z.string().min(1).max(100) });
const WINDOW_MS = 10 * 60_000;
/** Reports at least this similar (pg_trgm, 0–1) by title count as "similar reports". */
const SIMILAR_THRESHOLD = 0.45;
const SIMILAR_DAYS = 90;

const tooMany = (wait: number) =>
  httpError(429, 'RATE_LIMITED', `Too many requests; try again in ${wait} seconds`);

/**
 * The public feedback form (`/feedback/:slug` on the web): no account, so every route is public
 * (`security: []`), limited per IP, and only ever reveals the workspace's name.
 */
export const publicFeedbackRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const submits = new IpWindowThrottle({ max: 5, windowMs: WINDOW_MS }, () =>
    app.clock().getTime(),
  );
  const uploads = new IpWindowThrottle({ max: 30, windowMs: WINDOW_MS }, () =>
    app.clock().getTime(),
  );
  // The server-wide upload cap applies too (tests lower it).
  const maxBytes = Math.min(FEEDBACK_MAX_FILE_BYTES, app.config.MAX_UPLOAD_BYTES);
  const maxLabel = `${Math.floor(maxBytes / (1024 * 1024))} MB`;
  const quota = app.config.MAX_WORKSPACE_STORAGE_BYTES;

  const throttle = (
    limiter: IpWindowThrottle,
    request: FastifyRequest,
    reply: { header: (k: string, v: number) => unknown },
  ) => {
    const wait = limiter.hit(request.ip);
    if (wait > 0) {
      reply.header('retry-after', wait);
      throw tooMany(wait);
    }
  };

  const workspaceBySlug = async (slug: string) => {
    const [ws] = await app.db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    if (!ws) throw httpError(404, 'NOT_FOUND', 'Feedback form not found');
    return ws;
  };

  const discard = (key: string) =>
    app.storage.delete(key).catch((error: unknown) => {
      app.log.error({ err: error, key }, 'Could not delete feedback upload');
    });

  app.get(
    '/public/feedback/:slug',
    {
      schema: {
        tags: ['Feedback'],
        summary: 'Public feedback form',
        description:
          'What the public form needs: the workspace name and the attachment limits. No sign-in. 404 when no workspace has this slug.',
        security: [],
        params: slugParams,
        response: { 200: publicFeedbackFormSchema, 404: err },
      },
    },
    async (request) => {
      const ws = await workspaceBySlug(request.params.slug);
      return { workspaceName: ws.name, ...PUBLIC_FEEDBACK_FORM_LIMITS, maxFileBytes: maxBytes };
    },
  );

  app.post(
    '/public/feedback/:slug/uploads',
    {
      schema: {
        tags: ['Feedback'],
        summary: 'Upload a file for the public form',
        description: `\`multipart/form-data\` with one file part, sent as soon as it's picked (per-file progress). Images (PNG, JPEG, GIF, WebP, HEIC), video (MP4, MOV, WebM) or PDF, checked by name, declared type and content (415 \`FILE_TYPE_NOT_ALLOWED\`); at most ${maxLabel} (413 \`FILE_TOO_LARGE\`); 413 \`STORAGE_QUOTA_EXCEEDED\`. Returns a \`token\` to send with the form (or to remove the file). Files never sent are removed after a day. At most 30 uploads per 10 minutes per IP (429 \`RATE_LIMITED\` with \`Retry-After\`).`,
        security: [],
        consumes: ['multipart/form-data'],
        params: slugParams,
        response: {
          201: publicFeedbackUploadSchema,
          400: err,
          404: err,
          413: err,
          415: err,
          429: err,
        },
      },
    },
    async (request, reply) => {
      throttle(uploads, request, reply);
      const ws = await workspaceBySlug(request.params.slug);
      if (!request.isMultipart()) {
        throw httpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the file as multipart/form-data');
      }
      const used = await storedBytes(app.db, ws.id);
      if (used >= quota) throw quotaFull();
      const part = await request.file({ limits: { fileSize: maxBytes, files: 1 } });
      if (!part) throw httpError(400, 'FILE_REQUIRED', 'No file in the request');

      const filename = sanitizeFilename(part.filename);
      let mime: ReturnType<typeof checkFeedbackFile>;
      try {
        mime = checkFeedbackFile(filename, normalizeMime(part.mimetype));
      } catch (error) {
        part.file.resume();
        throw error;
      }

      const id = uuidv7();
      const key = `${ws.id}/feedback/${id}`;
      let size: number;
      try {
        ({ size } = await app.storage.put(key, Readable.from(sniffDeclared(part.file, mime))));
      } catch (error) {
        part.file.resume();
        await discard(key);
        throw error;
      }
      if (part.file.truncated) {
        await discard(key);
        throw httpError(413, 'FILE_TOO_LARGE', `Files can be at most ${maxLabel}`);
      }
      if (used + size > quota) {
        await discard(key);
        throw quotaFull();
      }
      const token = newToken();
      try {
        await app.db.insert(feedbackAttachments).values({
          id,
          workspaceId: ws.id,
          uploadTokenHash: hashToken(token),
          filename,
          mime,
          size,
          storageKey: key,
          createdAt: app.clock(),
        });
      } catch (error) {
        await discard(key);
        throw error;
      }
      return reply.code(201).send({ id, token, filename, mime, size });
    },
  );

  app.delete(
    '/public/feedback/uploads/:uploadId',
    {
      schema: {
        tags: ['Feedback'],
        summary: 'Remove a file from the public form',
        description: `Before the form is sent ("Remove", "Cancel upload"). The upload's token goes in the \`${FEEDBACK_UPLOAD_TOKEN_HEADER}\` header; 404 when it doesn't match or the form was already sent.`,
        security: [],
        params: z.object({ uploadId: z.uuid() }),
        response: { 204: z.null(), 404: err, 429: err },
      },
    },
    async (request, reply) => {
      throttle(uploads, request, reply);
      const token = request.headers[FEEDBACK_UPLOAD_TOKEN_HEADER];
      if (typeof token !== 'string' || token === '') {
        throw httpError(404, 'NOT_FOUND', 'Upload not found');
      }
      const [removed] = await app.db
        .delete(feedbackAttachments)
        .where(
          and(
            eq(feedbackAttachments.id, request.params.uploadId),
            eq(feedbackAttachments.uploadTokenHash, hashToken(token)),
            isNull(feedbackAttachments.feedbackId),
          ),
        )
        .returning({ key: feedbackAttachments.storageKey });
      if (!removed) throw httpError(404, 'NOT_FOUND', 'Upload not found');
      await discard(removed.key);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/public/feedback/:slug',
    {
      schema: {
        tags: ['Feedback'],
        summary: 'Send feedback',
        description:
          "The public form. Fields are checked like the form does: 400 `VALIDATION_ERROR` with `error.fields` (`type`, `title`, `body`, `email`, `phone`, `name` → an error code such as `bodyTooShort`). `uploads` are files uploaded first, with their tokens (400 `INVALID_UPLOAD` when one isn't waiting for this form). The device is read from the request's `User-Agent`. Reports with a similar title from the last 90 days are noted in the item's log. At most 5 per 10 minutes per IP (429 `RATE_LIMITED` with `Retry-After`).",
        security: [],
        params: slugParams,
        body: publicFeedbackSubmitSchema,
        response: { 201: publicFeedbackResultSchema, 400: err, 404: err, 429: err },
      },
    },
    async (request, reply) => {
      throttle(submits, request, reply);
      const ws = await workspaceBySlug(request.params.slug);
      const body = request.body;
      const errors = validateFeedbackForm(body);
      if (Object.keys(errors).length > 0) {
        throw httpError(400, 'VALIDATION_ERROR', 'Some fields need fixing', errors);
      }
      const type = body.type;
      if (!type) throw httpError(400, 'VALIDATION_ERROR', 'Some fields need fixing');
      const now = app.clock();
      const title = body.title.trim();
      const email = body.email.trim();

      // A bot filled in the hidden field: answer like a success, keep nothing.
      if (body.website?.trim()) {
        request.log.info('Feedback honeypot triggered');
        return reply.code(201).send({
          ref: formatFeedbackRef(1000 + randomInt(1, 9000)),
          type,
          title,
          attachmentCount: 0,
          email,
          createdAt: now.toISOString(),
        });
      }

      const created = await app.db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ seq: workspaces.feedbackSeq })
          .from(workspaces)
          .where(eq(workspaces.id, ws.id))
          .for('no key update');
        if (!locked) throw httpError(404, 'NOT_FOUND', 'Feedback form not found');
        const number = locked.seq + 1;
        await tx.update(workspaces).set({ feedbackSeq: number }).where(eq(workspaces.id, ws.id));

        const similar = await tx
          .select({ id: feedback.id, number: feedback.number })
          .from(feedback)
          .where(
            and(
              eq(feedback.workspaceId, ws.id),
              ne(feedback.status, 'closed'),
              gte(feedback.createdAt, new Date(now.getTime() - SIMILAR_DAYS * 86_400_000)),
              sql`${feedback.title} % ${title}`,
              sql`similarity(${feedback.title}, ${title}) >= ${SIMILAR_THRESHOLD}`,
            ),
          )
          .orderBy(desc(sql`similarity(${feedback.title}, ${title})`))
          .limit(5);

        const userAgent = (request.headers['user-agent'] ?? '').slice(0, 1000);
        const row = one(
          await tx
            .insert(feedback)
            .values({
              workspaceId: ws.id,
              number,
              type,
              title,
              body: body.body.trim(),
              submitterName: body.name.trim() || null,
              email,
              phone: body.phone.trim() || null,
              userAgent,
              device: parseDevice(userAgent, body.client),
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
          'feedback',
        );

        let attachmentCount = 0;
        if (body.uploads.length > 0) {
          const ids = body.uploads.map((u) => u.id);
          const waiting = await tx
            .select({ id: feedbackAttachments.id, hash: feedbackAttachments.uploadTokenHash })
            .from(feedbackAttachments)
            .where(
              and(
                inArray(feedbackAttachments.id, ids),
                eq(feedbackAttachments.workspaceId, ws.id),
                isNull(feedbackAttachments.feedbackId),
              ),
            )
            .for('update');
          const valid = body.uploads.every((u) =>
            waiting.some((w) => w.id === u.id && w.hash === hashToken(u.token)),
          );
          if (!valid || new Set(ids).size !== ids.length) {
            throw httpError(
              400,
              'INVALID_UPLOAD',
              'An attached file is no longer available; add it again',
            );
          }
          await tx
            .update(feedbackAttachments)
            .set({ feedbackId: row.id })
            .where(inArray(feedbackAttachments.id, ids));
          attachmentCount = ids.length;
        }

        await tx.insert(feedbackActivity).values({
          feedbackId: row.id,
          actorId: null,
          kind: 'created',
          createdAt: now,
        });
        if (similar.length > 0) {
          await tx.insert(feedbackActivity).values({
            feedbackId: row.id,
            actorId: null,
            kind: 'similar_found',
            data: { similar: similar.map((s) => ({ id: s.id, ref: formatFeedbackRef(s.number) })) },
            // Just after `created`, so the log reads in order.
            createdAt: new Date(now.getTime() + 1),
          });
        }
        return { row, attachmentCount };
      });

      broadcastFeedbackChanged(app, { workspaceId: ws.id, actorId: null });
      return reply.code(201).send({
        ref: formatFeedbackRef(created.row.number),
        type: created.row.type,
        title: created.row.title,
        attachmentCount: created.attachmentCount,
        email: created.row.email,
        createdAt: created.row.createdAt.toISOString(),
      });
    },
  );

  done();
};
