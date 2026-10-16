import type {
  StandupBlocker,
  StandupDay,
  StandupEntry,
  StandupGroup,
  StandupGroupMember,
  StandupSuggestions,
  StandupTaskRef,
  UserRef,
  WorkspaceRole,
} from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { AuthProvider } from '../auth/AuthProvider';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { ME, PROJECT, SIDEBAR, WORKSPACE_ID, mockApi } from './fixtures';
import { at } from './tasks';

/** Standup groups and a router render for the standup specs (Mobile team, Design team). */
export const SARA = at(PROJECT.members, 1);
export const DORJ = at(PROJECT.members, 3);
export const MEMBERS = [
  {
    user: { ...ME.user },
    role: 'owner',
    title: 'Product manager',
    capacityPoints: 15,
    joinedAt: '2026-01-01T00:00:00.000Z',
    absences: [],
    deactivatedAt: null,
  },
  SARA,
  DORJ,
];

export const MOBILE_ID = '01890000-0000-7000-8000-000000000a01';
export const DESIGN_ID = '01890000-0000-7000-8000-000000000a02';
export const member = (m: (typeof MEMBERS)[number], position: string): StandupGroupMember =>
  ({
    user: {
      id: m.user.id,
      name: m.user.name,
      initials: m.user.initials,
      avatarColor: m.user.avatarColor,
    },
    title: m.title,
    position,
    absences: [],
  }) as StandupGroupMember;
export const group = (overrides: Partial<StandupGroup>): StandupGroup => ({
  id: MOBILE_ID,
  workspaceId: WORKSPACE_ID,
  name: 'Mobile team',
  timezone: 'Asia/Ulaanbaatar',
  days: [0, 1, 2, 3, 4],
  postBy: '10:00',
  reminderAt: '09:30',
  meetingAt: '10:15',
  facilitatorId: SARA.user.id,
  speakingOrder: 'posting_order',
  secondsPerPerson: 120,
  totalMeetingMinutes: 15,
  showBlockersFirst: true,
  markLinkedTasksBlocked: true,
  createdAt: '2026-09-01T02:00:00.000Z',
  archivedAt: null,
  members: [member(at(MEMBERS, 0), 'a0'), member(SARA, 'a1'), member(DORJ, 'a2')],
  isMember: true,
  canEdit: true,
  today: '2026-10-08',
  meetsToday: true,
  myPosted: false,
  hasPosts: true,
  ...overrides,
});

export const MOBILE = group({});
export const DESIGN = group({
  id: DESIGN_ID,
  name: 'Design team',
  facilitatorId: ME.user.id,
  hasPosts: false,
  myPosted: true,
  members: [member(at(MEMBERS, 0), 'a0'), member(SARA, 'a1')],
});

export type Handler = (init?: RequestInit) => Response | Promise<Response>;

