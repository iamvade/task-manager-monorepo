/*
 * Phone-only values (docs/mobile-notes.md §2.1, `design/MobileFoundations.dc.html` theme `t.*`).
 * The web has no counterpart, so these aren't checked against tokens.css. Accent-derived phone
 * colors (the toast action) are set in theme.ts.
 */

export const mobileLight = {
  /** Grouped screens and sheets' list background. */
  surface: '#F7F7F8',
  /** Sheets, menus. */
  raised: '#FFFFFF',
  fill: '#F4F4F5',
  seg: '#F1F1F3',
  segActive: '#FFFFFF',
  grabber: '#D4D4D8',
  checkboxBorder: '#C4C4CC',
  divider: '#EFEFF2',
  skeleton: '#EDEDF0',
  skeletonHi: '#F4F4F5',
  /** Danger text, field errors, the danger button (overdue stays `dueOverdue`). */
  danger: '#DC2626',
  tabBar: '#FFFFFF',
  scrim: 'rgba(24, 24, 27, 0.32)',
  toastBg: '#18181B',
  toastText: '#FAFAFA',
  swipeComplete: '#15803D',
  swipeMore: '#71717A',
  swipeArchive: '#52525B',
  dueOverdueBg: '#FDECEC',
  dueTodayBg: '#FDF0DC',
  searchHit: '#FEF08A',
  notesBg: '#FFFBEB',
  notesBorder: '#F5E6B8',
  imageViewer: '#000000',
} as const;

export type MobileColorName = keyof typeof mobileLight;

export const mobileDark: Record<MobileColorName, string> = {
  surface: '#161618',
  raised: '#1B1B1E',
  fill: '#1F1F23',
  seg: '#1F1F23',
  segActive: '#2A2A30',
  grabber: '#3F3F46',
  checkboxBorder: '#4A4A52',
  divider: '#1F1F23',
  skeleton: '#232328',
  skeletonHi: '#1B1B1E',
  danger: '#F87171',
  tabBar: '#111113',
  scrim: 'rgba(0, 0, 0, 0.6)',
  toastBg: '#EDEDEF',
  toastText: '#18181B',
  swipeComplete: '#15803D',
  swipeMore: '#3F3F46',
  swipeArchive: '#52525B',
  dueOverdueBg: 'rgba(248, 113, 113, 0.14)',
  dueTodayBg: 'rgba(251, 191, 36, 0.14)',
  searchHit: 'rgba(250, 204, 21, 0.28)',
  notesBg: '#18160F',
  notesBorder: '#3A3220',
  imageViewer: '#000000',
};

/** React Native `boxShadow` strings (New Architecture, both platforms). */
export const shadowsLight = {
  sheet: '0 -8px 32px rgba(24, 24, 27, 0.12)',
  fab: '0 2px 4px rgba(24, 24, 27, 0.08), 0 8px 20px rgba(24, 24, 27, 0.18)',
  menu: '0 12px 32px rgba(24, 24, 27, 0.14)',
  lifted: '0 2px 6px rgba(0, 0, 0, 0.08), 0 20px 40px rgba(0, 0, 0, 0.22)',
  segment: '0 1px 2px rgba(24, 24, 27, 0.08)',
} as const;

export type ShadowName = keyof typeof shadowsLight;

export const shadowsDark: Record<ShadowName, string> = {
  sheet: '0 -8px 32px rgba(0, 0, 0, 0.5)',
  fab: '0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.45)',
  menu: '0 12px 32px rgba(0, 0, 0, 0.5)',
  lifted: '0 2px 6px rgba(0, 0, 0, 0.08), 0 20px 40px rgba(0, 0, 0, 0.22)',
  segment: '0 1px 2px rgba(0, 0, 0, 0.4)',
};

/** Font size / line height pairs (px). Base text is 15/22 on the phone (web 14/20). */
export const type = {
  largeTitle: { fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
  moreTitle: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  stat: { fontSize: 30, lineHeight: 36 },
  detailTitle: { fontSize: 22, lineHeight: 30 },
  kpi: { fontSize: 20, lineHeight: 26 },
  sheetTitle: { fontSize: 17, lineHeight: 22 },
  nav: { fontSize: 16, lineHeight: 22 },
  /** Text inputs: 16px or iOS zooms in. */
  input: { fontSize: 16, lineHeight: 22 },
  body: { fontSize: 16, lineHeight: 24 },
  base: { fontSize: 15, lineHeight: 22 },
  meta: { fontSize: 13, lineHeight: 18 },
  /** Task keys, in Geist Mono. */
  key: { fontSize: 12, lineHeight: 16 },
  tab: { fontSize: 11, lineHeight: 14 },
} as const;

export const radii = {
  tag: 6,
  tile28: 7,
  segment: 8,
  search: 10,
  blockedPill: 11,
  button: 12,
  card: 14,
  sheet: 16,
  chip: 18,
} as const;

export const sizes = {
  gutter: 16,
  touch: 44,
  largeHeader: 44,
  header: 56,
  /** Plus the bottom safe area. */
  tabBar: 49,
  taskRow: 64,
  sheetRow: 52,
  propertyRow: 52,
  button: 48,
  field: 48,
  chip: 36,
  segmented: 40,
  fab: 56,
  pickerPane: 336,
} as const;
