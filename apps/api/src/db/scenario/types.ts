import type { AvatarColor, Locale, PaletteKey, WorkspaceRole } from '@kite/shared';

/** How a person behaves in the generated history. */
export type Archetype =
  /** Creates and reviews a lot, comments everywhere. */
  | 'lead'
  /** Rarely assigned, comments on many tasks (e.g. a designer giving feedback). */
  | 'commenter'
  /** Gets far more work than they finish: open tasks pile up, many overdue. */
  | 'overloaded'
  /** Away right now with open tasks still assigned. */
  | 'vacation'
  /** Joined in the last days: onboarding tasks, little history. */
  | 'newcomer'
  /** Left the company: no longer a workspace member, may still be assigned, lead or reviewer. */
  | 'left'
  /** Executive: few tasks, occasional comments, creates priorities. */
  | 'executive'
  | 'normal';

export interface PersonDef {
  key: string;
  name: string;
  /** Local part before the scenario's domain; derived from the name when absent. */
  emailLocal?: string;
  role: WorkspaceRole;
  title: string | null;
  department?: string;
  archetype: Archetype;
  avatarColor: AvatarColor;
  locale: Locale;
  timezone?: string;
  capacity?: number;
  /** When the account was created / joined the workspace. */
  joinedDaysAgo: number;
  /** `left` only. */
  leftDaysAgo?: number;
  /** `vacation` only: away from `fromDaysAgo` days ago until `untilDaysAhead` days from today. */
  vacation?: { fromDaysAgo: number; untilDaysAhead: number };
  /** Printed next to the credentials. */
  note?: string;
}

export interface SpaceDef {
  key: string;
  name: string;
  initial: string;
  color: PaletteKey;
}

/** Title / comment pools a project draws from (see text.ts). */
export type Topic =
  | 'mobile'
  | 'web'
  | 'booking'
  | 'internal'
  | 'platform'
  | 'data'
  | 'product'
  | 'design'
  | 'marketing'
  | 'sales'
  | 'finance'
  | 'hr'
  | 'support';

export interface ProjectDef {
  key: string;
  name: string;
  space: string;
  color: PaletteKey;
  lead: string;
  team: string[];
  tasks: number;
  createdDaysAgo: number;
  archivedDaysAgo?: number;
  /** Two-week sprints (engineering projects). */
  sprints: boolean;
  topic: Topic;
  /** Share of Mongolian titles and comments (the rest English). */
  mn: number;
  /** Share of tasks that go through review. */
  reviewShare?: number;
  /** Tags this project's tasks draw from. */
  tags: string[];
}

export interface TagDef {
  name: string;
  color: PaletteKey;
}

export interface ScenarioDef {
  slug: string;
  name: string;
  emailDomain: string;
  /** RNG seed. */
  seed: number;
  people: PersonDef[];
  spaces: SpaceDef[];
  projects: ProjectDef[];
  tags: TagDef[];
  /** Tasks that get a 50+ comment thread. */
  hotThreads: number;
  /** Who to print credentials for: label → person key. */
  credentials: [label: string, personKey: string][];
}
