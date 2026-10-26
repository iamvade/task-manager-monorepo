import { DEFAULT_ACCENT, type Accent, type Theme as ThemePref } from '@kite/shared';
import { create } from 'zustand';

interface AppearanceState {
  /** The user's theme preference (`users.theme`); `system` follows the device. */
  theme: ThemePref;
  accent: Accent;
  setAppearance: (theme: ThemePref, accent: Accent) => void;
}

/** Theme and accent from the signed-in user's preferences (set after `/auth/me`). */
export const useAppearance = create<AppearanceState>()((set) => ({
  theme: 'system',
  accent: DEFAULT_ACCENT,
  setAppearance: (theme, accent) => {
    set({ theme, accent });
  },
}));
