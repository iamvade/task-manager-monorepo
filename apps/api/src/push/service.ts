import type { NotificationType } from '@kite/shared';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { pushSubscriptions, workspaces } from '../db/schema/index.js';
import type { Notified } from '../notifications/deliver.js';
import { loadPushItems } from './content.js';
import type { PushOptions, PushTransport } from './transport.js';

/** How long a push service keeps a push for a browser that is offline, seconds. */
const TTL_SECONDS = 24 * 60 * 60;
/** A standup reminder is pointless once the morning is over. */
const REMINDER_TTL_SECONDS = 60 * 60;

/** Direct asks wake a phone or laptop sooner; the rest can wait for the next wake-up. */
const HIGH_URGENCY: ReadonlySet<NotificationType> = new Set([
  'mention',
  'assigned',
  'standup_help',
]);

function optionsFor(type: NotificationType): PushOptions {
  return {
    ttl: type === 'standup_reminder' ? REMINDER_TTL_SECONDS : TTL_SECONDS,
    urgency: HIGH_URGENCY.has(type) ? 'high' : 'normal',
  };
}

/**
 * Web Push for new notifications. `notify` is called after the notifications committed (from
 * `publishNotified`, so it follows every Inbox rule: preferences, project levels, collapsing) and
 * only queues: requests never wait for push services. A subscription the push service no longer
 * knows (404/410) is deleted.
 */
export class PushService {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly app: FastifyInstance,
    private readonly transport: PushTransport | null,
    /** VAPID public key browsers subscribe with; null = push is off. */
    readonly publicKey: string | null,
  ) {}

  get enabled(): boolean {
    return this.transport !== null && this.publicKey !== null;
  }

  notify(workspaceId: string, notified: readonly Notified[]): void {
    if (!this.enabled || notified.length === 0) return;
    const ids = notified.map((n) => n.id);
    const types = new Map(notified.map((n) => [n.id, n.type]));
    this.queue = this.queue
      .then(() => this.deliver(workspaceId, ids, types))
      .catch((err: unknown) => {
        this.app.log.error({ err }, 'push delivery failed');
      });
  }

  /** Resolves once everything queued so far was sent (tests, shutdown). */
  idle(): Promise<void> {
    return this.queue;
  }

  private async deliver(
    workspaceId: string,
    ids: string[],
    types: ReadonlyMap<string, NotificationType>,
  ): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    const { db } = this.app;
    const [workspace] = await db
      .select({ id: workspaces.id, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!workspace) return;

    const items = await loadPushItems(db, workspace, ids);
    if (items.length === 0) return;
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, [...new Set(items.map((i) => i.userId))]));
    if (subs.length === 0) return;

    const sends = items.flatMap((item) => {
      const body = JSON.stringify(item.payload);
      const options = optionsFor(types.get(item.payload.id) ?? 'comment');
      return subs
        .filter((s) => s.userId === item.userId)
        .map(async (sub) => {
          const result = await transport(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            options,
          );
          return { sub, result };
        });
    });

    const results = await Promise.all(sends);
    const gone = results.filter((r) => !r.result.ok && r.result.gone).map((r) => r.sub.id);
    const delivered = results.filter((r) => r.result.ok).map((r) => r.sub.id);
    for (const { sub, result } of results) {
      if (!result.ok && !result.gone) {
        // Never the endpoint: it's a capability URL.
        this.app.log.warn({ subscriptionId: sub.id, status: result.status }, 'push not accepted');
      }
    }
    if (gone.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    }
    if (delivered.length > 0) {
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: this.app.clock() })
        .where(inArray(pushSubscriptions.id, [...new Set(delivered)]));
    }
  }
}
