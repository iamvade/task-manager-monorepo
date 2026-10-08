/**
 * Sample data from the designs (`design/*.dc.html`). Names given as `[mn, en]` pairs come from the
 * `[mn, en]` tables in Main.dc.html; everything else exists only in English in the designs.
 *
 * Sources: Main (16 App Redesign tasks, mn names), Board (multiple assignees, extra tags, subtask
 * counts, column order), TaskDetail (APP-142), MyTasks (Anu's tasks + feed), Calendar (Product
 * space dates, unscheduled tasks), CreateTask (project colors, role hints).
 */
import type {
  ActivityType,
  PaletteKey,
  Priority,
  RichTextNode,
  StatusCategory,
  WorkspaceRole,
} from '@kite/shared';
import type { MonthDay, Stamp, When } from './dates.js';

/** A user-content string: `[mn, en]` when the designs have both, otherwise one string. */
export type Text = string | readonly [mn: string, en: string];

export const WORKSPACE = { name: 'Kite Studio', slug: 'kite-studio' } as const;
export const PASSWORD = 'password123';

// ---------------------------------------------------------------------------------------- people

export interface PersonDef {
  name: Text;
  initials: Text;
  email: string;
  avatarColor: PaletteKey;
  role: WorkspaceRole;
  /** Role hint shown in pickers ("Eng lead"). */
  title: string | null;
}

export const PEOPLE = {
  anu: {
    name: ['Ану Болд', 'Anu Bold'],
    initials: ['АБ', 'AB'],
    email: 'anu@kite.test',
    avatarColor: 'indigo',
    role: 'owner',
    title: null,
  },
  tem: {
    name: ['Тэмүүлэн Г.', 'Temuulen G.'],
    initials: ['ТГ', 'TG'],
    email: 'temuulen@kite.test',
    avatarColor: 'green',
    role: 'member',
    title: 'Mobile',
  },
  sara: {
    name: ['Сараа К.', 'Sara K.'],
    initials: ['СК', 'SK'],
    email: 'sara@kite.test',
    avatarColor: 'rose',
    role: 'member',
    title: 'Design',
  },
  dorj: {
    name: ['Дорж Э.', 'Dorj E.'],
    initials: ['ДЭ', 'DE'],
    email: 'dorj@kite.test',
    avatarColor: 'amber',
    role: 'member',
    title: 'Frontend',
  },
  mia: {
    name: ['Мишээл Л.', 'Mia L.'],
    initials: ['МЛ', 'ML'],
    email: 'mia@kite.test',
    avatarColor: 'sky',
    role: 'member',
    title: null,
  },
  oyu: {
    name: ['Оюука Н.', 'Oyuka N.'],
    initials: ['ОН', 'ON'],
    email: 'oyuka@kite.test',
    avatarColor: 'purple',
    role: 'member',
    title: null,
  },
  bat: {
    name: 'Bat O.',
    initials: 'BO',
    email: 'bat@kite.test',
    avatarColor: 'teal',
    role: 'member',
    title: 'Eng lead',
  },
  bay: {
    name: 'Bayarmaa T.',
    initials: 'BT',
    email: 'bayarmaa@kite.test',
    avatarColor: 'yellow',
    role: 'member',
    title: 'QA',
  },
} as const satisfies Record<string, PersonDef>;
export type PersonRef = keyof typeof PEOPLE;

/** "Me" in every design. */
export const ME: PersonRef = 'anu';

// ------------------------------------------------------------------------------ spaces, projects

export interface SpaceDef {
  name: Text;
  initial: Text;
  color: PaletteKey;
}

export const SPACES = {
  product: { name: ['Бүтээгдэхүүн', 'Product'], initial: ['Б', 'P'], color: 'violet' },
  engineering: { name: ['Инженерчлэл', 'Engineering'], initial: ['И', 'E'], color: 'green' },
  design: { name: ['Дизайн', 'Design'], initial: ['Д', 'D'], color: 'rose' },
} as const satisfies Record<string, SpaceDef>;
export type SpaceRef = keyof typeof SPACES;

export interface ProjectDef {
  space: SpaceRef;
  name: Text;
  key: string;
  color: PaletteKey;
  members: readonly PersonRef[];
  /** Default author of the project's tasks. */
  lead: PersonRef;
  createdAt: Stamp;
}

