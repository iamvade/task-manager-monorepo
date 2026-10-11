import type {
  AgingTask,
  Locale,
  Priority,
  ReportTask,
  StatusCategory,
  WorkloadPerson,
} from '@kite/shared';

/** CSV header labels; Mongolian copy from the Reports designs' STR tables and mn.json. */
const LABELS = {
  en: {
    key: 'Key',
    task: 'Task',
    project: 'Project',
    assignee: 'Assignee',
    status: 'Status',
    priority: 'Priority',
    size: 'Size',
    due: 'Due date',
    daysInStatus: 'Days in status',
    stale: 'Stale',
    timesCarried: 'Times carried',
    replan: 'Replan',
    committed: 'Committed',
    added: 'Added mid-sprint',
    done: 'Done',
    carried: 'Carried over',
    person: 'Person',
    jobTitle: 'Job title',
    openTasks: 'Open tasks',
    points: 'Points',
    overdue: 'Overdue',
    week: 'Due this week',
    later: 'Later',
    none: 'No due date',
    capacity: 'Capacity',
    load: 'Load',
    completedAt: 'Completed',
    cycle: 'Cycle time (days)',
    yes: 'Yes',
    no: 'No',
    heavy: 'Heavy',
    balanced: 'Balanced',
    light: 'Light',
  },
  mn: {
    key: 'Дугаар',
    task: 'Ажил',
    project: 'Төсөл',
    assignee: 'Хариуцагч',
    status: 'Төлөв',
    priority: 'Ач холбогдол',
    size: 'Хэмжээ',
    due: 'Дуусах огноо',
    daysInStatus: 'Төлөвт байгаа хугацаа',
    stale: 'Удсан',
    timesCarried: 'Шилжсэн тоо',
    replan: 'Дахин төлөвлөх',
    committed: 'Төлөвлөсөн',
    added: 'Дундаас нэмэгдсэн',
    done: 'Дууссан',
    carried: 'Шилжиж ирсэн',
    person: 'Гишүүн',
    jobTitle: 'Албан тушаал',
    openTasks: 'Нээлттэй ажил',
    points: 'Оноо',
    overdue: 'Хугацаа хэтэрсэн',
    week: 'Энэ долоо хоногт',
    later: 'Дараа',
    none: 'Огноогүй',
    capacity: 'Багтаамж',
    load: 'Ачаалал',
    completedAt: 'Дууссан огноо',
    cycle: 'Гүйцэтгэх хугацаа (хоног)',
    yes: 'Тийм',
    no: 'Үгүй',
    heavy: 'Ачаалал их',
    balanced: 'Тэнцвэртэй',
    light: 'Чөлөөтэй',
  },
} satisfies Record<Locale, Record<string, string>>;

const STATUS_NAMES: Record<Locale, Record<StatusCategory, string>> = {
  en: { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done' },
  mn: { todo: 'Хийх', in_progress: 'Хийгдэж буй', review: 'Хянагдаж буй', done: 'Дууссан' },
};

const PRIORITY_NAMES: Record<Locale, Record<Priority, string>> = {
  en: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'No priority' },
  mn: { urgent: 'Яаралтай', high: 'Өндөр', medium: 'Дунд', low: 'Бага', none: 'Ач холбогдолгүй' },
};

type Cell = string | number | boolean | null;

/** One CSV field (RFC 4180): quoted when it holds a comma, quote or line break. */
function field(value: Cell, locale: Locale): string {
  if (value === null) return '';
  const text =
    typeof value === 'boolean' ? (value ? LABELS[locale].yes : LABELS[locale].no) : String(value);
  // A leading =, +, - or @ would run as a formula in spreadsheets.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 CSV with a BOM (so Excel reads Mongolian correctly), CRLF line ends. */
export function toCsv(locale: Locale, header: string[], body: Cell[][]): string {
  const lines = [header, ...body].map((row) => row.map((v) => field(v, locale)).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export const labels = (locale: Locale) => LABELS[locale];

const taskCells = (locale: Locale, t: ReportTask): Cell[] => [
  t.key,
  t.title,
  t.project.name,
  t.assignees.map((a) => a.name).join(', '),
  t.status.name ?? STATUS_NAMES[locale][t.status.category],
  PRIORITY_NAMES[locale][t.priority],
  t.size,
  t.dueDate,
];

const taskHeader = (locale: Locale) => {
  const l = LABELS[locale];
  return [l.key, l.task, l.project, l.assignee, l.status, l.priority, l.size, l.due];
};

export function agingCsv(locale: Locale, tasks: AgingTask[]): string {
  const l = LABELS[locale];
  return toCsv(
    locale,
    [...taskHeader(locale), l.daysInStatus, l.stale],
    tasks.map((t) => [...taskCells(locale, t), t.daysInStatus, t.stale]),
  );
}

export interface SprintCsvRow {
  task: ReportTask;
  committed: boolean;
  added: boolean;
  done: boolean;
  timesCarried: number;
  replan: boolean;
}

export function sprintCsv(locale: Locale, tasks: SprintCsvRow[]): string {
  const l = LABELS[locale];
  return toCsv(
    locale,
    [...taskHeader(locale), l.committed, l.added, l.done, l.timesCarried, l.replan],
    tasks.map((r) => [
      ...taskCells(locale, r.task),
      r.committed,
      r.added,
      r.done,
      r.timesCarried,
      r.replan,
    ]),
  );
}

export function workloadCsv(locale: Locale, people: WorkloadPerson[]): string {
  const l = LABELS[locale];
  return toCsv(
    locale,
    [
      l.person,
      l.jobTitle,
      l.openTasks,
      l.points,
      l.overdue,
      l.week,
      l.later,
      l.none,
      l.capacity,
      l.load,
    ],
    people.map((p) => [
      p.user.name,
      p.title,
      p.openTasks,
      p.points,
      p.buckets.overdue.points,
      p.buckets.week.points,
      p.buckets.later.points,
      p.buckets.none.points,
      p.capacity,
      l[p.load],
    ]),
  );
}

export interface CompletedCsvRow {
  task: ReportTask;
  completedAt: string;
  cycleDays: number | null;
}

export function completedCsv(locale: Locale, tasks: CompletedCsvRow[]): string {
  const l = LABELS[locale];
  return toCsv(
    locale,
    [...taskHeader(locale), l.completedAt, l.cycle],
    tasks.map((r) => [...taskCells(locale, r.task), r.completedAt, r.cycleDays]),
  );
}
