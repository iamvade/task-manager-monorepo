import { activityPayloadSchemas } from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { feedback } from '../db/schema/index.js';
import type { DomainEvent } from '../events/bus.js';
import { broadcastFeedbackChanged } from './link.js';

/** True when the event moved the task into a done status. */
export function completedBy(event: DomainEvent): boolean {
  return event.activities.some((a) => {
    if (a.type !== 'status.changed') return false;
    const payload = activityPayloadSchemas['status.changed'].safeParse(a.payload);
    return payload.success && payload.data.to.category === 'done';
  });
}

/**
 * Feedback side effects of task events:
 * - a deleted or restored task unlinked or relinked its feedback (in the same transaction):
 *   the inbox and sidebar refetch;
 * - a task linked to feedback with "Email the submitter when the task is done" was completed.
 */
export function registerFeedbackEvents(app: FastifyInstance): void {
  app.events.on('*', async (event) => {
    if (event.type === 'task.deleted' || event.type === 'task.restored') {
      broadcastFeedbackChanged(app, {
        workspaceId: event.workspaceId,
        actorId: event.actorId,
        taskIds: [event.taskId],
      });
      return;
    }
    if (!completedBy(event)) return;
    const waiting = await app.db
      .select({ id: feedback.id, number: feedback.number })
      .from(feedback)
      .where(and(eq(feedback.taskId, event.taskId), eq(feedback.notifyOnDone, true)));
    if (waiting.length === 0) return;
    // TODO(email): there is no email service yet. When one exists, send each submitter a
    // "your request was done" email here (their address is `feedback.email`; never put it on
    // the task) and clear `notify_on_done` so a reopen-and-close doesn't send it twice.
    app.log.info(
      { taskId: event.taskId, feedback: waiting.map((f) => f.id) },
      'Feedback submitters asked to hear when this task is done (email not configured)',
    );
  });
}
