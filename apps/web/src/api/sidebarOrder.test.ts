import type { SidebarResponse } from '@kite/shared';
import { describe, expect, it } from 'vitest';
import { PROJECT_ID, SIDEBAR, SPACE_ID } from '../test/fixtures';
import { withProjectMoved, withRenamed, withSpaceMoved } from './sidebarOrder';

const data = SIDEBAR as SidebarResponse;
const ENGINEERING = '01890000-0000-7000-8000-000000000011';
const CHECKOUT = '01890000-0000-7000-8000-000000000021';
const names = (d: SidebarResponse) =>
  d.spaces.map((s) => `${s.name}: ${s.projects.map((p) => p.name).join(', ')}`);

describe('sidebar order', () => {
  it('moves a space after prevId, else before nextId, else to the end', () => {
    expect(names(withSpaceMoved(data, SPACE_ID, { prevId: ENGINEERING, nextId: null }))).toEqual([
      'Engineering: Bug triage',
      'Product: App Redesign, Checkout v2, Q4 Roadmap',
    ]);
    expect(names(withSpaceMoved(data, ENGINEERING, { prevId: null, nextId: SPACE_ID }))[0]).toBe(
      'Engineering: Bug triage',
    );
    expect(withSpaceMoved(data, 'nope', { prevId: null, nextId: null })).toBe(data);
  });

  it('moves a project within its space and into another one', () => {
    expect(
      names(withProjectMoved(data, PROJECT_ID, SPACE_ID, { prevId: CHECKOUT, nextId: null }))[0],
    ).toBe('Product: Checkout v2, App Redesign, Q4 Roadmap');
    const moved = withProjectMoved(data, PROJECT_ID, ENGINEERING, { prevId: null, nextId: null });
    expect(names(moved)).toEqual([
      'Product: Checkout v2, Q4 Roadmap',
      'Engineering: Bug triage, App Redesign',
    ]);
    expect(moved.spaces[1]?.projects[1]?.spaceId).toBe(ENGINEERING);
  });

  it('renames spaces and projects, favorites included', () => {
    const app = data.spaces[0]?.projects[0];
    if (!app) throw new Error('fixture');
    const renamed = withRenamed({ ...data, favorites: [app] }, PROJECT_ID, 'App 2027');
    expect(renamed.spaces[0]?.projects[0]?.name).toBe('App 2027');
    expect(renamed.favorites[0]?.name).toBe('App 2027');
    expect(withRenamed(data, SPACE_ID, 'Design').spaces[0]?.name).toBe('Design');
  });
});
