import type { ActivityType, TaskEventType } from '@kite/shared';
import type { FastifyBaseLogger } from 'fastify';

/** An activity row as carried by events. */
export interface EventActivity {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
}

export interface TaskEvent {
  type: TaskEventType;
  workspaceId: string;
  projectId: string;
  taskId: string;
  actorId: string;
  /** Activity rows the mutation wrote for this task (empty for a pure reorder). */
  activities: EventActivity[];
  /** `task.created` only: the initial assignees (no `assignee.added` rows are written). */
  assigneeIds?: string[];
  /** `comment.*`: the comment. */
  commentId?: string;
  /**
   * Workspace members newly @mentioned: every mention of a new comment, mentions added by a
   * comment edit, or mentions added to the description (`task.updated`).
   */
  mentionedUserIds?: string[];
  /** `subtask.changed`: the subtask. */
  subtaskId?: string;
  /** `attachment.changed`: the attachment. */
  attachmentId?: string;
  at: Date;
}

/** Every event on the bus; later phases add notification events. */
export type DomainEvent = TaskEvent;
export type DomainEventType = DomainEvent['type'];

type Handler<E> = (event: E) => void | Promise<void>;
type EventOf<T extends DomainEventType | '*'> = T extends DomainEventType
  ? DomainEvent & { type: T }
  : DomainEvent;

/**
 * In-process event bus. Mutations emit only after their transaction commits, so subscribers
 * never see rolled-back changes. Handlers run synchronously inside `emit`, so keep them short
 * and do real work asynchronously; their errors (thrown or rejected) are logged and never reach
 * the request that emitted.
 */
export class EventBus {
  readonly #handlers = new Map<DomainEventType | '*', Set<Handler<DomainEvent>>>();
  readonly #pending = new Set<Promise<void>>();

  constructor(private readonly log: FastifyBaseLogger) {}

  /** Subscribes to one event type (`'*'` for all). Returns an unsubscribe function. */
  on<T extends DomainEventType | '*'>(type: T, handler: Handler<EventOf<T>>): () => void {
    let set = this.#handlers.get(type);
    if (!set) this.#handlers.set(type, (set = new Set()));
    const h = handler as Handler<DomainEvent>;
    set.add(h);
    return () => set.delete(h);
  }

  emit(event: DomainEvent): void {
    const handlers = [
      ...(this.#handlers.get(event.type) ?? []),
      ...(this.#handlers.get('*') ?? []),
    ];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          const tracked = result.catch((err: unknown) => {
            this.#fail(event, err);
          });
          this.#pending.add(tracked);
          void tracked.finally(() => this.#pending.delete(tracked));
        }
      } catch (err) {
        this.#fail(event, err);
      }
    }
  }

  /** Resolves once every async handler started so far has settled (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.#pending.size > 0) await Promise.allSettled([...this.#pending]);
  }

  #fail(event: DomainEvent, err: unknown) {
    this.log.error({ err, event: event.type, taskId: event.taskId }, 'Event handler failed');
  }
}
