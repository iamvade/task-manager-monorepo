import type { FeedbackListResponse } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../../auth/AuthProvider';
import i18n from '../../../i18n';
import { createQueryClient } from '../../../queryClient';
import { routes } from '../../../router';
import { useToastStore } from '../../../stores/toast';
import { useUiStore } from '../../../stores/ui';
import { FREEZE, LINKED, QPAY, TASK_REF, detailOf, listOf } from '../../../test/feedback';
import { ME, SIDEBAR, WORKSPACE_ID, mockApi } from '../../../test/fixtures';
import { HOME, HOME_NOW } from '../../../test/home';
import { at } from '../../../test/tasks';

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const LIST = `/api/v1/workspaces/${WORKSPACE_ID}/feedback`;
type Handler = (init?: RequestInit) => Response | Promise<Response>;

function renderFeedback(
  extra: Record<string, Handler> = {},
  list: (url: string) => FeedbackListResponse = () => listOf([FREEZE, QPAY, LINKED]),
  entry = '/feedback',
) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () =>
      Response.json({ ...SIDEBAR, feedbackUnreadCount: 1 }),
    'GET /api/v1/me/home': () => Response.json(HOME),
    ...extra,
  });
  // List requests carry a query string: answer them by path, with the URL at hand.
  const base = fetchMock.getMockImplementation();
  fetchMock.mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if ((init?.method ?? 'GET') === 'GET' && url.startsWith(`${LIST}?`)) {
      return Promise.resolve(Response.json(list(url)));
    }
    if (!base) throw new Error('no mock');
    return base(input, init);
  });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { fetchMock, router };
}

const urls = (fetchMock: ReturnType<typeof mockApi>, method = 'GET') =>
  fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? 'GET') === method)
    .map(([input]) => (typeof input === 'string' ? input : ''));
const bodyOf = (fetchMock: ReturnType<typeof mockApi>, path: string): unknown => {
  const call = fetchMock.mock.calls.find(([input]) => input === path);
  const body = call?.[1]?.body;
  return JSON.parse(typeof body === 'string' ? body : 'null');
};
const rows = () => screen.getAllByRole('row').filter((r) => r.hasAttribute('data-feedback-ref'));

