import { DEFAULT_ACCENT } from '@kite/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useMe } from '../api/auth';
import { applyUserLocale } from '../i18n';
import { useAppearance } from '../stores/appearance';
import { scopeUiStore } from '../stores/ui';
import { AuthContext } from './useAuth';

/** The signed-in user for the whole app, with their UI state, theme and language applied. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, refetch, isFetching, isError, fetchStatus } = useMe();
  const unreachable = data === undefined && (isError || fetchStatus === 'paused');
  const prefs = data?.preferences;

  useEffect(() => {
    // UI state (last workspace…) is kept per account.
    if (data !== undefined) scopeUiStore(data?.user.id ?? null);
  }, [data]);

  useEffect(() => {
    if (data === null) {
      useAppearance.getState().setAppearance('system', DEFAULT_ACCENT);
      return;
    }
    if (!prefs) return;
    useAppearance.getState().setAppearance(prefs.theme, prefs.accent);
    applyUserLocale(prefs.locale);
  }, [data, prefs]);

  const value = useMemo(
    () => ({ me: data, isFetching, unreachable, refetch: () => void refetch() }),
    [data, isFetching, unreachable, refetch],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
