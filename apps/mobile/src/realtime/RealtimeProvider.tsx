import { RealtimeSocket, createRealtimeRouter, type SocketLike } from '@kite/shared/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CLIENT_ID } from '../api/clientId';
import { currentToken } from '../api/session';
import { useAuth } from '../auth/useAuth';
import { signOut } from '../auth/signOut';
import { apiBaseUrl } from '../config';
import { useRealtimeStore } from '../stores/realtime';
import { useUiStore } from '../stores/ui';
import { appLifecycle } from './appLifecycle';
import { SocketContext } from './context';

/** `http(s)://host` → `ws(s)://host/api/v1/ws`; the token goes in a header, never the URL. */
export function socketUrl(base: string = apiBaseUrl()): string {
  return `${base.replace(/^http/, 'ws')}/api/v1/ws?client=${CLIENT_ID}`;
}

/**
 * React Native's WebSocket takes headers as its third argument; the DOM lib in Expo's tsconfig
 * declares the browser's two-argument constructor over it.
 */
type NativeWebSocket = new (
  url: string,
  protocols: string | string[] | null,
  options: { headers: Record<string, string> },
) => SocketLike;

function openSocket(url: string): SocketLike {
  const token = currentToken();
  const Socket = WebSocket as unknown as NativeWebSocket;
  return new Socket(url, null, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

/**
 * The signed-in app's one realtime socket: subscribed to the workspace shown (the last one
 * opened), presence into the realtime store, teammates' changes into the query cache with the
 * web's mapping. A reconnect refetches everything; a closed session (4401) signs out.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useAuth().me?.user.id;
  const workspaceId = useUiStore((s) => s.lastWorkspaceId) ?? undefined;
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const workspaceRef = useRef(workspaceId);

  useEffect(() => {
    if (!userId) return;
    const store = useRealtimeStore.getState();
    const router = createRealtimeRouter({
      queryClient,
      currentWorkspaceId: () => workspaceRef.current,
      presence: store,
      onRecentEdit: store.noteEdits,
    });
    const s = new RealtimeSocket({
      url: socketUrl(),
      createSocket: openSocket,
      lifecycle: appLifecycle,
      onStatus: store.setStatus,
      onReconnect: () => void queryClient.invalidateQueries(),
      onUnauthorized: () => void signOut(),
      onMessage: router.handle,
    });
    s.start();
    setSocket(s);
    return () => {
      s.stop();
      router.dispose();
      store.reset();
      setSocket(null);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    // Messages still in flight for the previous workspace are dropped.
    workspaceRef.current = workspaceId;
    if (socket && workspaceId) socket.subscribe(workspaceId);
  }, [socket, workspaceId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