export const PROJECTS = {
  app: {
    space: 'product',
    name: ['Апп шинэчлэл', 'App Redesign'],
    key: 'APP',
    color: 'violet',
    members: ['anu', 'sara', 'tem', 'dorj', 'mia', 'oyu', 'bat'],
    lead: 'anu',
    createdAt: [8, 24, '10:00'],
  },
  checkout: {
    space: 'product',
    name: ['Төлбөрийн хуудас v2', 'Checkout v2'],
    key: 'CHK',
    color: 'sky',
    members: ['anu', 'dorj', 'oyu', 'sara', 'bay'],
    lead: 'anu',
    createdAt: [9, 7, '10:00'],
  },
  q4: {
    space: 'product',
    name: ['Q4 замын зураг', 'Q4 Roadmap'],
    key: 'Q4',
    color: 'amber',
    members: ['anu', 'bat', 'mia', 'oyu'],
    lead: 'anu',
    createdAt: [9, 14, '10:00'],
  },
  // Empty project with the "New" badge (created in the last 7 days).
  partner: {
    space: 'product',
    name: 'Partner Portal',
    key: 'PRT',
    color: 'neutral',
    members: ['anu'],
    lead: 'anu',
    createdAt: [10, 7, '15:00'],
  },
  platform: {
    space: 'engineering',
    name: ['Платформ шилжүүлэлт', 'Platform migration'],
    key: 'PLAT',
    color: 'sky',
    members: ['bat', 'dorj', 'tem', 'anu'],
    lead: 'bat',
    createdAt: [8, 17, '10:00'],
  },
  mobile: {
    space: 'engineering',
    name: ['Мобайл хувилбар 4.2', 'Mobile release 4.2'],
    key: 'MOB',
    color: 'green',
    members: ['tem', 'bat', 'dorj', 'bay', 'anu'],
    lead: 'tem',
    createdAt: [9, 1, '10:00'],
  },
  bugs: {
    space: 'engineering',
    name: ['Алдааны ангилал', 'Bug triage'],
    key: 'BUG',
    color: 'amber',
    members: ['bat', 'bay', 'dorj'],
    lead: 'bat',
    createdAt: [8, 3, '10:00'],
  },
  ds: {
    space: 'design',
    name: ['Дизайн систем', 'Design system'],
    key: 'DS',
    color: 'rose',
    members: ['sara', 'mia', 'anu'],
    lead: 'sara',
    createdAt: [7, 6, '10:00'],
  },
  brand: {
    space: 'design',
    name: ['Брэнд шинэчлэл', 'Brand refresh'],
    key: 'BRAND',
    color: 'violet',
    members: ['sara', 'mia', 'anu'],
    lead: 'sara',
    createdAt: [9, 21, '10:00'],
  },
} as const satisfies Record<string, ProjectDef>;
export type ProjectRef = keyof typeof PROJECTS;

export const SPRINT = { project: 'app', start: [10, 6], end: [10, 24] } as const satisfies {
  project: ProjectRef;
  start: MonthDay;
  end: MonthDay;
};

// ---------------------------------------------------------------------------------------- tags

export const TAGS = {
  research: { name: ['Судалгаа', 'Research'], color: 'blue' },
  ux: { name: 'UX', color: 'violet' },
  ui: { name: 'UI', color: 'violet' },
  ds: { name: ['Дизайн систем', 'Design system'], color: 'teal' },
  fe: { name: ['Фронтенд', 'Frontend'], color: 'neutral' },
  ios: { name: 'iOS', color: 'neutral' },
  android: { name: 'Android', color: 'neutral' },
  analytics: { name: ['Аналитик', 'Analytics'], color: 'orange' },
  a11y: { name: ['Хүртээмж', 'A11y'], color: 'green' },
  onboarding: { name: ['Танилцуулга', 'Onboarding'], color: 'pink' },
  docs: { name: ['Баримт', 'Docs'], color: 'neutral' },
  checkout: { name: 'Checkout', color: 'blue' },
  mobileWeb: { name: 'Mobile web', color: 'green' },
} as const satisfies Record<string, { name: Text; color: PaletteKey }>;
export type TagRef = keyof typeof TAGS;

// --------------------------------------------------------------------------------------- tasks

/** Comment text; `{ mention }` parts become TipTap mention nodes. */
export type CommentPart = string | { readonly mention: PersonRef };

export interface CommentDef {
  ref?: string;
  /** `ref` of the comment this replies to. */
  replyTo?: string;
  author: PersonRef;
  at: When;
  body: readonly CommentPart[];
  /** Extra people notified with a `comment` notification (mentions always notify). */
  notify?: readonly PersonRef[];
}

export interface SubtaskDef {
  title: string;
  done?: boolean;
  assignee?: PersonRef;
  due?: MonthDay;
}

export interface TaskDef {
  ref: string;
  project: ProjectRef;
  /** Explicit task number (App Redesign keys); otherwise the next one in the project. */
  number?: number;
  title: Text;
  status: StatusCategory;
  priority: Priority;
  assignees: readonly PersonRef[];
  tags?: readonly TagRef[];
  start?: MonthDay;
  due?: MonthDay;
  sprint?: boolean;
  createdBy?: PersonRef;
  createdAt?: Stamp;
  /** When a done task was completed; `'today'` = earlier today. */
  completedAt?: Stamp | 'today';
  /** Extra followers besides creator, assignees and commenters. */
  followers?: readonly PersonRef[];
  subtasks?: readonly SubtaskDef[];
  comments?: readonly CommentDef[];
}

type AppTaskDef = Omit<TaskDef, 'project'>;

