import type { MeResponse } from '@kite/shared';
import { createContext, useContext } from 'react';

export interface AuthState {
  /** `undefined` while the first `/auth/me` is in flight, `null` when signed out. */
  me: MeResponse | null | undefined;
  /** Re-reads `/auth/me` (No workspace's "Check again"). */
  refetch: () => void;
  isFetching: boolean;
  /** The first `/auth/me` failed or waits for the network (offline, nothing cached). */
  unreachable: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}
