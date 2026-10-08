import type { TemplateId } from '@kite/shared';
import { bugTriage } from './bug-triage.js';
import { productLaunch } from './product-launch.js';
import { sprintPlanning } from './sprint-planning.js';
import type { ProjectTemplate } from './types.js';

export type { ProjectTemplate, TemplateTask, Text } from './types.js';

export const TEMPLATES: Record<TemplateId, ProjectTemplate> = {
  'product-launch': productLaunch,
  'sprint-planning': sprintPlanning,
  'bug-triage': bugTriage,
};