/** `done` of `titles` are complete, as in the Board's "3/5". */
const subs = (done: number, titles: readonly string[], assignee?: PersonRef): SubtaskDef[] =>
  titles.map((title, i) => ({ title, done: i < done, ...(assignee ? { assignee } : {}) }));

const ICONS = [
  'home',
  'search',
  'cart',
  'heart',
  'user',
  'settings',
  'bell',
  'menu',
  'close',
  'check',
  'plus',
  'minus',
  'arrow-left',
  'arrow-right',
  'chevron-down',
  'chevron-up',
  'filter',
  'sort',
  'share',
  'download',
  'upload',
  'trash',
  'edit',
  'copy',
  'link',
  'lock',
  'unlock',
  'eye',
  'eye-off',
  'calendar',
  'clock',
  'map-pin',
  'phone',
  'mail',
  'chat',
  'camera',
  'image',
  'tag',
  'gift',
  'truck',
  'credit-card',
  'wallet',
  'receipt',
  'star',
  'info',
  'warning',
  'help',
  'logout',
] as const;

const C = (author: PersonRef, at: When, ...body: CommentPart[]): CommentDef => ({
  author,
  at,
  body,
});

/** The 16 sprint tasks of App Redesign, in Board column order, plus APP-142's full detail. */
const APP_SPRINT: AppTaskDef[] = [
  // To Do
  {
    ref: 'audit-nav',
    number: 133,
    title: ['Одоогийн навигацийн хэв маягийг шалгах', 'Audit current navigation patterns'],
    status: 'todo',
    priority: 'medium',
    assignees: ['tem'],
    tags: ['research', 'ux'],
    due: [10, 14],
    subtasks: subs(0, [
      'Inventory current nav entry points',
      'Map top tasks to nav destinations',
      'Benchmark three competitor apps',
      'Summarize findings for review',
    ]),
    comments: [
      C('sara', [10, 5, '11:20'], 'Can we include the tablet layout in the audit too?'),
      C('tem', [10, 5, '13:02'], 'Yes — adding tablet breakpoints to the inventory.'),
    ],
  },
  {
    ref: 'color-tokens',
    number: 136,
    title: ['Бараан горимын өнгөний токен тодорхойлох', 'Define color tokens for dark mode'],
    status: 'todo',
    priority: 'low',
    assignees: ['sara'],
    tags: ['ds'],
    due: [10, 16],
    subtasks: subs(
      1,
      [
        'List surface and text roles',
        'Draft the dark palette',
        'Check contrast ratios (WCAG AA)',
        'Map tokens to components',
        'Review with engineering',
        'Publish tokens to the Figma library',
      ],
      'sara',
    ),
  },
  {
    ref: 'settings-migration',
    number: 145,
    title: [
      'Тохиргооны дэлгэцийн шилжүүлэлтийн төлөвлөгөө',
      'Migration plan for the settings screen',
    ],
    status: 'todo',
    priority: 'medium',
    assignees: ['dorj', 'anu'],
    tags: ['fe', 'docs'],
    due: [10, 20],
  },
  {
    ref: 'usability-script',
    number: 146,
    title: [
      'Хэрэглээний тестийн скрипт — шинэ танилцуулга',
      'Usability test script — new onboarding',
    ],
    status: 'todo',
    priority: 'low',
    assignees: ['mia'],
    tags: ['research'],
    due: [10, 22],
    subtasks: subs(
      1,
      [
        'Define tasks and success criteria',
        'Write the moderator script',
        'Recruit six participants',
      ],
      'mia',
    ),
  },
  {
    ref: 'empty-states',
    number: 148,
    title: ['Хайлтын үр дүнгийн хоосон төлөвүүд', 'Empty states for search results'],
    status: 'todo',
    priority: 'medium',
    assignees: ['sara'],
    tags: ['ui'],
    due: [10, 23],
  },
  // In Progress
  {
    ref: 'tab-bar',
    number: 140,
    title: ['Шинэ доод таб самбар хэрэгжүүлэх', 'Implement new bottom tab bar'],
    status: 'in_progress',
    priority: 'urgent',
    assignees: ['tem', 'dorj'],
    tags: ['ios', 'android'],
    due: [10, 10],
    subtasks: subs(
      1,
      [
        'Tab bar component spec',
        'iOS implementation',
        'Android implementation',
        'Deep-link routing for tabs',
      ],
      'tem',
    ),
  },
  {
    ref: 'product-card',
    number: 137,
    title: ['Бүтээгдэхүүний картын компонент v2', 'Product card component v2'],
    status: 'in_progress',
    priority: 'high',
    assignees: ['sara', 'tem'],
    tags: ['ds', 'ui'],
    due: [10, 9],
    subtasks: subs(
      3,
      [
        'Image aspect ratio variants',
        'Price and discount layout',
        'Loading skeleton',
        'Out-of-stock state',
        'Dark mode pass',
      ],
      'sara',
    ),
    comments: [
      C('tem', [10, 6, '10:05'], 'The discount badge overlaps the image on the 2:3 ratio.'),
      C('sara', [10, 6, '11:30'], 'Fixed in the latest frame — the badge moves below the image.'),
      C('dorj', [10, 7, '09:40'], 'Do we need a separate skeleton for the compact variant?'),
      C('sara', [10, 7, '10:12'], 'Same skeleton, just shorter. Updated the spec.'),
    ],
  },
  {
    ref: 'onboarding-flow',
    number: 138,
    title: ['Танилцуулах урсгалыг шинэчлэх (3 дэлгэц)', 'Redesign onboarding flow (3 screens)'],
    status: 'in_progress',
    priority: 'high',
    assignees: ['anu', 'sara'],
    tags: ['onboarding', 'ux', 'research'],
    due: [10, 12],
    subtasks: subs(2, ['Welcome screen', 'Permissions screen', 'Personalization screen'], 'sara'),
    comments: [
      C('mia', [10, 2, '14:10'], 'Test participants skipped the permissions screen 4 of 6 times.'),
      C('anu', [10, 2, '15:00'], 'Let’s move permissions after personalization then.'),
      C('sara', [10, 5, '10:20'], 'Updated flow is in Figma — page “Onboarding v3”.'),
      C(
        'tem',
        [10, 5, '16:45'],
        'That order works for the permission prompts on both iOS and Android.',
      ),
      C('mia', [10, 6, '09:15'], 'Copy on the welcome screen still feels long.'),
      C('sara', [10, 6, '12:30'], 'Trimmed it to two lines.'),
      C('anu', [10, 7, '11:05'], 'Looks good. Let’s ship welcome and permissions first.'),
    ],
  },
  {
    ref: 'analytics-events',
    number: 141,
    title: [
      'Төлбөрийн хэсгийн аналитик эвентүүдийг шинэчлэх',
      'Update analytics events for checkout',
    ],
    status: 'in_progress',
    priority: 'medium',
    assignees: ['oyu'],
    tags: ['analytics', 'fe'],
    due: [10, 15],
    followers: ['anu'],
    subtasks: subs(
      2,
      [
        'Audit existing checkout events',
        'Define the new event schema',
        'Implement events on web',
        'Implement events on mobile',
        'Verify in the analytics dashboard',
      ],
      'oyu',
    ),
  },
  // In Review
  {
    ref: 'a11y-buttons',
    number: 135,
    title: ['Үндсэн товчлууруудын хүртээмжийн шалгалт', 'Accessibility pass on primary buttons'],
    status: 'review',
    priority: 'high',
    assignees: ['mia'],
    tags: ['a11y', 'ui'],
    due: [10, 7],
    subtasks: subs(
      4,
      [
        'Contrast check on all variants',
        'Focus ring states',
        'Screen reader labels',
        'Hit targets of at least 44px',
      ],
      'mia',
    ),
    comments: [
      C('mia', [10, 6, '15:40'], 'Secondary buttons fail contrast in dark mode (3.8:1).'),
      C('sara', [10, 7, '10:30'], 'Bumped the border token — now 4.6:1.'),
      C('mia', [10, 7, '14:55'], 'Verified. Ready for review once the focus ring PR lands.'),
    ],
  },
  {
    ref: 'checkout-responsive',
    number: 142,
    title: ['Төлбөрийн хуудас — респонсив байрлал', 'Checkout page — responsive layout'],
    status: 'review',
    priority: 'urgent',
    assignees: ['dorj', 'anu'],
    tags: ['fe', 'checkout', 'mobileWeb'],
    start: [10, 4],
    due: [10, 8],
    createdAt: [10, 1, '09:30'],
    subtasks: [
      { title: 'Breakpoint audit at 360 / 768 / 1024 / 1440', done: true, assignee: 'dorj' },
      { title: 'Collapse order summary into an accordion', done: true, assignee: 'dorj' },
      { title: 'Single-column payment form, 44px inputs', done: true, assignee: 'dorj' },
      { title: 'Sticky “Place order” bar on mobile', done: true, assignee: 'anu' },
      { title: 'Fix promo code field overflow (24-char codes)', done: true, assignee: 'dorj' },
      { title: 'QA on iOS Safari and Android Chrome', done: false, assignee: 'bat', due: [10, 9] },
    ],
    comments: [
      {
        ref: 'sara-promo',
        author: 'sara',
        at: [10, 3, '11:05'],
        body: [
          'Heads up on the promo field — the partner campaign uses codes up to 24 characters. ',
          { mention: 'dorj' },
          ' can we make sure those don’t clip on 360px?',
        ],
      },
      {
        replyTo: 'sara-promo',
        author: 'dorj',
        at: [10, 3, '11:40'],
        body: ['Good catch — I’ll test with 24-character codes at 360px.'],
      },
      {
        ref: 'bat-ios',
        author: 'bat',
        at: [10, 7, '16:20'],
        body: [
          'Looks good at 360 and 768. One issue: on iOS Safari the sticky bar covers the last field when the keyboard is open. ',
          { mention: 'dorj' },
          ' can you add bottom padding equal to the bar height?',
        ],
      },
      {
        author: 'dorj',
        at: { hoursAgo: 2 },
        body: [
          'Fixed in the latest preview build. ',
          { mention: 'bat' },
          ' ready for another look — leaving the QA subtask open until Android is checked.',
        ],
      },
      // The My Tasks feed's "Dorj E. mentioned you" (Main counts 5 comments on this task).
      {
        replyTo: 'bat-ios',
        author: 'dorj',
        at: { hoursAgo: 1.98 },
        body: [{ mention: 'anu' }, ' ready for sign-off once Bat confirms iOS.'],
      },
    ],
  },
  {
    ref: 'icon-set',
    number: 139,
    title: ['Дүрс тэмдгийн багц шинэчлэх (48 дүрс)', 'Icon set refresh (48 icons)'],
    status: 'review',
    priority: 'low',
    assignees: ['sara'],
    tags: ['ui', 'ds'],
    due: [10, 13],
    subtasks: subs(
      32,
      ICONS.map((name) => `Icon: ${name}`),
      'sara',
    ),
  },
  // Done
  {
    ref: 'kickoff',
    number: 121,
    title: ['Эхлэлийн уулзалт ба зорилгын баримт', 'Kickoff and goals doc'],
    status: 'done',
    priority: 'medium',
    assignees: ['anu'],
    tags: ['docs'],
    due: [9, 29],
    completedAt: [9, 29, '16:00'],
  },
  {
    ref: 'teardown',
    number: 124,
    title: ['Өрсөлдөгчдийн шинжилгээ — 5 апп', 'Competitive teardown — 5 apps'],
    status: 'done',
    priority: 'low',
    assignees: ['mia'],
    tags: ['research'],
    due: [10, 1],
    completedAt: [10, 5, '16:00'],
    followers: ['anu'],
    subtasks: subs(
      5,
      [
        'Teardown: marketplace app',
        'Teardown: grocery delivery app',
        'Teardown: fashion retail app',
        'Teardown: banking app',
        'Teardown: travel booking app',
      ],
      'mia',
    ),
  },
  {
    ref: 'stakeholders',
    number: 126,
    title: ['Оролцогч талуудтай ярилцлага', 'Stakeholder interviews'],
    status: 'done',
    priority: 'medium',
    assignees: ['anu', 'mia'],
    tags: ['research'],
    due: [10, 2],
    completedAt: [10, 2, '17:00'],
    subtasks: subs(
      6,
      [
        'Interview: Sales',
        'Interview: Support',
        'Interview: Marketing',
        'Interview: Engineering',
        'Interview: Finance',
        'Synthesize interview notes',
      ],
      'anu',
    ),
  },
  {
    ref: 'moodboard',
    number: 129,
    title: ['Визуал чиглэлийн мүүдборд', 'Visual direction moodboard'],
    status: 'done',
    priority: 'low',
    assignees: ['sara'],
    tags: ['ui'],
    due: [10, 3],
    completedAt: [10, 3, '12:00'],
  },
];

