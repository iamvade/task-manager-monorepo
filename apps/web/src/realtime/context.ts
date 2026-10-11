import { createContext, useContext, useEffect } from 'react';
import type { RealtimeSocket } from './socket';

export const SocketContext = createContext<RealtimeSocket | null>(null);

/** Tells teammates this tab shows `taskId` (drawer or full page) while mounted. */
export function useViewingTask(taskId: string | undefined) {
  const socket = useContext(SocketContext);
  useEffect(() => {
    if (!socket || !taskId) return;
    socket.view(taskId);
    return () => {
      socket.view(null);
    };
  }, [socket, taskId]);
}
