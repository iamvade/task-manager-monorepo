import { describe, expect, it } from 'vitest';
import { toTaskQuery } from './taskQuery';
import { readFilters } from './useViewParams';

const ME_ID = '01890000-0000-7000-8000-000000000001';
const S1 = '01890000-0000-7000-8000-000000000501';
const T1 = '01890000-0000-7000-8000-000000000701';

describe('toTaskQuery', () => {
  it('maps URL filters to the list endpoint, resolving "me"', () => {
    const filters = readFilters(
      new URLSearchParams(
        `status=${S1}&assignee=me,unassigned&priority=urgent,bogus&tag=${T1},nope&sprint=${S1}&dueFrom=2026-10-01&dueTo=2026-10-31&sort=priority`,
      ),
    );
    expect(toTaskQuery(filters, ME_ID, 'project')).toEqual({
      statusId: [S1],
      assigneeId: [ME_ID, 'unassigned'],
      priority: ['urgent'],
      tagId: [T1],
      sprintId: S1,
      dueFrom: '2026-10-01',
      dueTo: '2026-10-31',
    });
  });

  it('filters the space list by status category and ignores sprints', () => {
    const filters = readFilters(new URLSearchParams(`status=todo,done,${S1}&sprint=${S1}`));
    expect(toTaskQuery(filters, ME_ID, 'space')).toEqual({ statusCategory: ['todo', 'done'] });
  });

  it('treats sprint=none and bad dates as no filter', () => {
    const filters = readFilters(new URLSearchParams('sprint=none&dueFrom=10/08'));
    expect(toTaskQuery(filters, ME_ID, 'project')).toEqual({});
  });
});