/** App Redesign tasks outside the sprint (My Tasks + Calendar), so the sprint filter still shows 16. */
const APP_OTHER: AppTaskDef[] = [
  {
    ref: 'onboarding-copy',
    number: 143,
    title: 'Review onboarding copy with Sara',
    status: 'in_progress',
    priority: 'high',
    assignees: ['anu', 'sara'],
    due: [10, 6],
    comments: [
      {
        author: 'sara',
        at: [10, 7, '17:30'],
        body: ['Pushed v3 of the copy — mostly the welcome screen.'],
        notify: ['anu'],
      },
    ],
  },
  {
    ref: 'usability-sessions',
    number: 147,
    title: 'Usability sessions',
    status: 'todo',
    priority: 'medium',
    assignees: ['mia'],
    tags: ['research'],
    due: [10, 28],
  },
  {
    ref: 'skeletons',
    number: 150,
    title: 'Skeleton loaders for product grid',
    status: 'todo',
    priority: 'medium',
    assignees: ['sara'],
    tags: ['ui'],
  },
  {
    ref: 'haptics',
    number: 151,
    title: 'Haptics for add-to-cart',
    status: 'todo',
    priority: 'low',
    assignees: ['tem'],
    tags: ['ios', 'android'],
  },
  {
    ref: 'onboarding-anim',
    number: 152,
    title: 'Onboarding animation spec',
    status: 'todo',
    priority: 'low',
    assignees: ['sara'],
    tags: ['onboarding'],
  },
];

