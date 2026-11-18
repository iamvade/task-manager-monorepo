import { describe, expect, it } from 'vitest';
import { switchTarget } from './paths.js';

describe('switchTarget', () => {
  it('keeps the section, else lands on My Tasks', () => {
    expect(switchTarget('labs', '/w/studio/inbox')).toBe('/w/labs/inbox');
    // The teammate in `?person=` belongs to the old workspace: only the section is kept.
    expect(switchTarget('labs', '/w/studio/outlook')).toBe('/w/labs/outlook');
    expect(switchTarget('labs', '/w/studio/p/123/list')).toBe('/w/labs/my-tasks');
  });

  it('keeps the whole Personal path (it is the same in every workspace)', () => {
    expect(switchTarget('labs', '/w/studio/personal/i/abc')).toBe('/w/labs/personal/i/abc');
    expect(switchTarget('labs', '/w/studio/personal/graph')).toBe('/w/labs/personal/graph');
  });
});
