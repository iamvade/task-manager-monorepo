export const VIEWS = ['list', 'board', 'calendar'] as const;
export type View = (typeof VIEWS)[number];
