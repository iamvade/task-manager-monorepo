import type { StandupSuggestions } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import { SUGGESTIONS, TAB_BAR } from '../../../test/standup';
import { SUGGESTED_YESTERDAY, initialDraft } from './draft';

const task = (i: number) => ({
  ...TAB_BAR,
  id: `01890000-0000-7000-8000-0000000e${String(i).padStart(4, '0')}`,
  key: `APP-${String(200 + i)}`,
  title: `Task ${String(i)}`,
});

describe('initialDraft', () => {
  it('starts a new update with the strongest few Yesterday suggestions, the rest behind "more"', () => {
    const yesterday: StandupSuggestions['yesterday'] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        kind: 'commented' as const,
        task: task(i),
        at: '2026-10-07T08:00:00.000Z',
      })),
      { kind: 'completed', task: task(20), at: '2026-10-07T07:00:00.000Z' },
      { kind: 'review', task: task(21), at: '2026-10-07T06:00:00.000Z' },
    ];
    const draft = initialDraft(null, { ...SUGGESTIONS, yesterday });
    expect(draft.yesterday).toHaveLength(SUGGESTED_YESTERDAY);
    expect(draft.yesterday.slice(0, 2).map((r) => r.kind)).toEqual(['completed', 'review']);
    expect(draft.more).toHaveLength(yesterday.length - SUGGESTED_YESTERDAY);
    expect(draft.removed).toEqual([]);
  });
});
