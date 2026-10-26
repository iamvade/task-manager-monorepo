import type { RealtimeSocket } from '@kite/shared/client';
import { createContext, useContext, useEffect } from 'react';

export const SocketContext = createContext<RealtimeSocket | null>(null);

/** Tells teammates this app shows `taskId` while mounted (the task screen). */
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
