import { apiErrorSchema, attachmentSchema } from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { Readable } from 'node:stream';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { canInline, contentDisposition } from '../attachments/http.js';
import {
  checkDeclaredType,
  normalizeMime,
  sanitizeFilename,
  sniffExecutable,
} from '../attachments/validate.js';
import { loadAttachmentAccess, loadTaskAccess, roleAtLeast } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import { attachments } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { StorageNotFoundError } from '../storage/storage.js';
import { getAttachment } from '../tasks/attachments.js';
import { mutateTasks } from '../tasks/mutation.js';

const err = apiErrorSchema;
const attachmentParams = z.object({ attachmentId: z.uuid() });

export const attachmentRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const maxBytes = app.config.MAX_UPLOAD_BYTES;
  const maxLabel = `${Math.floor(maxBytes / (1024 * 1024))} MB`;

  /** Best-effort blob cleanup; a leftover file is only wasted space. */
  const discard = (key: string) =>
    app.storage.delete(key).catch((error: unknown) => {
      app.log.error({ err: error, key }, 'Could not delete attachment file');
    });

  app.post(
    '/tasks/:taskId/attachments',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['Attachments'],
        summary: 'Upload an attachment',
        description: `\`multipart/form-data\` with one file part (field \`file\`). At most ${maxLabel} (413 \`FILE_TOO_LARGE\`). Executables are refused by extension, declared type or content (415 \`FILE_TYPE_BLOCKED\`). No file part: 400 \`FILE_REQUIRED\`. Logs \`attachment.added\`.`,
        consumes: ['multipart/form-data'],
        params: z.object({ taskId: z.uuid() }),
        response: { 201: attachmentSchema, 400: err, 401: err, 404: err, 413: err, 415: err },
      },
    },
    async (request, reply) => {
      const { task, project } = await loadTaskAccess(request, request.params.taskId);
      const { user } = requireAuth(request);
      if (!request.isMultipart()) {
        throw httpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the file as multipart/form-data');
      }
      const part = await request.file({ limits: { fileSize: maxBytes, files: 1 } });
      if (!part) throw httpError(400, 'FILE_REQUIRED', 'No file in the request');

      const filename = sanitizeFilename(part.filename);
      const mime = normalizeMime(part.mimetype);
      try {
        checkDeclaredType(filename, mime);
      } catch (error) {
        part.file.resume();
        throw error;
      }

      const id = uuidv7();
      const key = `${project.workspaceId}/${task.id}/${id}`;
      let size: number;
      try {
        ({ size } = await app.storage.put(key, Readable.from(sniffExecutable(part.file))));
      } catch (error) {
        part.file.resume();
        throw error;
      }
      if (part.file.truncated) {
        await discard(key);
        throw httpError(413, 'FILE_TOO_LARGE', `Files can be at most ${maxLabel}`);
      }

      try {
        await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
          await m.lockTask(task.id);
          await m.tx.insert(attachments).values({
            id,
            taskId: task.id,
            uploaderId: user.id,
            filename,
            mime,
            size,
            storageKey: key,
            createdAt: m.now,
          });
          m.log(task.id, 'attachment.added', { attachment: { id, filename } });
          await m.touch(task.id);
          m.emit('attachment.changed', task.id, { attachmentId: id });
        });
      } catch (error) {
        await discard(key);
        throw error;
      }
      const created = await getAttachment(app.db, id);
      if (!created) throw httpError(404, 'NOT_FOUND', 'Attachment not found');
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/attachments/:attachmentId/download',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Attachments'],
        summary: 'Download an attachment',
        description:
          'Streams the file with its stored type and a `Content-Disposition` carrying the original name (`filename*` for non-ASCII names). Always a download, except PNG/JPEG/GIF/WebP images with `inline=true`. 404 `FILE_MISSING` when the file itself is gone (seed data has no files).',
        params: attachmentParams,
        querystring: z.object({ inline: z.stringbool().default(false) }),
        // A stream: Fastify sends it as is, without serializing.
        response: { 200: z.unknown().describe('The file'), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { attachment } = await loadAttachmentAccess(request, request.params.attachmentId);
      let file: Awaited<ReturnType<typeof app.storage.open>>;
      try {
        file = await app.storage.open(attachment.storageKey);
      } catch (error) {
        if (error instanceof StorageNotFoundError) {
          throw httpError(404, 'FILE_MISSING', 'The file is no longer available');
        }
        throw error;
      }
      const inline = request.query.inline && canInline(attachment.mime);
      return reply
        .header('content-type', attachment.mime)
        .header('content-length', file.size)
        .header(
          'content-disposition',
          contentDisposition(attachment.filename, inline ? 'inline' : 'attachment'),
        )
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'private, no-cache')
        .send(file.body);
    },
  );

  app.delete(
    '/attachments/:attachmentId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Attachments'],
        summary: 'Delete an attachment',
        description:
          'The uploader or a workspace admin/owner (403 otherwise). Removes the record and the file. Logs `attachment.removed`.',
        params: attachmentParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const {
        attachment: found,
        project,
        role,
      } = await loadAttachmentAccess(request, request.params.attachmentId);
      const { user } = requireAuth(request);
      if (found.uploaderId !== user.id && !roleAtLeast(role, 'admin')) {
        throw httpError(403, 'FORBIDDEN', 'You can only delete your own attachments');
      }

      await mutateTasks(app, { projectId: project.id, actorId: user.id }, async (m) => {
        await m.lockTask(found.taskId);
        const [removed] = await m.tx
          .delete(attachments)
          .where(and(eq(attachments.id, found.id), eq(attachments.taskId, found.taskId)))
          .returning();
        if (!removed) throw httpError(404, 'NOT_FOUND', 'Attachment not found');
        m.log(removed.taskId, 'attachment.removed', {
          attachment: { id: removed.id, filename: removed.filename },
        });
        await m.touch(removed.taskId);
        m.emit('attachment.changed', removed.taskId, { attachmentId: removed.id });
      });
      await discard(found.storageKey);
      return reply.code(204).send(null);
    },
  );

  done();
};
