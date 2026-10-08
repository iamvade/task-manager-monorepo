import type { PaletteKey, Priority, StatusCategory, TemplateId } from '@kite/shared';

/** Template copy as `[mn, en]`; the caller's locale picks one. */
export type Text = readonly [mn: string, en: string];

export interface TemplateTask {
  title: Text;
  priority: Priority;
  /** Defaults to `todo`. */
  category?: StatusCategory;
  /** Due date as days after the day the template is applied. */
  dueInDays?: number;
  /** Names from the template's `tags`. */
  tags?: readonly string[];
}

export interface ProjectTemplate {
  id: TemplateId;
  /** Workspace tags the template uses; existing tags with the same name are reused. */
  tags?: readonly { name: string; color: PaletteKey }[];
  /** A sprint starting today; every template task goes into it. */
  sprint?: { name: Text; days: number };
  tasks: readonly TemplateTask[];
}
