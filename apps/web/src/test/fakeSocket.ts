import type { RealtimeClientMessage, RealtimeServerMessage } from '@kite/shared';

/**
 * In-memory WebSocket for tests (jsdom's would try to reach a server). Opens on the next tick
 * unless `FakeWebSocket.autoOpen` is off; tests drive it with `open`, `receive` and `drop`.
 */
export class FakeWebSocket {
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
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {
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
    this.onclose?.(new CloseEvent('close', { code }));
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(message: RealtimeServerMessage) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  /** The server or network went away. */
  drop(code = 1006) {
    this.close(code);
  }
}
