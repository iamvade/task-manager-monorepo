import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { ME } from '../../test/fixtures';
import {
  DESIGN,
  DESIGN_ID,
  DORJ,
  MOBILE,
  MOBILE_ID,
  SARA,
  group,
  renderAt,
} from '../../test/standup';

describe('Standup', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null, lastStandupGroupId: null });
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });

  it('adds the Standup nav item with a dot and my groups to the sidebar', async () => {
    renderAt('/standup/' + DESIGN_ID);
    const nav = await screen.findByRole('navigation', { name: 'Workspace' });
    const item = await within(nav).findByRole('link', { name: /Standup/ });
    expect(within(item).getByRole('img', { name: 'You haven’t posted today' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Mobile team' })).toHaveAttribute(
      'href',
      `/standup/${MOBILE_ID}`,
    );
    expect(within(nav).getByRole('button', { name: 'New standup group' })).toBeVisible();
  });

  it('hides “New standup group” from members and the dot once posted', async () => {
    renderAt('/standup/' + DESIGN_ID, {
      role: 'member',
      groups: [DESIGN, group({ myPosted: true })],
    });
    const nav = await screen.findByRole('navigation', { name: 'Workspace' });
    await within(nav).findByRole('link', { name: 'Mobile team' });
    expect(within(nav).queryByRole('button', { name: 'New standup group' })).toBeNull();
    expect(within(nav).queryByRole('img', { name: 'You haven’t posted today' })).toBeNull();
  });

  it('opens my last group, else my first', async () => {
    useUiStore.setState({ lastStandupGroupId: MOBILE_ID });
    const { router } = renderAt('/standup');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/standup/${MOBILE_ID}`);
    });
  });

  it('shows the empty state with the schedule in my own time zone', async () => {
    renderAt('/standup/' + DESIGN_ID, { timezone: 'Asia/Seoul' });
    expect(
      await screen.findByRole('heading', { name: 'Start Design team’s first standup' }),
    ).toBeVisible();
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.getByText('2 members')).toBeVisible();
    // 09:30 in Ulaanbaatar is 10:30 in Seoul.
    expect(screen.getByText('Mon–Fri · reminder at 10:30 · Seoul (UTC+9)')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Invite members' })).toHaveAttribute(
      'href',
      `/standup/${DESIGN_ID}/settings#members`,
    );
    expect(screen.getByRole('link', { name: 'Write the first update' })).toHaveAttribute(
      'href',
      `/standup/${DESIGN_ID}?write=1`,
    );
  });

  it('shows "Create a standup group" when there are none', async () => {
    renderAt('/standup', { groups: [] });
    expect(await screen.findByRole('heading', { name: 'Create a standup group' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create a standup group' })).toBeDisabled();
  });

  it('saves only the changed settings in one request', async () => {
    const patches: unknown[] = [];
    const { router } = renderAt(`/standup/${MOBILE_ID}/settings`, {
      extra: {
        [`PATCH /api/v1/standup-groups/${MOBILE_ID}`]: (init) => {
          patches.push(JSON.parse(init?.body as string));
          return Response.json(MOBILE);
        },
      },
    });
    const name = await screen.findByLabelText('Group name');
    fireEvent.change(name, { target: { value: 'Mobile squad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
    fireEvent.change(screen.getByLabelText('Meeting'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('radio', { name: '3 min' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Alphabetical' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Show blockers first/ }));
    // Removing the facilitator clears the role.
    fireEvent.click(screen.getByRole('button', { name: `Remove ${SARA.user.name}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(patches).toEqual([
        {
          name: 'Mobile squad',
          days: [0, 1, 2, 3, 5],
          meetingAt: null,
          secondsPerPerson: 180,
          speakingOrder: 'alphabetical',
          showBlockersFirst: false,
          memberIds: [ME.user.id, DORJ.user.id],
          facilitatorId: null,
        },
      ]);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/standup/${MOBILE_ID}`);
    });
  });

  it('validates the schedule before saving', async () => {
    const { fetchMock } = renderAt(`/standup/${MOBILE_ID}/settings`);
    await screen.findByLabelText('Group name');
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }
    fireEvent.change(screen.getByLabelText('Reminder'), { target: { value: '10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Pick at least one day.')).toBeVisible();
    expect(screen.getByText(/The reminder must be before/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('makes someone facilitator from the row menu', async () => {
    const patches: unknown[] = [];
    renderAt(`/standup/${MOBILE_ID}/settings`, {
      extra: {
        [`PATCH /api/v1/standup-groups/${MOBILE_ID}`]: (init) => {
          patches.push(JSON.parse(init?.body as string));
          return Response.json(MOBILE);
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: `${DORJ.user.name} — actions` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make facilitator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(patches).toEqual([{ facilitatorId: DORJ.user.id }]);
    });
  });

  it('is read-only for members who don’t manage the group', async () => {
    renderAt(`/standup/${MOBILE_ID}/settings`, {
      role: 'member',
      groups: [group({ canEdit: false })],
    });
    expect(await screen.findByLabelText('Group name')).toBeDisabled();
    expect(
      screen.getByText(
        'Only workspace admins and the group’s facilitator can change these settings.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive group' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('archives with Undo', async () => {
    const calls: string[] = [];
    renderAt(`/standup/${MOBILE_ID}/settings`, {
      extra: {
        [`POST /api/v1/standup-groups/${MOBILE_ID}/archive`]: () => {
          calls.push('archive');
          return Response.json({ ...MOBILE, archivedAt: '2026-10-08T03:00:00.000Z' });
        },
        [`POST /api/v1/standup-groups/${MOBILE_ID}/restore`]: () => {
          calls.push('restore');
          return Response.json(MOBILE);
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Archive group' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    await waitFor(() => {
      expect(calls).toEqual(['archive', 'restore']);
    });
  });
});
