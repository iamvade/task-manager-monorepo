import type { PaletteKey } from '@kite/shared';

/*
 * Mirror of apps/web/src/styles/palette.css: palette keys (users.avatar_color, spaces.color,
 * projects.color, tags.color) → light/dark colors per family (docs/design-notes.md Appendix A.1).
 * `__tests__/drift.test.ts` fails when a value here and in the CSS differ.
 */

export type PaletteFamily = 'avatar' | 'space' | 'project' | 'tag';

export interface PaletteColors {
  bg: string;
  fg: string;
  /** Projects only: the project dot. */
  dot?: string;
}

export type PaletteEntry = Record<'light' | 'dark', PaletteColors>;

export const PALETTE: Record<PaletteFamily, Record<PaletteKey, PaletteEntry>> = {
  avatar: {
    indigo: { light: { bg: '#e0e7ff', fg: '#3730a3' }, dark: { bg: '#312e81', fg: '#c7d2fe' } },
    green: { light: { bg: '#dcfce7', fg: '#166534' }, dark: { bg: '#14532d', fg: '#bbf7d0' } },
    rose: { light: { bg: '#ffe4e6', fg: '#9f1239' }, dark: { bg: '#881337', fg: '#fecdd3' } },
    amber: { light: { bg: '#fef3c7', fg: '#92400e' }, dark: { bg: '#78350f', fg: '#fde68a' } },
    sky: { light: { bg: '#e0f2fe', fg: '#075985' }, dark: { bg: '#0c4a6e', fg: '#bae6fd' } },
    purple: { light: { bg: '#f3e8ff', fg: '#6b21a8' }, dark: { bg: '#581c87', fg: '#e9d5ff' } },
    teal: { light: { bg: '#ccfbf1', fg: '#115e59' }, dark: { bg: '#134e4a', fg: '#99f6e4' } },
    yellow: { light: { bg: '#fef9c3', fg: '#854d0e' }, dark: { bg: '#713f12', fg: '#fef08a' } },
    violet: { light: { bg: '#ede9fe', fg: '#5b21b6' }, dark: { bg: '#4c1d95', fg: '#ddd6fe' } },
    blue: { light: { bg: '#dbeafe', fg: '#1e40af' }, dark: { bg: '#1e3a8a', fg: '#bfdbfe' } },
    orange: { light: { bg: '#ffedd5', fg: '#9a3412' }, dark: { bg: '#7c2d12', fg: '#fed7aa' } },
    pink: { light: { bg: '#fce7f3', fg: '#9d174d' }, dark: { bg: '#831843', fg: '#fbcfe8' } },
    neutral: { light: { bg: '#f1f1f3', fg: '#3f3f46' }, dark: { bg: '#3f3f46', fg: '#e4e4e7' } },
  },
  space: {
    violet: { light: { bg: '#ede9fe', fg: '#5b21b6' }, dark: { bg: '#2e1065', fg: '#ddd6fe' } },
    green: { light: { bg: '#dcfce7', fg: '#166534' }, dark: { bg: '#14532d', fg: '#bbf7d0' } },
    rose: { light: { bg: '#ffe4e6', fg: '#9f1239' }, dark: { bg: '#4c0519', fg: '#fecdd3' } },
    sky: { light: { bg: '#e0f2fe', fg: '#075985' }, dark: { bg: '#082f49', fg: '#bae6fd' } },
    indigo: { light: { bg: '#e0e7ff', fg: '#3730a3' }, dark: { bg: '#1e1b4b', fg: '#c7d2fe' } },
    amber: { light: { bg: '#fef3c7', fg: '#92400e' }, dark: { bg: '#451a03', fg: '#fde68a' } },
    purple: { light: { bg: '#f3e8ff', fg: '#6b21a8' }, dark: { bg: '#3b0764', fg: '#e9d5ff' } },
    teal: { light: { bg: '#ccfbf1', fg: '#115e59' }, dark: { bg: '#042f2e', fg: '#99f6e4' } },
    yellow: { light: { bg: '#fef9c3', fg: '#854d0e' }, dark: { bg: '#422006', fg: '#fef08a' } },
    blue: { light: { bg: '#dbeafe', fg: '#1e40af' }, dark: { bg: '#172554', fg: '#bfdbfe' } },
    orange: { light: { bg: '#ffedd5', fg: '#9a3412' }, dark: { bg: '#431407', fg: '#fed7aa' } },
    pink: { light: { bg: '#fce7f3', fg: '#9d174d' }, dark: { bg: '#500724', fg: '#fbcfe8' } },
    neutral: { light: { bg: '#f1f1f3', fg: '#3f3f46' }, dark: { bg: '#27272a', fg: '#d4d4d8' } },
  },
  project: {
    violet: {
      light: { bg: '#efebfd', fg: '#4c3ba8', dot: '#7c5ce0' },
      dark: { bg: 'rgba(124, 92, 224, 0.2)', fg: '#c4b5fd', dot: '#a78bfa' },
    },
    sky: {
      light: { bg: '#e2f1fa', fg: '#0b5a80', dot: '#0284c7' },
      dark: { bg: 'rgba(2, 132, 199, 0.2)', fg: '#7dd3fc', dot: '#38bdf8' },
    },
    amber: {
      light: { bg: '#fcefdb', fg: '#8a4b08', dot: '#d97706' },
      dark: { bg: 'rgba(217, 119, 6, 0.2)', fg: '#fcd34d', dot: '#fbbf24' },
    },
    green: {
      light: { bg: '#e3f4e8', fg: '#166534', dot: '#16a34a' },
      dark: { bg: 'rgba(22, 163, 74, 0.2)', fg: '#86efac', dot: '#4ade80' },
    },
    rose: {
      light: { bg: '#fde7ec', fg: '#9f1239', dot: '#e11d48' },
      dark: { bg: 'rgba(225, 29, 72, 0.2)', fg: '#fda4af', dot: '#fb7185' },
    },
    neutral: {
      light: { bg: '#f1f1f3', fg: '#3f3f46', dot: '#a1a1aa' },
      dark: { bg: '#232328', fg: '#c9c9d1', dot: '#71717a' },
    },
    indigo: {
      light: { bg: '#e8ebfd', fg: '#3730a3', dot: '#4f46e5' },
      dark: { bg: 'rgba(79, 70, 229, 0.2)', fg: '#a5b4fc', dot: '#818cf8' },
    },
    purple: {
      light: { bg: '#f3e8ff', fg: '#6b21a8', dot: '#9333ea' },
      dark: { bg: 'rgba(147, 51, 234, 0.2)', fg: '#d8b4fe', dot: '#c084fc' },
    },
    teal: {
      light: { bg: '#e3f4f1', fg: '#0f766e', dot: '#0d9488' },
      dark: { bg: 'rgba(13, 148, 136, 0.2)', fg: '#5eead4', dot: '#2dd4bf' },
    },
    yellow: {
      light: { bg: '#fef6d7', fg: '#854d0e', dot: '#ca8a04' },
      dark: { bg: 'rgba(202, 138, 4, 0.2)', fg: '#fde047', dot: '#facc15' },
    },
    blue: {
      light: { bg: '#e8f1fd', fg: '#1d4ed8', dot: '#2563eb' },
      dark: { bg: 'rgba(37, 99, 235, 0.2)', fg: '#93c5fd', dot: '#60a5fa' },
    },
    orange: {
      light: { bg: '#fdf1e1', fg: '#9a3412', dot: '#ea580c' },
      dark: { bg: 'rgba(234, 88, 12, 0.2)', fg: '#fdba74', dot: '#fb923c' },
    },
    pink: {
      light: { bg: '#fcebf3', fg: '#9d174d', dot: '#db2777' },
      dark: { bg: 'rgba(219, 39, 119, 0.2)', fg: '#f9a8d4', dot: '#f472b6' },
    },
  },
  tag: {
    blue: {
      light: { bg: '#e8f1fd', fg: '#1d4ed8' },
      dark: { bg: 'rgba(59, 130, 246, 0.16)', fg: '#93c5fd' },
    },
    violet: {
      light: { bg: '#f1eefd', fg: '#5b45b8' },
      dark: { bg: 'rgba(139, 116, 240, 0.18)', fg: '#c4b5fd' },
    },
    teal: {
      light: { bg: '#e3f4f1', fg: '#0f766e' },
      dark: { bg: 'rgba(20, 184, 166, 0.16)', fg: '#5eead4' },
    },
    orange: {
      light: { bg: '#fdf1e1', fg: '#9a3412' },
      dark: { bg: 'rgba(249, 115, 22, 0.16)', fg: '#fdba74' },
    },
    green: {
      light: { bg: '#e6f4ea', fg: '#166534' },
      dark: { bg: 'rgba(34, 197, 94, 0.16)', fg: '#86efac' },
    },
    pink: {
      light: { bg: '#fcebf3', fg: '#9d174d' },
      dark: { bg: 'rgba(236, 72, 153, 0.16)', fg: '#f9a8d4' },
    },
    neutral: { light: { bg: '#f1f1f3', fg: '#3f3f46' }, dark: { bg: '#232328', fg: '#c9c9d1' } },
    indigo: {
      light: { bg: '#eef0fd', fg: '#3730a3' },
      dark: { bg: 'rgba(99, 102, 241, 0.16)', fg: '#a5b4fc' },
    },
    rose: {
      light: { bg: '#fde8ec', fg: '#9f1239' },
      dark: { bg: 'rgba(244, 63, 94, 0.16)', fg: '#fda4af' },
    },
    amber: {
      light: { bg: '#fdf1e1', fg: '#92400e' },
      dark: { bg: 'rgba(245, 158, 11, 0.16)', fg: '#fcd34d' },
    },
    sky: {
      light: { bg: '#e5f3fb', fg: '#075985' },
      dark: { bg: 'rgba(14, 165, 233, 0.16)', fg: '#7dd3fc' },
    },
    purple: {
      light: { bg: '#f5edfd', fg: '#6b21a8' },
      dark: { bg: 'rgba(168, 85, 247, 0.16)', fg: '#d8b4fe' },
    },
    yellow: {
      light: { bg: '#fdf7dc', fg: '#854d0e' },
      dark: { bg: 'rgba(234, 179, 8, 0.16)', fg: '#fde047' },
    },
  },
};

/** The colors of `key` in `family` for the given scheme. */
export function paletteColors(
  family: PaletteFamily,
  key: PaletteKey,
  scheme: 'light' | 'dark',
): PaletteColors {
  return PALETTE[family][key][scheme];
}
