import type { MeResponse } from '@kite/shared';
import { createContext, useContext } from 'react';

export interface AuthState {
  /** `undefined` while the first `/auth/me` is in flight, `null` when signed out. */
  me: MeResponse | null | undefined;
  isError: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}