export function renderAt(
  entry: string,
  {
    role = 'owner',
    timezone = 'Asia/Ulaanbaatar',
    groups = [DESIGN, MOBILE],
    extra = {},
  }: {
    role?: WorkspaceRole;
    timezone?: string;
    groups?: StandupGroup[];
    extra?: Record<string, Handler>;
  } = {},
) {
  const me = {
    ...ME,
    preferences: { ...ME.preferences, locale: 'en', timezone },
    workspaces: ME.workspaces.map((w) => ({ ...w, role })),
  };
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(me),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () => Response.json(MEMBERS),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/standup-groups`]: () => Response.json(groups),
    [`GET /api/v1/standup-groups/${MOBILE_ID}`]: () =>
      Response.json(groups.find((g) => g.id === MOBILE_ID) ?? MOBILE),
    [`GET /api/v1/standup-groups/${DESIGN_ID}`]: () =>
      Response.json(groups.find((g) => g.id === DESIGN_ID) ?? DESIGN),
    ...extra,
  });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { fetchMock, router };
}

const ref = (m: { user: { id: string; name: string; initials: string; avatarColor: string } }) =>
  ({
    id: m.user.id,
    name: m.user.name,
    initials: m.user.initials,
    avatarColor: m.user.avatarColor,
  }) as UserRef;
export const ME_REF = ref(ME);
export const SARA_REF = ref(SARA);
export const DORJ_REF = ref(DORJ);

export const TAB_BAR: StandupTaskRef = {
  id: '01890000-0000-7000-8000-000000000b01',
  key: 'APP-140',
  title: 'Implement new bottom tab bar',
  project: { id: PROJECT.id, key: 'APP', name: PROJECT.name, color: 'violet' },
  statusCategory: 'in_progress',
};

export const BLOCKER: StandupBlocker = {
  id: '01890000-0000-7000-8000-000000000c01',
  entryId: '01890000-0000-7000-8000-000000000d02',
  date: '2026-10-08',
  text: 'Waiting on final tab icons',
  author: DORJ_REF,
  task: TAB_BAR,
  helpers: [SARA_REF],
  resolvedAt: null,
  resolvedBy: null,
  canResolve: true,
  createdAt: '2026-10-08T02:08:00.000Z',
  replies: [],
};

const reactions = (thumbs: UserRef[] = []): StandupEntry['reactions'] => [
  {
    emoji: 'thumbs_up',
    count: thumbs.length,
    mine: thumbs.some((u) => u.id === ME.user.id),
    users: thumbs,
  },
  { emoji: 'eyes', count: 0, mine: false, users: [] },
  { emoji: 'heart', count: 0, mine: false, users: [] },
];

export const SARA_ENTRY: StandupEntry = {
  id: '01890000-0000-7000-8000-000000000d01',
  groupId: MOBILE_ID,
  user: SARA_REF,
  title: 'Product designer',
  date: '2026-10-08',
  status: 'posted',
  postedAt: '2026-10-08T01:05:00.000Z',
  editedAt: null,
  isLate: false,
  yesterday: [
    { kind: 'text', text: 'Finished the hover states', taskId: TAB_BAR.id, task: TAB_BAR },
  ],
  today: [{ kind: 'text', text: 'Hand off the icons', task: null }],
  blockers: [],
  reactions: reactions([DORJ_REF, SARA_REF]),
  replies: [],
};

export const DORJ_ENTRY: StandupEntry = {
  ...SARA_ENTRY,
  id: BLOCKER.entryId,
  user: DORJ_REF,
  title: 'Frontend engineer',
  postedAt: '2026-10-08T02:08:00.000Z',
  isLate: true,
  yesterday: [],
  today: [{ kind: 'text', text: 'Test the refund flow', task: null }],
  blockers: [BLOCKER],
  reactions: reactions(),
};

/** Thursday Oct 8 2026: Sara posted 09:05, Dorj 10:08 (late, with a blocker), I haven't. */
export const dayOf = (overrides: Partial<StandupDay> = {}): StandupDay => ({
  group: MOBILE,
  date: '2026-10-08',
  today: '2026-10-08',
  isStandupDay: true,
  prevDate: '2026-10-07',
  nextDate: null,
  upcomingDate: '2026-10-08',
  editable: true,
  postByAt: '2026-10-08T02:00:00.000Z',
  meetingAt: '2026-10-08T02:15:00.000Z',
  members: [
    {
      user: ME_REF,
      title: 'Product manager',
      state: 'not_yet',
      postedAt: null,
      isLate: false,
      backOn: null,
    },
    {
      user: SARA_REF,
      title: 'Product designer',
      state: 'posted',
      postedAt: SARA_ENTRY.postedAt,
      isLate: false,
      backOn: null,
    },
    {
      user: DORJ_REF,
      title: 'Frontend engineer',
      state: 'posted',
      postedAt: DORJ_ENTRY.postedAt,
      isLate: true,
      backOn: null,
    },
  ],
  postedCount: 2,
  expectedCount: 3,
  entries: [DORJ_ENTRY, SARA_ENTRY],
  blockers: [BLOCKER],
  myEntry: null,
  meeting: null,
  ...overrides,
});

export const SUGGESTIONS: StandupSuggestions = {
  date: '2026-10-08',
  previousDate: '2026-10-07',
  since: '2026-10-07T02:00:00.000Z',
  until: '2026-10-08T01:00:00.000Z',
  yesterday: [{ kind: 'completed', task: TAB_BAR, at: '2026-10-07T08:00:00.000Z' }],
  today: [
    {
      tag: 'due_today',
      task: {
        ...TAB_BAR,
        id: '01890000-0000-7000-8000-000000000b02',
        key: 'APP-141',
        title: 'Sprint review notes',
      },
    },
  ],
};
