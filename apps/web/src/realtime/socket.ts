import {
  REALTIME_CLOSE_UNAUTHORIZED,
  realtimeServerMessageSchema,
  type RealtimeClientMessage,
  type RealtimeServerMessage,
} from '@kite/shared';
import type { RealtimeStatus } from '../stores/realtime';

const MAX_DELAY_MS = 30_000;
/** Open this long and the next drop starts the backoff over. */
const STABLE_MS = 10_000;
/** The server sends a heartbeat every 25s; silence this long means a dead connection. */
const WATCHDOG_MS = 60_000;

/** Reconnect delay: 1s, 2s, 4s … capped at 30s, ±20% jitter so tabs don't reconnect in step. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

export interface RealtimeSocketOptions {
  url: string;
  onMessage: (message: RealtimeServerMessage) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** Opened again after a drop: whatever happened meanwhile was missed. */
  onReconnect: () => void;
  /** Closed for a session or membership that ended. */
  onUnauthorized: () => void;
  random?: () => number;
}

/**
 * One auto-reconnecting realtime socket. Remembers the subscribed workspace and the viewed task
 * and replays both on every (re)open.
 */
export class RealtimeSocket {
  #ws: WebSocket | null = null;
  #attempt = 0;
  #opened = false;
  #stopped = true;
  #workspaceId: string | null = null;
  #viewing: string | null = null;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #stable: ReturnType<typeof setTimeout> | undefined;
  #watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: RealtimeSocketOptions) {}

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    window.addEventListener('online', this.#reconnectNow);
    window.addEventListener('pagehide', this.#onPageHide);
    window.addEventListener('pageshow', this.#onPageShow);
    document.addEventListener('visibilitychange', this.#onVisible);
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    window.removeEventListener('online', this.#reconnectNow);
    window.removeEventListener('pagehide', this.#onPageHide);
    window.removeEventListener('pageshow', this.#onPageShow);
    document.removeEventListener('visibilitychange', this.#onVisible);
    this.#clearTimers();
    clearTimeout(this.#retry);
    const ws = this.#ws;
    this.#ws = null;
    ws?.close();
  }

  subscribe(workspaceId: string): void {
    if (this.#workspaceId === workspaceId) return;
    this.#workspaceId = workspaceId;
    this.#send({ type: 'subscribe', workspaceId });
    // The server forgets the viewed task on (re)subscribing, and ignores views sent before.
    if (this.#viewing) this.#send({ type: 'view', taskId: this.#viewing });
  }

  view(taskId: string | null): void {
    if (this.#viewing === taskId) return;
    this.#viewing = taskId;
    this.#send({ type: 'view', taskId });
  }

  #connect(): void {
    const ws = new WebSocket(this.options.url);
    this.#ws = ws;
    ws.onopen = () => {
      if (this.#ws !== ws) return;
      const reconnected = this.#opened;
      this.#opened = true;
      this.options.onStatus('open');
      if (this.#workspaceId) this.#send({ type: 'subscribe', workspaceId: this.#workspaceId });
      if (this.#viewing) this.#send({ type: 'view', taskId: this.#viewing });
      this.#stable = setTimeout(() => (this.#attempt = 0), STABLE_MS);
      this.#armWatchdog();
      if (reconnected) this.options.onReconnect();
    };
    ws.onmessage = (event: MessageEvent) => {
      if (this.#ws !== ws) return;
      this.#armWatchdog();
      if (typeof event.data !== 'string') return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      // Unknown types (a newer server) are skipped.
      const parsed = realtimeServerMessageSchema.safeParse(data);
      if (parsed.success) this.options.onMessage(parsed.data);
    };
    ws.onclose = (event: CloseEvent) => {
      this.#dropped(ws, event.code);
    };
  }

  /** The socket is gone (closed, or silent past the watchdog): retry after the backoff. */
  #dropped(ws: WebSocket, code?: number): void {
    if (this.#ws !== ws) return;
    this.#ws = null;
    this.#clearTimers();
    if (this.#stopped) return;
    this.options.onStatus(this.#opened ? 'reconnecting' : 'connecting');
    if (code === REALTIME_CLOSE_UNAUTHORIZED) this.options.onUnauthorized();
    this.#retry = setTimeout(
      () => {
        this.#connect();
      },
      backoffDelay(this.#attempt, this.options.random),
    );
    this.#attempt++;
  }

  /** Back online or back in the foreground: retry now instead of waiting out the backoff. */
  readonly #reconnectNow = () => {
    if (this.#stopped || this.#ws) return;
    clearTimeout(this.#retry);
    this.#attempt = 0;
    this.#connect();
  };

  /**
   * Leaving the page (or entering the back/forward cache, where an open socket would keep me
   * "online" and "viewing" a task I left): close now, reopen if the page is restored.
   */
  readonly #onPageHide = () => {
    const ws = this.#ws;
    this.#ws = null;
    this.#clearTimers();
    clearTimeout(this.#retry);
    ws?.close();
  };

  readonly #onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) this.#reconnectNow();
  };

  readonly #onVisible = () => {
    if (document.visibilityState === 'visible') this.#reconnectNow();
  };

  #armWatchdog(): void {
    clearTimeout(this.#watchdog);
    const ws = this.#ws;
    if (!ws) return;
    // A half-open connection may never fire `close`; don't wait for it.
    this.#watchdog = setTimeout(() => {
      this.#dropped(ws);
      ws.close();
    }, WATCHDOG_MS);
  }

  #clearTimers(): void {
    clearTimeout(this.#stable);
    clearTimeout(this.#watchdog);
  }

  #send(message: RealtimeClientMessage): void {
    // Not open yet: `onopen` replays the subscription and the viewed task.
    if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(message));
  }
}
