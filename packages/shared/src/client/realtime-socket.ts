import {
  REALTIME_CLOSE_UNAUTHORIZED,
  realtimeServerMessageSchema,
  type RealtimeClientMessage,
  type RealtimeServerMessage,
} from '../schemas/realtime.js';

const MAX_DELAY_MS = 30_000;
/** Open this long and the next drop starts the backoff over. */
const STABLE_MS = 10_000;
/** The server sends a heartbeat every 25s; silence this long means a dead connection. */
const WATCHDOG_MS = 60_000;
/** `WebSocket.OPEN`. */
const OPEN = 1;

/** `connecting` until the first open, `reconnecting` after a drop. */
export type RealtimeStatus = 'connecting' | 'open' | 'reconnecting';

/** Reconnect delay: 1s, 2s, 4s … capped at 30s, ±20% jitter so tabs don't reconnect in step. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

// Handlers typed as methods (bivariant), so the browser's and React Native's WebSocket both fit.
type Handler<E> = { bivarianceHack(event: E): void }['bivarianceHack'];

/** The part of a WebSocket the realtime client uses. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: Handler<unknown> | null;
  onmessage: Handler<{ data: unknown }> | null;
  onclose: Handler<{ code: number }> | null;
}

/**
 * When the platform says the connection should go away or come back: web listens to
 * online / pagehide / visibility, the app to AppState and network changes. Returns the cleanup.
 */
export type RealtimeLifecycle = (handlers: {
  /** Back online or in the foreground: reconnect now instead of waiting out the backoff. */
  resume: () => void;
  /** Hidden or in the background: close until `resume`. */
  suspend: () => void;
}) => () => void;

export interface RealtimeSocketOptions {
  url: string;
  /** Opens the connection (the app adds its `Authorization` header here). */
  createSocket: (url: string) => SocketLike;
  lifecycle?: RealtimeLifecycle;
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
  #ws: SocketLike | null = null;
  #attempt = 0;
  #opened = false;
  #stopped = true;
  #workspaceId: string | null = null;
  #viewing: string | null = null;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #stable: ReturnType<typeof setTimeout> | undefined;
  #watchdog: ReturnType<typeof setTimeout> | undefined;
  #unlisten: (() => void) | undefined;

  constructor(private readonly options: RealtimeSocketOptions) {}

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#unlisten = this.options.lifecycle?.({ resume: this.resume, suspend: this.suspend });
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    this.#unlisten?.();
    this.#unlisten = undefined;
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

  /** Back online or back in the foreground: retry now instead of waiting out the backoff. */
  readonly resume = (): void => {
    if (this.#stopped || this.#ws) return;
    clearTimeout(this.#retry);
    this.#attempt = 0;
    this.#connect();
  };

  /**
   * Leaving the page or going to the background, where an open socket would keep me "online"
   * and "viewing" a task I left: close now, reopen on `resume`.
   */
  readonly suspend = (): void => {
    const ws = this.#ws;
    this.#ws = null;
    this.#clearTimers();
    clearTimeout(this.#retry);
    ws?.close();
  };

  #connect(): void {
    const ws = this.options.createSocket(this.options.url);
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
    ws.onmessage = (event) => {
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
    ws.onclose = (event) => {
      this.#dropped(ws, event.code);
    };
  }

  /** The socket is gone (closed, or silent past the watchdog): retry after the backoff. */
  #dropped(ws: SocketLike, code?: number): void {
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
    if (this.#ws?.readyState === OPEN) this.#ws.send(JSON.stringify(message));
  }
}
