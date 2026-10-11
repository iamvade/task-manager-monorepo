import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { queryKeys } from '../api/queryKeys';
import { useCurrentWorkspace } from '../api/workspaces';
import { useRealtimeStore } from '../stores/realtime';
import { createMessageHandler } from './applyMessage';
import { CLIENT_ID } from './clientId';
import { SocketContext } from './context';
import { RealtimeSocket } from './socket';

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
    const handler = createMessageHandler(queryClient);
    const s = new RealtimeSocket({
      url: socketUrl(),
      onStatus: store.setStatus,
      onReconnect: () => void queryClient.invalidateQueries(),
      onUnauthorized: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      onMessage: (message) => {
        if ('workspaceId' in message && message.workspaceId !== workspaceRef.current) return;
        switch (message.type) {
          case 'ready':
            store.ready(message.workspaceId, message.online, message.viewers);
            return;
          case 'presence.online':
          case 'presence.offline':
            store.setOnline(message.userId, message.type === 'presence.online');
            return;
          case 'presence.viewers':
            store.setViewers(message.taskId, message.userIds);
            return;
          default:
            handler.handle(message);
        }
      },
    });
    s.start();
    setSocket(s);
    return () => {
      s.stop();
      handler.dispose();
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
