import { scopeUiStore, useUiStore } from '../ui';

const ANU = '01890000-0000-7000-8000-000000000001';
const BAT = '01890000-0000-7000-8000-000000000107';
const STUDIO = '01890000-0000-7000-8000-000000000002';
const LABS = '01890000-0000-7000-8000-000000000003';

describe('UI store per account', () => {
  beforeEach(() => {
    for (const id of [ANU, BAT, null]) {
      scopeUiStore(id);
      useUiStore.persist.clearStorage();
    }
    scopeUiStore(null);
    useUiStore.setState({ lastWorkspaceId: null, lastStandupGroupIds: {} });
  });

  it('saves under kite.ui.<userId> and loads it back for that account only', () => {
    scopeUiStore(ANU);
    expect(useUiStore.persist.getOptions().name).toBe(`kite.ui.${ANU}`);
    expect(useUiStore.getState().scopedTo).toBe(ANU);
    useUiStore.getState().setLastWorkspace(LABS);
    useUiStore.getState().setLastStandupGroup(LABS, 'group-1');

    scopeUiStore(BAT);
    expect(useUiStore.getState().lastWorkspaceId).toBeNull();
    useUiStore.getState().setLastWorkspace(STUDIO);

    scopeUiStore(ANU);
    expect(useUiStore.getState().lastWorkspaceId).toBe(LABS);
    expect(useUiStore.getState().lastStandupGroupIds).toEqual({ [LABS]: 'group-1' });
  });

  it('signed out, starts from defaults (nobody’s state shows)', () => {
    scopeUiStore(ANU);
    useUiStore.getState().setLastWorkspace(LABS);
    scopeUiStore(null);
    expect(useUiStore.getState().lastWorkspaceId).toBeNull();
    expect(useUiStore.getState().scopedTo).toBeNull();
  });

  it('gives the pre-account state to the first user who signs in, once', () => {
    useUiStore.getState().setLastWorkspace(STUDIO);
    scopeUiStore(ANU);
    expect(useUiStore.getState().lastWorkspaceId).toBe(STUDIO);
    scopeUiStore(null);
    scopeUiStore(BAT);
    expect(useUiStore.getState().lastWorkspaceId).toBeNull();
  });
});
