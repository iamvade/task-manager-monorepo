import type { RealtimeClientMessage, RealtimeServerMessage } from '../../schemas/realtime.js';
import type { SocketLike } from '../realtime-socket.js';

/**
 * In-memory WebSocket for tests (a real one would try to reach a server). Opens on the next tick
 * unless `FakeWebSocket.autoOpen` is off; tests drive it with `open`, `receive` and `drop`.
 * Events are plain objects, so it works without DOM event classes (React Native tests).
 */
export class FakeWebSocket implements SocketLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  static autoOpen = true;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: RealtimeClientMessage[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /** `options` is React Native's third argument (`{ headers }`). */
  constructor(
    readonly url: string,
    readonly protocols?: string | string[] | null,
    readonly options?: { headers?: Record<string, string> },
  ) {
    FakeWebSocket.instances.push(this);
    if (FakeWebSocket.autoOpen) {
      queueMicrotask(() => {
        if (this.readyState === FakeWebSocket.CONNECTING) this.open();
      });
    }
  }

  static get last(): FakeWebSocket | undefined {
    return FakeWebSocket.instances.at(-1);
  }

  static reset() {
    FakeWebSocket.instances = [];
    FakeWebSocket.autoOpen = true;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as RealtimeClientMessage);
  }

  close(code = 1000) {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({ type: 'open' });
  }

  receive(message: RealtimeServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** The server or network went away. */
  drop(code = 1006) {
    this.close(code);
  }
}
