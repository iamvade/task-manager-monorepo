import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../api/auth';
import { applyAppearance } from '../preferences';
import { AuthContext } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isError } = useMe();
  const { i18n } = useTranslation();
  const prefs = data?.preferences;

  useEffect(() => {
    // Signed out → defaults. While /auth/me is loading, keep what theme-init.js painted.
    if (data === null) {
      applyAppearance('system', '#6E56CF');
      return;
    }
    if (!prefs) return;
    applyAppearance(prefs.theme, prefs.accent);
    if (i18n.language !== prefs.locale) void i18n.changeLanguage(prefs.locale);
  }, [data, prefs, i18n]);

  return <AuthContext.Provider value={{ me: data, isError }}>{children}</AuthContext.Provider>;
}