const CHECKOUT: TaskDef[] = [
  {
    ref: 'payment-provider',
    project: 'checkout',
    title: 'Payment provider review',
    status: 'in_progress',
    priority: 'medium',
    assignees: ['dorj'],
    due: [9, 30],
  },
  {
    ref: 'saved-carts-discovery',
    project: 'checkout',
    title: 'Saved carts discovery',
    status: 'in_progress',
    priority: 'medium',
    assignees: ['oyu'],
    due: [10, 6],
  },
  {
    ref: 'legal-promo',
    project: 'checkout',
    title: 'Reply to legal on promo-code terms',
    status: 'todo',
    priority: 'medium',
    assignees: ['anu'],
    due: [10, 8],
  },
  {
    ref: 'prd-saved-carts',
    project: 'checkout',
    title: 'Write PRD: saved carts',
    status: 'in_progress',
    priority: 'medium',
    assignees: ['anu'],
    due: [10, 9],
  },
  {
    ref: 'promo-qa',
    project: 'checkout',
    title: 'Promo code edge-case QA',
    status: 'todo',
    priority: 'high',
    assignees: ['bay'],
    tags: ['checkout'],
    due: [10, 9],
  },
  {
    ref: 'ab-plan',
    project: 'checkout',
    title: 'A/B test plan',
    status: 'todo',
    priority: 'medium',
    assignees: ['oyu'],
    tags: ['analytics'],
    due: [10, 15],
  },
  {
    ref: 'checkout-design-review',
    project: 'checkout',
    title: 'Checkout v2 design review',
    status: 'todo',
    priority: 'medium',
    assignees: ['sara'],
    due: [10, 19],
  },
  {
    ref: 'launch-readiness',
    project: 'checkout',
    title: 'Launch readiness review',
    status: 'todo',
    priority: 'high',
    assignees: ['dorj'],
    due: [10, 26],
  },
  {
    ref: 'apple-pay',
    project: 'checkout',
    title: 'Apple Pay button placement',
    status: 'todo',
    priority: 'high',
    assignees: ['dorj'],
    tags: ['checkout'],
  },
  {
    ref: 'guest-copy',
    project: 'checkout',
    title: 'Guest checkout copy review',
    status: 'todo',
    priority: 'medium',
    assignees: ['sara'],
  },
];

