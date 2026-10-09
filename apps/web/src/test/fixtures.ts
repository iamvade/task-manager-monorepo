import { vi } from 'vitest';

export const WORKSPACE_ID = '01890000-0000-7000-8000-000000000002';
export const SPACE_ID = '01890000-0000-7000-8000-000000000010';
export const PROJECT_ID = '01890000-0000-7000-8000-000000000020';
export const SPRINT_ID = '01890000-0000-7000-8000-000000000030';

export const ME = {
  user: {
    id: '01890000-0000-7000-8000-000000000001',
    email: 'anu@kite.test',
    name: 'Anu Bold',
    initials: 'AB',
    avatarColor: 'indigo',
  },
  preferences: {
    locale: 'mn',
    timezone: 'Asia/Ulaanbaatar',
    theme: 'light',
    accent: '#6E56CF',
    density: 'comfortable',
    notificationPrefs: { mention: true, assigned: true, comment: true, status: true },
  },
  workspaces: [
    { id: WORKSPACE_ID, name: 'Kite Studio', slug: 'kite-studio', role: 'owner', title: null },
  ],
};

const project = (n: number, name: string, spaceId = SPACE_ID) => ({
  id: n === 0 ? PROJECT_ID : `01890000-0000-7000-8000-0000000000${String(20 + n)}`,
  spaceId,
  name,
  key: name.slice(0, 3).toUpperCase(),
  color: 'violet',
  position: `a${String(n)}`,
  createdAt: '2026-01-01T00:00:00.000Z',
});

export const SIDEBAR = {
  spaces: [
    {
      id: SPACE_ID,
      name: 'Product',
      initial: 'P',
      color: 'violet',
      position: 'a0',
      projects: [project(0, 'App Redesign'), project(1, 'Checkout v2'), project(2, 'Q4 Roadmap')],
    },
    {
      id: '01890000-0000-7000-8000-000000000011',
      name: 'Engineering',
      initial: 'E',
      color: 'green',
      position: 'a1',
      projects: [project(3, 'Bug triage', '01890000-0000-7000-8000-000000000011')],
    },
  ],
  favorites: [],
  myTasksCount: 7,
  inboxUnreadCount: 3,
};

const member = (n: number, name: string, initials: string, avatarColor: string) => ({
  user: {
    id: `01890000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
    name,
    initials,
    avatarColor,
    email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@kite.test`,
  },
  role: 'member',
  title: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
});

export const PROJECT = {
  id: PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  spaceId: SPACE_ID,
  key: 'APP',
  name: 'App Redesign',
  color: 'violet',
  archivedAt: null,
  space: { id: SPACE_ID, name: 'Product', initial: 'P', color: 'violet' },
  position: 'a0',
  createdAt: '2026-01-01T00:00:00.000Z',
  isFavorite: false,
  statuses: [],
  members: [
    member(1, 'Anu Bold', 'AB', 'indigo'),
    member(2, 'Sara K.', 'SK', 'rose'),
    member(3, 'Temuulen G.', 'TG', 'green'),
    member(4, 'Dorj E.', 'DE', 'amber'),
    member(5, 'Mia L.', 'ML', 'sky'),
    member(6, 'Oyuka N.', 'ON', 'purple'),
    member(7, 'Bat O.', 'BO', 'teal'),
  ],
  activeSprint: {
    id: SPRINT_ID,
    projectId: PROJECT_ID,
    name: 'Sprint 1',
    startDate: '2026-10-06',
    endDate: '2026-10-24',
  },
  taskCounts: [],
  taskCount: 16,
  doneCount: 4,
};

export const unauthorized = () =>
  Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 });

type Handler = (init?: RequestInit) => Response;

/** Stubs fetch with `"METHOD /api/v1/path"` handlers; unknown requests throw. */
export function mockApi(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request ${key}`);
    return Promise.resolve(handler(init));
  });
}
