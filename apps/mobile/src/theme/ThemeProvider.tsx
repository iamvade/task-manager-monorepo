import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useAppearance } from '../stores/appearance';
import { buildTheme, type ColorScheme, type Theme } from './theme';

const ThemeContext = createContext<Theme | null>(null);

/** The scheme to render: the user's theme, or the device's for `system`. */
export function useColorSchemePreference(): ColorScheme {
  const pref = useAppearance((s) => s.theme);
  const device = useColorScheme();
  if (pref !== 'system') return pref;
  return device === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorSchemePreference();
  const accent = useAppearance((s) => s.accent);
  return (
    <ThemeContext.Provider value={buildTheme(scheme, accent)}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
