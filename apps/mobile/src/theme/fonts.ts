// Per-weight entry points: the package index would bundle every weight and italic.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';

/** Loaded by the root layout (`useFonts`); the keys are the font family names. */
export const FONT_ASSETS = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  GeistMono_400Regular,
};

export type FontWeight = 400 | 500 | 600;

const SANS: Record<FontWeight, keyof typeof FONT_ASSETS> = {
  400: 'Geist_400Regular',
  500: 'Geist_500Medium',
  600: 'Geist_600SemiBold',
};

/**
 * The family for a weight. React Native can't synthesize weights of a custom font, so each weight
 * is its own family (set `fontFamily`, never `fontWeight`). Geist Mono (task keys) is 400 only.
 */
export function fontFor(weight: FontWeight = 400, mono = false): string {
  return mono ? 'GeistMono_400Regular' : SANS[weight];
}
