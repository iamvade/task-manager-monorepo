import type { Theme } from '@kite/shared';
import { useQueryClient } from '@tanstack/react-query';
import { meQueryKey, useUpdateMe } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';

/** The saved theme and a setter that applies it right away and saves it to the profile. */
export function useTheme() {
  const { me } = useAuth();
  const updateMe = useUpdateMe();
  const queryClient = useQueryClient();

  function setTheme(theme: Theme) {
    if (!me) return;
    const previous = me;
    // Optimistic: AuthProvider applies the theme as soon as the cached profile changes.
    queryClient.setQueryData(meQueryKey, { ...me, preferences: { ...me.preferences, theme } });
    updateMe.mutate({ theme }, { onError: () => queryClient.setQueryData(meQueryKey, previous) });
  }

  /** Light ↔ dark from what is on screen now (`system` resolves to one of them). */
  const resolved = (): 'light' | 'dark' =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  return { theme: me?.preferences.theme ?? 'system', setTheme, resolved };
}