const Q4: TaskDef[] = [
  {
    ref: 'q4-okrs',
    project: 'q4',
    title: 'Draft Q4 OKRs',
    status: 'done',
    priority: 'high',
    assignees: ['anu'],
    due: [10, 1],
    completedAt: [10, 1, '15:00'],
  },
  {
    ref: 'roadmap-workshop',
    project: 'q4',
    title: 'Roadmap workshop',
    status: 'done',
    priority: 'medium',
    assignees: ['anu'],
    due: [10, 5],
    completedAt: [10, 5, '17:00'],
  },
  {
    ref: 'approve-q4',
    project: 'q4',
    title: 'Approve Q4 roadmap priorities',
    status: 'todo',
    priority: 'urgent',
    assignees: ['anu'],
    due: [10, 7],
  },
  {
    ref: 'sprint-review-notes',
    project: 'q4',
    title: 'Prepare sprint review notes',
    status: 'in_progress',
    priority: 'medium',
    assignees: ['anu'],
    due: [10, 8],
  },
  {
    ref: 'sprint-review',
    project: 'q4',
    title: 'Sprint review',
    status: 'todo',
    priority: 'medium',
    assignees: ['bat'],
    due: [10, 9],
  },
  {
    ref: 'board-deck',
    project: 'q4',
    title: 'Board prep deck',
    status: 'todo',
    priority: 'high',
    assignees: ['mia'],
    due: [10, 12],
  },
  {
    ref: 'mid-quarter',
    project: 'q4',
    title: 'Mid-quarter check-in',
    status: 'todo',
    priority: 'medium',
    assignees: ['mia'],
    due: [10, 20],
  },
  {
    ref: 'sprint-retro',
    project: 'q4',
    title: 'Sprint retro',
    status: 'todo',
    priority: 'low',
    assignees: ['bat'],
    due: [10, 30],
  },
  {
    ref: 'leadership-review',
    project: 'q4',
    title: 'Q4 roadmap review with leadership',
    status: 'todo',
    priority: 'medium',
    assignees: ['anu'],
    due: [11, 3],
  },
  {
    ref: 'pricing-scan',
    project: 'q4',
    title: 'Competitor pricing scan',
    status: 'todo',
    priority: 'low',
    assignees: ['oyu'],
  },
];

/**
 * Anu's other tasks. The `done` ones are not drawn anywhere; they make My Tasks' "Completed this
 * week 7 (Mon 2, Tue 3, Wed 1, Thu 1) · +3 vs last week (Mon–Thu 4)" come out right.
 */