describe('Feedback inbox', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOME_NOW);
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists feedback with type, preview, submitter, linked task and unread marks', async () => {
    renderFeedback();
    await screen.findByRole('table', { name: 'Feedback' });
    const freeze = at(rows(), 0);
    const linked = at(rows(), 2);
    expect(freeze).toHaveTextContent('Bug');
    expect(freeze).toHaveTextContent('App freezes on the payment step');
    expect(freeze).toHaveTextContent('iPhone 13, iOS 17.');
    expect(freeze).toHaveTextContent('Enkhjin D.');
    expect(within(freeze).getByRole('img', { name: 'Has attachment' })).toBeVisible();
    expect(within(freeze).getByRole('img', { name: 'Unread' })).toBeVisible();
    expect(within(linked).getByRole('link', { name: /Checkout page/ })).toHaveAttribute(
      'href',
      `/feedback?task=${TASK_REF.key}`,
    );
    expect(screen.getByText('3 items · 1 unread')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Bug/ })).toHaveAttribute('href', '/feedback?type=bug');
    expect(screen.getByLabelText('1 new')).toBeInTheDocument();
  });

  it('filters by status chips and search through the URL', async () => {
    const { fetchMock, router } = renderFeedback();
    await screen.findByRole('table', { name: 'Feedback' });
    fireEvent.click(screen.getByRole('button', { name: /In review/, pressed: false }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?status=review');
    });
    await waitFor(() => {
      expect(urls(fetchMock).some((u) => u.includes('status=review'))).toBe(true);
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search feedback or submitters…' }), {
      target: { value: 'qpay' },
    });
    await waitFor(() => {
      expect(router.state.location.search).toBe('?status=review&q=qpay');
    });
    await waitFor(() => {
      expect(urls(fetchMock).some((u) => u.includes('q=qpay'))).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?q=qpay');
    });
  });

  it('changes the status of selected rows', async () => {
    const { fetchMock } = renderFeedback({
      [`POST ${LIST}/batch`]: () => Response.json({ changed: 2 }),
    });
    await screen.findByRole('table', { name: 'Feedback' });
    fireEvent.click(screen.getByRole('checkbox', { name: `Select: ${FREEZE.title}` }));
    fireEvent.click(screen.getByRole('checkbox', { name: `Select: ${QPAY.title}` }));
    const bar = screen.getByRole('toolbar', { name: 'Actions for selected rows' });
    expect(bar).toHaveTextContent('2 selected');
    fireEvent.click(within(bar).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(bodyOf(fetchMock, `${LIST}/batch`)).toEqual({
        ids: [FREEZE.id, QPAY.id],
        change: { action: 'status', status: 'closed' },
      });
    });
    expect(await screen.findByText('2 items set to Closed')).toBeInTheDocument();
  });

  it('opens an item in the panel and marks it read', async () => {
    const { fetchMock } = renderFeedback({
      [`GET ${LIST}/${FREEZE.ref}`]: () => Response.json(detailOf(FREEZE)),
      [`POST /api/v1/feedback/${FREEZE.id}/read`]: () => new Response(null, { status: 204 }),
    });
    await screen.findByRole('table', { name: 'Feedback' });
    fireEvent.click(screen.getByRole('link', { name: FREEZE.title }));
    const panel = await screen.findByRole('dialog', { name: `Feedback ${FREEZE.ref}` });
    expect(
      await within(panel).findByRole('heading', { name: FREEZE.title, level: 1 }),
    ).toBeInTheDocument();
    expect(panel).toHaveTextContent('iPhone · iOS 17.4 · Safari 17.4');
    expect(within(panel).getByRole('link', { name: 'Reply by email' })).toHaveAttribute(
      'href',
      expect.stringContaining(`mailto:${FREEZE.email}?subject=`) as string,
    );
    expect(within(panel).getByRole('button', { name: /Assignee/ })).toBeDisabled();
    await waitFor(() => {
      expect(urls(fetchMock, 'POST')).toContain(`/api/v1/feedback/${FREEZE.id}/read`);
    });
  });

  it('links an item to a suggested task', async () => {
    const linked = detailOf(FREEZE, { status: 'linked', task: TASK_REF, isRead: true });
    let current = detailOf(FREEZE, { isRead: true });
    const { fetchMock } = renderFeedback(
      {
        [`GET ${LIST}/${FREEZE.ref}`]: () => Response.json(current),
        [`GET /api/v1/feedback/${FREEZE.id}/task-suggestions`]: () =>
          Response.json({ tasks: [TASK_REF] }),
        [`PUT /api/v1/feedback/${FREEZE.id}/link`]: () => {
          current = linked;
          return Response.json(linked);
        },
      },
      undefined,
      `/feedback?item=${FREEZE.ref}`,
    );
    const panel = await screen.findByRole('dialog', { name: `Feedback ${FREEZE.ref}` });
    fireEvent.click(await within(panel).findByRole('button', { name: 'Link to existing task' }));
    fireEvent.click(await within(panel).findByRole('option', { name: /Checkout page/ }));
    await waitFor(() => {
      expect(bodyOf(fetchMock, `/api/v1/feedback/${FREEZE.id}/link`)).toEqual({
        taskId: TASK_REF.id,
      });
    });
    expect(await within(panel).findByRole('button', { name: 'Unlink' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('APP-142 · App Redesign');
  });

  it('shows the empty state with the public link', async () => {
    renderFeedback({}, () =>
      listOf([], {
        typeCounts: { all: 0, bug: 0, feature: 0, feedback: 0, other: 0 },
        statusCounts: { new: 0, review: 0, linked: 0, closed: 0 },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'No feedback yet' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Public submission page' })).toHaveValue(
      `${window.location.origin}/feedback/kite-studio`,
    );
  });
});
