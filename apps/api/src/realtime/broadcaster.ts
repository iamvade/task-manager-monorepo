import type { RealtimeServerMessage } from '@kite/shared';

/** A message and who gets it: everyone subscribed to a workspace, or one user's connections. */
export interface Envelope {
  to: { workspaceId: string } | { userId: string; workspaceId: string };
  /** The tab that made the change already shows it; it gets no echo. */
  exceptClientId?: string;
  message: RealtimeServerMessage;
}

export type EnvelopeHandler = (envelope: Envelope) => void;

/**
 * Fan-out of realtime messages between API instances. Every instance publishes the messages its
 * mutations produce and delivers what it receives to its own sockets (the hub subscribes).
 * Single-instance today; see the README's "Realtime" section for Postgres LISTEN/NOTIFY or Redis.
 */
export interface Broadcaster {
  publish(envelope: Envelope): void;
  /** Returns an unsubscribe function. */
  subscribe(handler: EnvelopeHandler): () => void;
  close(): Promise<void>;
}

/** In-process broadcaster: delivers synchronously to this instance's subscribers. */
export class LocalBroadcaster implements Broadcaster {
  readonly #handlers = new Set<EnvelopeHandler>();

  publish(envelope: Envelope): void {
    for (const handler of this.#handlers) handler(envelope);
  }

  subscribe(handler: EnvelopeHandler): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  close(): Promise<void> {
    this.#handlers.clear();
    return Promise.resolve();
  }
}
