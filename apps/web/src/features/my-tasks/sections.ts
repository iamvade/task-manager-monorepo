import type { SectionId } from '../../api/homeCache';

/** Key of the My Tasks sections in the UI store's collapsed groups. */
export const MY_TASKS_LIST_ID = 'my-tasks';

/** DOM id of a section (the stat cards scroll to it). */
export const sectionElementId = (id: SectionId) => `my-tasks-${id}`;
