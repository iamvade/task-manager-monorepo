import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/fakeSocket';
import { RealtimeSocket, backoffDelay } from './socket';

const WS_ID = '01890000-0000-7000-8000-000000000002';
const TASK_ID = '01890000-0000-7000-8000-000000000601';

function setup() {
  const calls = {
    status: [] as string[],
    reconnects: 0,
    unauthorized: 0,
    messages: [] as string[],
  };
  const socket = new RealtimeSocket({
    url: 'ws://test/api/v1/ws',
    random: () => 0.5, // no jitter
    onStatus: (s) => calls.status.push(s),
    onReconnect: () => calls.reconnects++,
    onUnauthorized: () => calls.unauthorized++,
    onMessage: (m) => calls.messages.push(m.type),
  });
  return { socket, calls };
}

const ws = () => {
  const last = FakeWebSocket.last;
  if (!last) throw new Error('no socket');
  return last;
};

describe('backoffDelay', () => {
  it('doubles from 1s up to 30s, with ±20% jitter', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, () => 0.5))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(backoffDelay(0, () => 0)).toBe(800);
    expect(backoffDelay(0, () => 1)).toBe(1200);
  });
});

describe('RealtimeSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.autoOpen = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes on open and replays the subscription and viewed task after a reconnect', () => {
    const { socket, calls } = setup();
    socket.start();
    socket.subscribe(WS_ID);
    ws().open();
    expect(ws().sent).toEqual([{ type: 'subscribe', workspaceId: WS_ID }]);
    socket.view(TASK_ID);
    expect(ws().sent.at(-1)).toEqual({ type: 'view', taskId: TASK_ID });

    ws().drop();
    expect(calls.status).toEqual(['open', 'reconnecting']);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    ws().open();
    expect(ws().sent).toEqual([
      { type: 'subscribe', workspaceId: WS_ID },
      { type: 'view', taskId: TASK_ID },
    ]);
    expect(calls.reconnects).toBe(1);
    socket.stop();
  });

  it('sends the viewed task again after a (re)subscribe, which resets it on the server', () => {
    const { socket } = setup();
    socket.start();
    ws().open();
    socket.view(TASK_ID); // the drawer mounted before the workspace was known
    socket.subscribe(WS_ID);
    expect(ws().sent).toEqual([
      { type: 'view', taskId: TASK_ID },
      { type: 'subscribe', workspaceId: WS_ID },
      { type: 'view', taskId: TASK_ID },
    ]);
    socket.stop();
  });

  it('backs off between failed attempts and starts over once stable', () => {
    const { socket } = setup();
    socket.start();
    ws().drop(); // never opened
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    ws().drop();
    vi.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    ws().open();
    vi.advanceTimersByTime(10_000);
    ws().drop();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(4);
    socket.stop();
  });

  it('reports a closed session and drops a silent connection', () => {
    const { socket, calls } = setup();
    socket.start();
    ws().open();
    ws().drop(4401);
    expect(calls.unauthorized).toBe(1);

    vi.advanceTimersByTime(1000);
    ws().open();
    ws().receive({ type: 'heartbeat' });
    vi.advanceTimersByTime(59_999);
    expect(calls.status.at(-1)).toBe('open');
    vi.advanceTimersByTime(1);
    expect(calls.status.at(-1)).toBe('reconnecting');
    expect(calls.messages).toEqual(['heartbeat']);
    socket.stop();
  });

  it('retries right away when the browser comes back online', () => {
    const { socket } = setup();
    socket.start();
    ws().open();
    ws().drop();
    window.dispatchEvent(new Event('online'));
    expect(FakeWebSocket.instances).toHaveLength(2);
    socket.stop();
  });

  it('closes when the page is hidden and reopens if it comes back from the cache', () => {
    const { socket } = setup();
    socket.start();
    ws().open();
    const first = ws();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(FakeWebSocket.instances).toHaveLength(2);
    socket.stop();
  });

  it('stops for good', () => {
    const { socket, calls } = setup();
    socket.start();
    ws().open();
    socket.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(calls.status).toEqual(['open']);
  });
});
