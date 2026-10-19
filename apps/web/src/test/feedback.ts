import type {
  FeedbackDetail,
  FeedbackListItem,
  FeedbackListResponse,
  FeedbackTaskRef,
} from '@kite/shared';
import { PROJECT_ID, SPACE_ID } from './fixtures';

const id = (n: number) => `01890000-0000-7000-8000-0000000005${String(n).padStart(2, '0')}`;

export const TASK_REF: FeedbackTaskRef = {
  id: '01890000-0000-7000-8000-000000000600',
  key: 'APP-142',
  title: 'Checkout page — responsive layout',
  project: { id: PROJECT_ID, spaceId: SPACE_ID, key: 'APP', name: 'App Redesign', color: 'violet' },
  status: {
    id: '01890000-0000-7000-8000-000000000700',
    name: null,
    category: 'review',
    color: null,
  },
  assignees: [
    {
      id: '01890000-0000-7000-8000-000000000103',
      name: 'Dorj E.',
      initials: 'DE',
      avatarColor: 'amber',
    },
  ],
  dueDate: '2026-10-08',
  completedAt: null,
};

export const item = (n: number, extra: Partial<FeedbackListItem> = {}): FeedbackListItem => ({
  id: id(n),
  ref: `FB-${String(1040 + n)}`,
  type: 'bug',
  status: 'new',
  title: `Report ${String(n)}`,
  preview: `Details of report ${String(n)}`,
  attachmentCount: 0,
  submitterName: `Person ${String(n)}`,
  email: `person${String(n)}@example.com`,
  task: null,
  isRead: false,
  createdAt: '2026-10-08T03:00:00.000Z',
  ...extra,
});

export const FREEZE = item(2, {
  title: 'App freezes on the payment step',
  preview: 'iPhone 13, iOS 17. After choosing a card the screen stops.',
  attachmentCount: 2,
  submitterName: 'Enkhjin D.',
  email: 'enkhjin.d@gmail.com',
});
export const QPAY = item(3, {
  type: 'feature',
  title: 'Please add QPay',
  isRead: true,
  status: 'review',
});
export const LINKED = item(4, {
  type: 'feedback',
  title: 'Cart badge does not update',
  status: 'linked',
  isRead: true,
  task: TASK_REF,
});

export function listOf(items: FeedbackListItem[], extra: Partial<FeedbackListResponse> = {}) {
  return {
    items,
    total: items.length,
    unread: items.filter((i) => !i.isRead).length,
    typeCounts: { all: items.length, bug: 1, feature: 1, feedback: 1, other: 0 },
    statusCounts: { new: 1, review: 1, linked: 1, closed: 0 },
    ...extra,
  } satisfies FeedbackListResponse;
}

export function detailOf(i: FeedbackListItem, extra: Partial<FeedbackDetail> = {}): FeedbackDetail {
  const { preview: _preview, ...rest } = i;
  return {
    ...rest,
    body: 'iPhone 13, iOS 17. After choosing a card and tapping Pay the screen stops responding.',
    phone: null,
    device: {
      browser: 'Safari 17.4',
      os: 'iOS 17.4',
      device: 'iPhone',
      kind: 'mobile',
      screen: null,
      viewport: null,
      language: null,
      timezone: null,
    },
    userAgent: '',
    attachments: [],
    linkedReports: [],
    notifyOnDone: false,
    activity: [
      {
        id: '01890000-0000-7000-8000-000000000801',
        kind: 'created',
        actor: null,
        text: null,
        data: {},
        createdAt: i.createdAt,
      },
    ],
    updatedAt: i.createdAt,
    ...extra,
  };
}