const ELSEWHERE: TaskDef[] = [
  {
    ref: 'tab-bar-checkin',
    project: 'mobile',
    title: 'Tab bar scope check-in with Temuulen',
    status: 'done',
    priority: 'low',
    assignees: ['anu'],
    due: [10, 8],
    createdBy: 'tem',
    createdAt: [10, 6, '10:10'],
    completedAt: 'today',
  },
  {
    ref: 'go-no-go',
    project: 'mobile',
    title: 'Mobile release 4.2 go / no-go',
    status: 'todo',
    priority: 'high',
    assignees: ['anu'],
    due: [10, 9],
  },
  {
    ref: 'android-regression',
    project: 'mobile',
    title: 'Regression pass on Android 15',
    status: 'todo',
    priority: 'high',
    assignees: ['bay'],
    tags: ['android'],
    due: [10, 13],
  },
  {
    ref: 'store-listing',
    project: 'mobile',
    title: 'Update store listing copy',
    status: 'todo',
    priority: 'low',
    assignees: ['mia'],
    due: [10, 14],
  },
  {
    ref: 'release-notes',
    project: 'mobile',
    title: 'Release notes draft for 4.2',
    status: 'done',
    priority: 'medium',
    assignees: ['anu'],
    tags: ['docs'],
    due: [10, 5],
    completedAt: [10, 5, '11:30'],
  },
  {
    ref: 'store-screenshots',
    project: 'mobile',
    title: 'Sign off App Store screenshots',
    status: 'done',
    priority: 'medium',
    assignees: ['anu'],
    due: [10, 6],
    completedAt: [10, 6, '10:40'],
  },

  {
    ref: 'storage-bucket',
    project: 'platform',
    title: 'Move file storage to an S3-compatible bucket',
    status: 'in_progress',
    priority: 'medium',
    assignees: ['dorj'],
    due: [10, 16],
  },
  {
    ref: 'pg-upgrade',
    project: 'platform',
    title: 'Postgres 16 upgrade on staging',
    status: 'todo',
    priority: 'high',
    assignees: ['bat'],
    due: [10, 12],
  },
  {
    ref: 'migration-runbook',
    project: 'platform',
    title: 'Review database migration runbook',
    status: 'done',
    priority: 'medium',
    assignees: ['anu'],
    tags: ['docs'],
    due: [9, 30],
    completedAt: [9, 30, '14:00'],
  },
  {
    ref: 'cutover-window',
    project: 'platform',
    title: 'Approve migration cutover window',
    status: 'done',
    priority: 'high',
    assignees: ['anu'],
    due: [10, 6],
    completedAt: [10, 6, '14:20'],
  },

  {
    ref: 'weekly-triage',
    project: 'bugs',
    title: 'Weekly triage',
    status: 'todo',
    priority: 'medium',
    assignees: ['bat'],
    due: [10, 9],
  },
  {
    ref: 'cart-badge',
    project: 'bugs',
    title: 'Cart badge count out of sync after logout',
    status: 'in_progress',
    priority: 'high',
    assignees: ['dorj'],
  },
  {
    ref: 'promo-spaces',
    project: 'bugs',
    title: 'Promo field accepts trailing spaces',
    status: 'todo',
    priority: 'medium',
    assignees: ['bay'],
    tags: ['checkout'],
  },

  {
    ref: 'final-review-card',
    project: 'ds',
    title: 'Final review: Product card component v2',
    status: 'review',
    priority: 'high',
    assignees: ['anu'],
    tags: ['ds'],
    due: [10, 9],
  },
  {
    ref: 'button-tokens',
    project: 'ds',
    title: 'Button component dark mode tokens',
    status: 'in_progress',
    priority: 'medium',
    assignees: ['sara'],
    tags: ['ds'],
    due: [10, 15],
  },
  {
    ref: 'token-naming',
    project: 'ds',
    title: 'Review button token naming',
    status: 'done',
    priority: 'low',
    assignees: ['anu'],
    tags: ['ds'],
    due: [10, 6],
    completedAt: [10, 6, '16:50'],
  },
  {
    ref: 'icon-grid',
    project: 'ds',
    title: 'Approve icon grid guidelines',
    status: 'done',
    priority: 'low',
    assignees: ['anu'],
    tags: ['ds'],
    due: [10, 7],
    completedAt: [10, 7, '15:10'],
  },

  {
    ref: 'brand-kickoff',
    project: 'brand',
    title: 'Brand refresh kickoff',
    status: 'todo',
    priority: 'low',
    assignees: ['anu'],
    due: [10, 27],
  },
  {
    ref: 'brand-moodboard',
    project: 'brand',
    title: 'Moodboard round 1',
    status: 'todo',
    priority: 'low',
    assignees: ['mia'],
    due: [11, 6],
  },
  {
    ref: 'brand-references',
    project: 'brand',
    title: 'Collect brand refresh references',
    status: 'done',
    priority: 'low',
    assignees: ['anu'],
    due: [9, 28],
    completedAt: [9, 28, '15:30'],
  },
];

export const TASKS: readonly TaskDef[] = [
  ...APP_SPRINT.map((t) => ({ ...t, project: 'app' as const, sprint: true })),
  ...APP_OTHER.map((t) => ({ ...t, project: 'app' as const })),
  ...CHECKOUT,
  ...Q4,
  ...ELSEWHERE,
];

// ------------------------------------------------------------------------------ activity events

interface EventBase {
  task: string;
  actor: PersonRef;
  at: When;
  /** People who get a notification for this event. */
  notify?: readonly PersonRef[];
}

