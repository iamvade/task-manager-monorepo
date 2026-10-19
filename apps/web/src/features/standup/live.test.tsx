import type { StandupDay, StandupMeeting, StandupMeetingState } from '@kite/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import {
  BLOCKER,
  DORJ_ENTRY,
  DORJ_REF,
  ME_REF,
  MOBILE,
  MOBILE_ID,
  SARA_ENTRY,
  SARA_REF,
  TAB_BAR,
  dayOf,
  renderAt,
} from '../../test/standup';

const DATE = '2026-10-08';
const BASE = `/api/v1/standup-groups/${MOBILE_ID}/days/${DATE}`;

const speaker = (user: typeof SARA_REF, entryId: string | null, state = 'posted' as const) => ({
  user,
  title: null,
  state,
  postedAt: entryId ? '2026-10-08T01:05:00.000Z' : null,
  entryId,
});

/** Sara spoke 90 s, Dorj is speaking since 10:16:30, then me; started 10:15. */
const meetingOf = (overrides: Partial<StandupMeeting> = {}): StandupMeeting => ({
  id: '01890000-0000-7000-8000-000000000f01',
  groupId: MOBILE_ID,
  date: DATE,
  facilitator: SARA_REF,
  startedAt: '2026-10-08T02:15:00.000Z',
  endedAt: null,
  order: [
    speaker(SARA_REF, SARA_ENTRY.id),
    speaker(DORJ_REF, DORJ_ENTRY.id),
    { ...speaker(ME_REF, null), state: 'not_yet' },
  ],
  currentUserId: DORJ_REF.id,
  currentStartedAt: new Date(Date.now() - 30_000).toISOString(),
  durations: { [SARA_REF.id]: 90 },
  totalSeconds: null,
  notes: '• Sara hands off icons by 2pm',
  notesSavedAt: null,
  tasks: [],
  ...overrides,
});

const stateOf = (meeting: StandupMeeting | null, canDrive: boolean): StandupMeetingState => ({
  meeting,
  canDrive,
  serverNow: new Date().toISOString(),
});

const DAY: StandupDay = dayOf({
  date: DATE,
  entries: [SARA_ENTRY, DORJ_ENTRY],
  group: { ...MOBILE, facilitatorId: SARA_REF.id },
});

function renderLive(state: StandupMeetingState, extra: Parameters<typeof renderAt>[1] = {}) {
  return renderAt(`/standup/${MOBILE_ID}/${DATE}/live`, {
    ...extra,
    extra: {
      [`GET ${BASE}`]: () => Response.json(DAY),
      [`GET ${BASE}/meeting`]: () => Response.json(state),
      ...extra.extra,
    },
  });
}

