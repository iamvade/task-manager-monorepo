import type { StandupDay } from '@kite/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import {
  BLOCKER,
  DORJ_ENTRY,
  MOBILE,
  MOBILE_ID,
  SARA_ENTRY,
  SARA_REF,
  ME_REF,
  SUGGESTIONS,
  TAB_BAR,
  dayOf,
  renderAt,
} from '../../test/standup';

const SPRINT_NOTES_ID = '01890000-0000-7000-8000-000000000b02';

const DAY = `GET /api/v1/standup-groups/${MOBILE_ID}/days/today`;
const SUGGEST = `GET /api/v1/standup-groups/${MOBILE_ID}/suggestions`;

function renderDay(entry: string, day: StandupDay, extra: Parameters<typeof renderAt>[1] = {}) {
  return renderAt(entry, {
    ...extra,
    extra: {
      [DAY]: () => Response.json(day),
      [`GET /api/v1/standup-groups/${MOBILE_ID}/days/${day.date}`]: () => Response.json(day),
      [SUGGEST]: () => Response.json(SUGGESTIONS),
      ...extra.extra,
    },
  });
}

describe('Standup group page', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null, lastStandupGroupId: null });
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });

  it('shows who has posted (late marked), the due / meeting line and Your turn', async () => {
    renderDay(`/standup/${MOBILE_ID}`, dayOf());
    const strip = await screen.findByRole('region', { name: 'Who has posted' });
    expect(within(strip).getByText('2 of 3 have posted')).toBeVisible();
    expect(within(strip).getByText('Due by 10:00 · meeting at 10:15')).toBeVisible();
    expect(within(strip).getByLabelText('Sara K. · Posted 09:05')).toBeVisible();
    expect(within(strip).getByLabelText('Dorj E. · Posted 10:08, after 10:00')).toBeVisible();
    expect(within(strip).getByLabelText('You · Not yet')).toBeVisible();
    expect(within(strip).getByRole('link', { name: 'Your turn' })).toHaveAttribute(
      'href',
      `/standup/${MOBILE_ID}?write=1`,
    );
    expect(screen.getByRole('heading', { name: 'Thursday, Oct 8' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
      'href',
      `/standup/${MOBILE_ID}/2026-10-07`,
    );
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start standup' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // My placeholder card with the suggestions hint.
    expect(
      await screen.findByText('Suggestions from your activity yesterday are ready'),
    ).toBeVisible();
  });

  it('lists blockers with the task, who can help, and resolves optimistically', async () => {
    let resolved = false;
    const done = { ...BLOCKER, resolvedAt: '2026-10-08T03:00:00.000Z', resolvedBy: ME_REF };
    renderDay(`/standup/${MOBILE_ID}`, dayOf(), {
      extra: {
        [DAY]: () => Response.json(resolved ? dayOf({ blockers: [done] }) : dayOf()),
        [`POST /api/v1/standup-blockers/${BLOCKER.id}/resolve`]: () => {
          resolved = true;
          return Response.json(done);
        },
      },
    });
    const section = await screen.findByRole('region', { name: 'Blockers' });
    expect(within(section).getByText('Waiting on final tab icons')).toBeVisible();
    expect(
      within(section).getByRole('link', { name: /Implement new bottom tab bar/ }),
    ).toHaveAttribute('href', `/standup/${MOBILE_ID}?task=APP-140`);
    expect(within(section).getByText('@Sara K.')).toBeVisible();
    const box = within(section).getByRole('checkbox', {
      name: 'Mark resolved: Waiting on final tab icons',
    });
    fireEvent.click(box);
    await waitFor(() => {
      expect(box).toBeChecked();
    });
    expect(await within(section).findByText('Resolved')).toBeVisible();
    expect(resolved).toBe(true);
  });

  it('renders each update with its sections, reactions and who reacted', async () => {
    let put = '';
    renderDay(`/standup/${MOBILE_ID}`, dayOf(), {
      extra: {
        [`PUT /api/v1/standup-entries/${SARA_ENTRY.id}/reactions/thumbs_up`]: () => {
          put = 'thumbs_up';
          return Response.json([
            {
              emoji: 'thumbs_up',
              count: 3,
              mine: true,
              users: [DORJ_ENTRY.user, SARA_REF, ME_REF],
            },
            ...SARA_ENTRY.reactions.slice(1),
          ]);
        },
      },
    });
    const card = await screen.findByRole('article', { name: 'Sara K.' });
    expect(within(card).getByText('Product designer')).toBeVisible();
    expect(within(card).getByText('· posted 09:05')).toBeVisible();
    // A suggestion's text equals the title: only the chip shows.
    expect(within(card).getByRole('link', { name: /Implement new bottom tab bar/ })).toBeVisible();
    expect(within(card).getByText('Hand off the icons')).toBeVisible();
    expect(within(card).getByText('No blockers')).toBeVisible();
    const thumbs = within(card).getByRole('button', { name: 'Thumbs up, 2' });
    expect(thumbs).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(thumbs);
    expect(await within(card).findByRole('button', { name: 'Thumbs up, 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(put).toBe('thumbs_up');

    const dorj = screen.getByRole('article', { name: 'Dorj E.' });
    expect(within(dorj).getByText('· late')).toBeVisible();
    expect(within(dorj).getByText('· @Sara K.')).toBeVisible();
  });

  it('sends a reply with a picked @mention', async () => {
    const bodies: unknown[] = [];
    renderDay(`/standup/${MOBILE_ID}`, dayOf(), {
      extra: {
        [`POST /api/v1/standup-entries/${DORJ_ENTRY.id}/replies`]: (init) => {
          const body = JSON.parse(init?.body as string) as { body: string };
          bodies.push(body);
          return Response.json(
            {
              id: '01890000-0000-7000-8000-000000000e01',
              entryId: DORJ_ENTRY.id,
              blockerId: null,
              author: ME_REF,
              body: body.body,
              mentions: [SARA_REF],
              createdAt: '2026-10-08T03:00:00.000Z',
              editedAt: null,
            },
            { status: 201 },
          );
        },
      },
    });
    const card = await screen.findByRole('article', { name: 'Dorj E.' });
    const field = within(card).getByRole('combobox', { name: 'Reply' });
    expect(field).toHaveAttribute('placeholder', 'Reply to Dorj…');
    fireEvent.change(field, { target: { value: 'Ask @Sa', selectionStart: 7 } });
    fireEvent.click(await screen.findByRole('option', { name: /Sara K\./ }));
    expect(field).toHaveValue('Ask @Sara K. ');
    fireEvent.change(field, { target: { value: 'Ask @Sara K. today' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(await within(card).findByText('Ask @Sara K. today')).toBeVisible();
    expect(bodies).toEqual([{ body: 'Ask @Sara K. today', mentionIds: [SARA_REF.id] }]);
    expect(field).toHaveValue('');
  });

  it('keeps a past day read-only except replies', async () => {
    const past = dayOf({
      date: '2026-10-07',
      prevDate: '2026-10-06',
      nextDate: '2026-10-08',
      editable: false,
    });
    renderDay(`/standup/${MOBILE_ID}/2026-10-07`, past);
    const card = await screen.findByRole('article', { name: 'Sara K.' });
    expect(within(card).queryByRole('button', { name: 'Add reaction' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Thumbs up, 2' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(card).getByRole('combobox', { name: 'Reply' })).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'Mark resolved: Waiting on final tab icons' }),
    ).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Your turn' })).toBeNull();
    expect(screen.queryByText('You haven’t posted yet')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Write update' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Updates' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Next day' })).toHaveAttribute(
      'href',
      `/standup/${MOBILE_ID}`,
    );
    expect(screen.getByLabelText('You · No update')).toBeVisible();
  });

  it('shows only the header and a note to people outside the group', async () => {
    const outside = { ...MOBILE, isMember: false };
    const { fetchMock } = renderAt(`/standup/${MOBILE_ID}`, { groups: [outside] });
    expect(
      await screen.findByText('Only members of this group can read its updates.'),
    ).toBeVisible();
    const days = fetchMock.mock.calls.filter(([url]) =>
      (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes('/days/'),
    );
    expect(days).toEqual([]);
  });

  it('opens the latest standup day when today has none', async () => {
    const weekend = dayOf({
      date: '2026-10-10',
      today: '2026-10-10',
      isStandupDay: false,
      prevDate: '2026-10-09',
      upcomingDate: '2026-10-12',
      group: { ...MOBILE, meetsToday: false, today: '2026-10-10' },
    });
    const friday = dayOf({
      date: '2026-10-09',
      today: '2026-10-10',
      prevDate: '2026-10-08',
      nextDate: null,
      upcomingDate: '2026-10-12',
      editable: false,
      group: weekend.group,
    });
    const { router } = renderAt(`/standup/${MOBILE_ID}`, {
      groups: [weekend.group],
      extra: {
        [DAY]: () => Response.json(weekend),
        [`GET /api/v1/standup-groups/${MOBILE_ID}/days/2026-10-09`]: () => Response.json(friday),
      },
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/standup/${MOBILE_ID}/2026-10-09`);
    });
    expect(await screen.findByText('No standup today · next standup Mon, Oct 12')).toBeVisible();
  });

  it('posts from the write modal: suggestions, a Today chip and a blocker', async () => {
    const saved: unknown[] = [];
    const { router } = renderDay(`/standup/${MOBILE_ID}?write=1`, dayOf(), {
      extra: {
        [`PUT /api/v1/standup-groups/${MOBILE_ID}/days/2026-10-08/entry`]: (init) => {
          saved.push(JSON.parse(init?.body as string));
          return Response.json({
            ...SARA_ENTRY,
            id: '01890000-0000-7000-8000-000000000d09',
            user: ME_REF,
          });
        },
      },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Your standup' });
    expect(within(dialog).getByText('Mobile team · Thu, Oct 8 · due by 10:00')).toBeVisible();
    expect(await within(dialog).findByText('Completed')).toBeVisible();
    // Remove the suggestion, then restore it.
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remove: Implement new bottom tab bar' }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore 1 removed' }));
    const chip = within(dialog).getByRole('button', { name: /Sprint review notes/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Blocker 1' }), {
      target: { value: 'Waiting on legal' },
    });
    expect(within(dialog).getByText('Visible to the 3 people in Mobile team')).toBeVisible();
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /Post update/ }));
    });
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]).toEqual({
      status: 'posted',
      yesterday: [
        {
          kind: 'completed',
          taskId: TAB_BAR.id,
          text: 'Implement new bottom tab bar',
        },
      ],
      today: [{ kind: 'task', taskId: SPRINT_NOTES_ID, text: 'Sprint review notes' }],
      blockers: [{ text: 'Waiting on legal', taskId: null, helperIds: [] }],
    });
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });

  it('keeps a draft when the write modal closes with Esc', async () => {
    const saved: { status: string }[] = [];
    renderDay(`/standup/${MOBILE_ID}?write=1`, dayOf(), {
      extra: {
        [`PUT /api/v1/standup-groups/${MOBILE_ID}/days/2026-10-08/entry`]: (init) => {
          saved.push(JSON.parse(init?.body as string) as { status: string });
          return Response.json({ ...SARA_ENTRY, status: 'draft', user: ME_REF });
        },
      },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Your standup' });
    const field = await within(dialog).findByRole('textbox', { name: 'Anything else today?' });
    fireEvent.change(field, { target: { value: 'Pair with Dorj' } });
    fireEvent.blur(field);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => {
      expect(saved.map((b) => b.status)).toEqual(['draft']);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
