import { RealtimeSocket, createRealtimeRouter, queryKeys } from '@kite/shared/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCurrentWorkspace } from '../api/workspaces';
import { useRealtimeStore } from '../stores/realtime';
import { CLIENT_ID } from './clientId';
import { SocketContext } from './context';
import { webLifecycle } from './webLifecycle';

function socketUrl() {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/api/v1/ws?client=${CLIENT_ID}`;
}

/**
 * The signed-in tab's one realtime socket: subscribed to the current workspace, feeding presence
 * into the realtime store and teammates' changes into the query cache. A reconnect refetches
 * everything, since changes made while disconnected were missed.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const workspaceId = useCurrentWorkspace()?.id;
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const workspaceRef = useRef(workspaceId);

  useEffect(() => {
    const store = useRealtimeStore.getState();
    const router = createRealtimeRouter({
      queryClient,
      currentWorkspaceId: () => workspaceRef.current,
      presence: store,
      onRecentEdit: store.noteEdits,
    });
    const s = new RealtimeSocket({
      url: socketUrl(),
      createSocket: (url) => new WebSocket(url),
      lifecycle: webLifecycle,
      onStatus: store.setStatus,
      onReconnect: () => void queryClient.invalidateQueries(),
      onUnauthorized: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me }),
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
  }, [queryClient]);

  useEffect(() => {
    // Messages still in flight for the previous workspace are dropped.
    workspaceRef.current = workspaceId;
    if (socket && workspaceId) socket.subscribe(workspaceId);
  }, [socket, workspaceId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
