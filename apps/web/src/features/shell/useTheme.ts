import type { Theme } from '@kite/shared';
import { useSaveMe } from '../../api/useSaveMe';
import { useAuth } from '../../auth/useAuth';

/** The saved theme and a setter that applies it right away and saves it to the profile. */
export function useTheme() {
  const { me } = useAuth();
  const save = useSaveMe();

  function setTheme(theme: Theme) {
    save({ theme });
  }

  /** Light ↔ dark from what is on screen now (`system` resolves to one of them). */
  const resolved = (): 'light' | 'dark' =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  return { theme: me?.preferences.theme ?? 'system', setTheme, resolved };
}