describe('Standup live meeting', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null, createOpen: false, createDefaults: {} });
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });

  it('shows the current person large, the order with done / current / upcoming, and the timer', async () => {
    renderLive(stateOf(meetingOf(), true));
    expect(await screen.findByRole('heading', { level: 1, name: DORJ_REF.name })).toBeVisible();
    const order = screen.getByRole('navigation', { name: 'Speaking order' });
    expect(within(order).getByRole('button', { name: `${SARA_REF.name} — done` })).toBeVisible();
    const current = within(order).getByRole('button', { name: `${DORJ_REF.name} — speaking now` });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(within(order).getByRole('button', { name: ME_REF.name })).toBeVisible();
    // Dorj's blocker and Today item, each with Create task.
    expect(screen.getByText(BLOCKER.text)).toBeVisible();
    expect(screen.getByRole('button', { name: `Create task: ${BLOCKER.text}` })).toBeVisible();
    expect(screen.getByRole('timer', { name: `${DORJ_REF.name}’s time` })).toHaveTextContent(
      /^00:3\d/,
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible();
    expect(screen.getByText(`Up next: ${ME_REF.name}`)).toBeVisible();
  });

  it('moves with → / ← and the Next button, optimistically', async () => {
    const sent: string[] = [];
    renderLive(stateOf(meetingOf(), true), {
      extra: {
        [`POST ${BASE}/meeting/advance`]: (init) => {
          const { toUserId } = JSON.parse(init?.body as string) as { toUserId: string };
          sent.push(toUserId);
          return Response.json(
            stateOf(
              meetingOf({ currentUserId: toUserId, currentStartedAt: new Date().toISOString() }),
              true,
            ),
          );
        },
      },
    });
    await screen.findByRole('heading', { level: 1, name: DORJ_REF.name });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { level: 1, name: ME_REF.name })).toBeVisible();
    await waitFor(() => {
      expect(sent).toEqual([ME_REF.id]);
    });
    // The last person: Next reads Finish, → does nothing.
    expect(screen.getByRole('button', { name: 'Finish' })).toBeVisible();
    expect(screen.getByText('Last person')).toBeVisible();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(await screen.findByRole('heading', { level: 1, name: DORJ_REF.name })).toBeVisible();
    await waitFor(() => {
      expect(sent).toEqual([ME_REF.id, DORJ_REF.id]);
    });
  });

  it('skips people out of office and doesn’t let you pick them', async () => {
    const out = { ...speaker(ME_REF, null), state: 'out' as const };
    renderLive(stateOf(meetingOf({ order: [...meetingOf().order.slice(0, 2), out] }), true));
    await screen.findByRole('heading', { level: 1, name: DORJ_REF.name });
    const order = screen.getByRole('navigation', { name: 'Speaking order' });
    expect(
      within(order).getByRole('img', { name: `${ME_REF.name} — out of office` }),
    ).toBeVisible();
    // Dorj is the last one who speaks.
    expect(screen.getByRole('button', { name: 'Finish' })).toBeVisible();
  });

  it('warns gently when someone is over their time', async () => {
    renderLive(
      stateOf(meetingOf({ currentStartedAt: new Date(Date.now() - 150_000).toISOString() }), true),
    );
    const timer = await screen.findByRole('timer', { name: `${DORJ_REF.name}’s time` });
    expect(timer).toHaveClass('text-warning');
    expect(timer).toHaveTextContent('over time');
  });

  it('opens quick create prefilled from a blocker', async () => {
    renderLive(stateOf(meetingOf(), true));
    fireEvent.click(await screen.findByRole('button', { name: `Create task: ${BLOCKER.text}` }));
    const { createOpen, createDefaults } = useUiStore.getState();
    expect(createOpen).toBe(true);
    expect(createDefaults).toMatchObject({
      title: BLOCKER.text.split(' — ')[0],
      assigneeId: DORJ_REF.id,
    });
    expect(JSON.stringify(createDefaults.description)).toContain(`/standup/${MOBILE_ID}`);
    expect(createDefaults.onCreated).toBeTypeOf('function');
  });

  it('shows Created once a task exists for the item, and lists it under Tasks created', async () => {
    const task = {
      task: { ...TAB_BAR, title: 'Renew sandbox keys' },
      assignee: DORJ_REF,
      source: {
        user: DORJ_REF,
        kind: 'blocker' as const,
        entryId: DORJ_ENTRY.id,
        blockerId: BLOCKER.id,
        itemIndex: null,
      },
      createdAt: '2026-10-08T02:17:00.000Z',
    };
    renderLive(stateOf(meetingOf({ tasks: [task] }), true));
    const aside = await screen.findByRole('complementary', { name: 'Meeting notes' });
    expect(within(aside).getByText('Renew sandbox keys')).toBeVisible();
    expect(within(aside).getByText(/From Dorj’s blocker/)).toBeVisible();
    expect(screen.getByText('Created')).toBeVisible();
    expect(screen.queryByRole('button', { name: `Create task: ${BLOCKER.text}` })).toBeNull();
  });

  it('follows read-only when someone else drives', async () => {
    renderLive(stateOf(meetingOf(), false));
    await screen.findByRole('heading', { level: 1, name: DORJ_REF.name });
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Create task/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Meeting notes' })).toBeNull();
    expect(screen.getByText('• Sara hands off icons by 2pm')).toBeVisible();
    expect(
      screen.getByText(`${SARA_REF.name} runs the meeting. This page moves with them.`),
    ).toBeVisible();
    // Keys do nothing for followers.
    act(() => {
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    });
    expect(screen.getByRole('heading', { level: 1, name: DORJ_REF.name })).toBeVisible();
  });

  it('offers Start to the driver before the meeting and explains to followers', async () => {
    renderLive(stateOf(null, false));
    expect(await screen.findByText('The meeting hasn’t started yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start standup' })).toBeNull();
    expect(screen.getByText(/once Sara K\. starts it/)).toBeVisible();
  });
});