/** History beyond `task.created`, comments and completions (which are derived from TASKS). */
export type EventDef = EventBase &
  (
    | { type: Extract<ActivityType, 'status.changed'>; from: StatusCategory; to: StatusCategory }
    | { type: Extract<ActivityType, 'priority.changed'>; from: Priority; to: Priority }
    | { type: Extract<ActivityType, 'due.changed'>; from: MonthDay; to: MonthDay }
    | { type: Extract<ActivityType, 'assignee.added'>; user: PersonRef }
    | { type: Extract<ActivityType, 'attachment.added'>; filename: string }
    | { type: Extract<ActivityType, 'subtask.completed'>; subtask: string }
  );

export const EVENTS: readonly EventDef[] = [
  // APP-142 history (TaskDetail.dc.html).
  {
    task: 'checkout-responsive',
    type: 'priority.changed',
    actor: 'anu',
    at: [10, 1, '09:31'],
    from: 'none',
    to: 'high',
  },
  {
    task: 'checkout-responsive',
    type: 'status.changed',
    actor: 'dorj',
    at: [10, 4, '09:10'],
    from: 'todo',
    to: 'in_progress',
  },
  {
    task: 'checkout-responsive',
    type: 'attachment.added',
    actor: 'dorj',
    at: [10, 6, '15:20'],
    filename: 'checkout-mobile-360.png',
  },
  {
    task: 'checkout-responsive',
    type: 'priority.changed',
    actor: 'anu',
    at: [10, 7, '10:00'],
    from: 'high',
    to: 'urgent',
  },
  {
    task: 'checkout-responsive',
    type: 'status.changed',
    actor: 'bat',
    at: [10, 7, '16:12'],
    from: 'in_progress',
    to: 'review',
    notify: ['anu'],
  },
  {
    task: 'checkout-responsive',
    type: 'subtask.completed',
    actor: 'dorj',
    at: { hoursAgo: 3 },
    subtask: 'Fix promo code field overflow (24-char codes)',
  },
  // My Tasks feed.
  {
    task: 'tab-bar-checkin',
    type: 'assignee.added',
    actor: 'tem',
    at: [10, 6, '10:15'],
    user: 'anu',
    notify: ['anu'],
  },
  {
    task: 'analytics-events',
    type: 'due.changed',
    actor: 'oyu',
    at: [10, 6, '14:40'],
    from: [10, 14],
    to: [10, 15],
  },
];

/** APP-142 attachments (metadata only; no files on disk). */
export const ATTACHMENTS = [
  {
    task: 'checkout-responsive',
    uploader: 'dorj',
    filename: 'checkout-mobile-360.png',
    mime: 'image/png',
    size: 248 * 1024,
    at: [10, 6, '15:20'],
  },
  {
    task: 'checkout-responsive',
    uploader: 'dorj',
    filename: 'checkout-tablet-768.png',
    mime: 'image/png',
    size: 312 * 1024,
    at: [10, 6, '15:21'],
  },
  {
    task: 'checkout-responsive',
    uploader: 'bat',
    filename: 'QA-checklist-checkout.pdf',
    mime: 'application/pdf',
    size: 84 * 1024,
    at: [10, 7, '16:05'],
  },
] as const satisfies readonly {
  task: string;
  uploader: PersonRef;
  filename: string;
  mime: string;
  size: number;
  at: Stamp;
}[];

/** Task descriptions (TipTap JSON). `mention` builds a mention node for a person. */
export const DESCRIPTIONS: Record<
  string,
  (mention: (person: PersonRef) => RichTextNode) => RichTextNode
> = {
  // TaskDetail.dc.html
  'checkout-responsive': (mention) => {
    const text = (value: string, marks?: RichTextNode['marks']): RichTextNode => ({
      type: 'text',
      text: value,
      ...(marks ? { marks } : {}),
    });
    const p = (...content: RichTextNode[]): RichTextNode => ({ type: 'paragraph', content });
    const li = (...content: RichTextNode[]): RichTextNode => ({
      type: 'listItem',
      content: [p(...content)],
    });
    return {
      type: 'doc',
      content: [
        p(
          text(
            'Make checkout work cleanly from 360px to 1440px. Below 768px the order summary currently overlaps the payment form, and the promo code field overflows its container.',
          ),
        ),
        { type: 'heading', attrs: { level: 4 }, content: [text('Acceptance criteria')] },
        {
          type: 'bulletList',
          content: [
            li(
              text('Order summary collapses into an accordion under '),
              text('768px', [{ type: 'code' }]),
            ),
            li(text('Payment fields stack to one column; inputs are at least 44px tall')),
            li(
              text('Sticky '),
              text('Place order', [{ type: 'bold' }]),
              text(' bar on mobile with the total always visible'),
            ),
            li(text('No horizontal scroll at 360px')),
          ],
        },
        p(
          text('Specs: '),
          text('Checkout — responsive specs', [
            { type: 'link', attrs: { href: 'https://example.com/specs/checkout-responsive' } },
          ]),
          text('. Ping '),
          mention('sara'),
          text(' for promo-code edge cases.'),
        ),
      ],
    };
  },
};
