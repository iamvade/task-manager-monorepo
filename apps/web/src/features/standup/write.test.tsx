import type { StandupEntry } from '@kite/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import {
  BLOCKER,
  MOBILE_ID,
  ME_REF,
  SARA_ENTRY,
  SUGGESTIONS,
  TAB_BAR,
  dayOf,
  renderAt,
} from '../../test/standup';
import { AUTOSAVE_MS } from './write/useWriteForm';

const DAY = `GET /api/v1/standup-groups/${MOBILE_ID}/days/today`;
const SUGGEST = `GET /api/v1/standup-groups/${MOBILE_ID}/suggestions`;
const PUT = `PUT /api/v1/standup-groups/${MOBILE_ID}/days/2026-10-08/entry`;

interface Body {
  status: string;
  today: { text: string }[];
  blockers: { id?: string; text: string }[];
}

/** My entry as the server would answer a save of `body`. */
function answer(body: Body, blockerIds: string[] = []): StandupEntry {
  return {
    ...SARA_ENTRY,
    id: '01890000-0000-7000-8000-000000000d09',
    user: ME_REF,
    status: body.status === 'posted' ? 'posted' : 'draft',
    today: body.today.map((i) => ({ kind: 'text', text: i.text, task: null })),
    blockers: body.blockers.map((b, i) => ({
      ...BLOCKER,
      id: b.id ?? blockerIds[i] ?? BLOCKER.id,
      text: b.text,
      author: ME_REF,
    })),
  };
}

function renderWrite(myEntry: StandupEntry | null, onSave: (body: Body) => StandupEntry) {
  const saved: Body[] = [];
  const day = dayOf({ myEntry });
  const view = renderAt(`/w/kite-studio/standup/${MOBILE_ID}?write=1`, {
    extra: {
      [DAY]: () => Response.json(day),
      [SUGGEST]: () => Response.json(SUGGESTIONS),
      [PUT]: (init) => {
        const body = JSON.parse(init?.body as string) as Body;
        saved.push(body);
        return Response.json(onSave(body));
      },
    },
  });
  return { ...view, saved };
}

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('Write update: drafts', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null, lastStandupGroupIds: {} });
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('autosaves a draft a few seconds after a change, never just for opening', async () => {
    const { saved } = renderWrite(null, (body) =>
      answer(body, ['01890000-0000-7000-8000-000000000c09']),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Your standup' });
    await within(dialog).findByText('Completed');
    await tick(AUTOSAVE_MS * 2);
    expect(saved).toHaveLength(0);

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Blocker 1' }), {
      target: { value: 'Waiting on legal' },
    });
    await tick(AUTOSAVE_MS + 100);
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]?.status).toBe('draft');
    expect(saved[0]?.blockers).toEqual([{ text: 'Waiting on legal', taskId: null, helperIds: [] }]);
    expect(await within(dialog).findByText(/^Draft saved/)).toBeVisible();
    // Still open: autosave is quiet.
    expect(screen.getByRole('dialog', { name: 'Your standup' })).toBeVisible();

    // The next save updates the same blocker (the id from the first answer).
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Blocker 1' }), {
      target: { value: 'Waiting on legal sign-off' },
    });
    await tick(AUTOSAVE_MS + 100);
    await waitFor(() => {
      expect(saved).toHaveLength(2);
    });
    expect(saved[1]?.blockers).toEqual([
      {
        id: '01890000-0000-7000-8000-000000000c09',
        text: 'Waiting on legal sign-off',
        taskId: null,
        helperIds: [],
      },
    ]);

    // Nothing new: no third save.
    await tick(AUTOSAVE_MS * 2);
    expect(saved).toHaveLength(2);
  });

  it('never autosaves a posted update (Save changes is explicit)', async () => {
    const posted: StandupEntry = { ...answer({ status: 'posted', today: [], blockers: [] }) };
    const { saved } = renderWrite(posted, (body) => answer(body));
    const dialog = await screen.findByRole('dialog', { name: 'Your standup' });
    const field = await within(dialog).findByRole('textbox', { name: 'Anything else today?' });
    fireEvent.change(field, { target: { value: 'Pair with Dorj' } });
    fireEvent.blur(field);
    await tick(AUTOSAVE_MS * 2);
    expect(saved).toHaveLength(0);
    expect(within(dialog).getByRole('button', { name: /Save changes/ })).toBeEnabled();
  });

  it('reopens a draft with the suggestions I removed still restorable', async () => {
    const draft: StandupEntry = {
      ...answer({ status: 'draft', today: [{ text: 'Pair with Dorj' }], blockers: [] }),
      yesterday: [],
    };
    renderWrite(draft, (body) => answer(body));
    const dialog = await screen.findByRole('dialog', { name: 'Your standup' });
    expect(await within(dialog).findByRole('textbox', { name: 'Today item' })).toHaveValue(
      'Pair with Dorj',
    );
    expect(within(dialog).queryByText(TAB_BAR.title)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore 1 removed' }));
    expect(within(dialog).getByText(TAB_BAR.title)).toBeVisible();
  });

  it('uses the full-screen layout on a phone', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === '(max-width: 639px)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    const { saved } = renderWrite(null, (body) => answer(body));
    const dialog = await screen.findByRole('dialog', { name: 'Your standup' });
    expect(within(dialog).getByText('Mobile team · Thu, Oct 8')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible();
    // No Save draft on the phone: it autosaves.
    expect(within(dialog).queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(await within(dialog).findByRole('button', { name: 'Link a task' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Who can help' })).toBeVisible();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Blocker 1' }), {
      target: { value: 'Waiting on legal' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post update' }));
    await waitFor(() => {
      expect(saved.map((b) => b.status)).toEqual(['posted']);
    });
  });
});
