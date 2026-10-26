import { RealtimeSocket } from '@kite/shared/client';
import { FakeWebSocket } from '@kite/shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webLifecycle } from './webLifecycle';

function setup() {
  const socket = new RealtimeSocket({
    url: 'ws://test/api/v1/ws',
    createSocket: (url) => new FakeWebSocket(url),
    lifecycle: webLifecycle,
    random: () => 0.5,
    onStatus: () => undefined,
    onReconnect: () => undefined,
    onUnauthorized: () => undefined,
    onMessage: () => undefined,
  });
  socket.start();
  return socket;
}

const ws = () => {
  const last = FakeWebSocket.last;
  if (!last) throw new Error('no socket');
  return last;
};

describe('webLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.autoOpen = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries right away when the browser comes back online', () => {
    const socket = setup();
    ws().open();
    ws().drop();
    window.dispatchEvent(new Event('online'));
    expect(FakeWebSocket.instances).toHaveLength(2);
    socket.stop();
  });

  it('closes when the page is hidden and reopens if it comes back from the cache', () => {
    const socket = setup();
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

  it('stops listening when the socket stops', () => {
    const socket = setup();
    ws().open();
    socket.stop();
    window.dispatchEvent(new Event('online'));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
