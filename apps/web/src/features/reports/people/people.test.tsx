import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { useUiStore } from '../../../stores/ui';
import { WORKSPACE_ID } from '../../../test/fixtures';
import { MEMBER_ME, REPORTS_API, renderReports, requested } from '../../../test/renderReports';
import type { BAT } from '../../../test/reports';
import { DORJ, REPORTS_NOW, SARA, personReport } from '../../../test/reports';

const member = (user: typeof DORJ | typeof SARA | typeof BAT, title: string) => ({
  user: { ...user, email: `${user.initials.toLowerCase()}@kite.test` },
  role: 'member',
  title,
  capacityPoints: 15,
  joinedAt: '2026-01-01T00:00:00.000Z',
});
const membersApi = {
  [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () =>
    Response.json([member(DORJ, 'Frontend engineer'), member(SARA, 'Product designer')]),
};

const card = (name: string) => screen.getByRole('group', { name });

describe('Reports · People', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null, createOpen: false, createDefaults: {} });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(REPORTS_NOW);
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a person’s cards with neutral deltas, trends, helping and open tasks', async () => {
    renderReports(`/reports/people/${DORJ.id}`, {
      extra: {
        [`${REPORTS_API}/people/${DORJ.id}`]: () => Response.json(personReport()),
        ...membersApi,
      },
    });
    expect(
      await screen.findByRole('button', { name: 'Choose a person: Dorj E.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Visible to admins only')).toBeInTheDocument();
    expect(
      screen.getByText('Use these as a starting point for 1:1 conversations, not as a score.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sep 11 – Oct 8 · compared with the previous 4 weeks'),
    ).toBeInTheDocument();

    const completed = card('Completed');
    expect(within(completed).getByText('14')).toBeInTheDocument();
    expect(within(completed).getByText('tasks · 38 pts')).toBeInTheDocument();
    expect(within(completed).getByText('previous: 11 · 31 pts')).toBeInTheDocument();
    expect(within(card('On-time')).getByText('79%')).toBeInTheDocument();
    expect(within(card('On-time')).getByText('previous: 85%')).toBeInTheDocument();
    expect(within(card('Median cycle time')).getByText('previous: 3.4 days')).toBeInTheDocument();
    expect(
      within(card('Review turnaround')).getByText('9 reviews as reviewer · previous: 2.1'),
    ).toBeInTheDocument();

    // Neutral: grey chips only, whichever way the number moved.
    for (const name of ['Completed', 'On-time', 'Median cycle time', 'Review turnaround']) {
      const chip = within(card(name)).getByText(/^(Up|Down|No change)$/).parentElement;
      expect(chip).toHaveClass('bg-chip');
      expect(chip?.className).not.toMatch(/success|danger/);
    }
    // Overdue is the one colored card.
    const overdue = card('Overdue now');
    expect(overdue).toHaveClass('bg-danger-card');
    expect(within(overdue).getByText('Oldest is 6 days late')).toBeInTheDocument();

    const trend = screen.getByRole('figure', {
      name: /^Completed per week over the last 12 weeks/,
    });
    expect(trend.getAttribute('aria-label')).toContain('Team median 3.0 a week.');
    expect(within(trend).getByRole('table', { hidden: true })).toBeInTheDocument();

    expect(screen.getByRole('group', { name: 'Mentions answered' })).toHaveTextContent(
      '11 / 12Median reply time 2h',
    );
    expect(screen.getByRole('group', { name: 'Subtasks done on others’ tasks' })).toHaveTextContent(
      'across 4 tasks',
    );
    expect(screen.getByText('8 times')).toBeInTheDocument();

    const open = screen.getByRole('table', { name: 'Current open tasks' });
    const [first] = within(open).getAllByRole('row').slice(1);
    expect(first).toHaveAttribute('href', `/reports/people/${DORJ.id}?task=CHK-1`);
    expect(within(open).getByText('Oct 3 · overdue')).toBeInTheDocument();
    expect(within(open).getByText('No due date')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See workload' })).toHaveAttribute(
      'href',
      '/reports/workload',
    );
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'href',
      `/api/v1/workspaces/${WORKSPACE_ID}/reports/people/${DORJ.id}.csv`,
    );
  });

  it('picks another person from the picker', async () => {
    const { router, fetchMock } = renderReports(`/reports/people/${DORJ.id}?period=week`, {
      extra: {
        [`${REPORTS_API}/people/${DORJ.id}`]: () => Response.json(personReport()),
        [`${REPORTS_API}/people/${SARA.id}`]: () =>
          Response.json(
            personReport({ person: { user: SARA, title: 'Product designer', role: 'member' } }),
          ),
        ...membersApi,
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a person: Dorj E.' }));
    fireEvent.click(await screen.findByRole('option', { name: /^Sara Khan/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/reports/people/${SARA.id}`);
    });
    expect(router.state.location.search).toBe('?period=week');
    expect(
      await screen.findByRole('button', { name: 'Choose a person: Sara Khan' }),
    ).toBeInTheDocument();
    expect(requested(fetchMock, `/reports/people/${SARA.id}?period=week`)).toBe(true);
  });

  it('says so when there are no overdue tasks or reviews', async () => {
    renderReports(`/reports/people/${DORJ.id}`, {
      extra: {
        [`${REPORTS_API}/people/${DORJ.id}`]: () =>
          Response.json(
            personReport({
              overdue: { count: 0, oldestDaysLate: null },
              reviews: {
                current: { medianDays: null, count: 0 },
                previous: { medianDays: 2.1, count: 7 },
              },
            }),
          ),
        ...membersApi,
      },
    });
    const overdue = await screen.findByRole('group', { name: 'Overdue now' });
    expect(overdue).not.toHaveClass('bg-danger-card');
    expect(within(overdue).getByText('No overdue tasks')).toBeInTheDocument();
    const review = card('Review turnaround');
    expect(within(review).getByText('—')).toBeInTheDocument();
    expect(within(review).getByText('No reviews this period')).toBeInTheDocument();
    expect(within(review).queryByText(/^(Up|Down|No change)$/)).toBeNull();
  });
});

describe('Reports · My performance', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null, createOpen: false, createDefaults: {} });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(REPORTS_NOW);
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const mine = personReport({
    helping: {
      comments: { current: 40, previous: 35 },
      subtasks: { count: 2, tasks: 2 },
      mentions: { answered: 19, total: 19, medianReplyHours: 1 },
      workedWith: [{ user: SARA, count: 9 }],
    },
  });

  it.each([
    ['', 'Your last 4 weeks'],
    ['?period=week', 'Your week so far'],
    ['?period=quarter', 'Your quarter so far'],
    ['?period=custom&from=2026-09-01&to=2026-09-30', 'Your chosen period'],
  ])('titles the period %s as “%s”', async (search, title) => {
    renderReports(`/reports/me${search}`, {
      me: MEMBER_ME,
      extra: { [`${REPORTS_API}/people/me`]: () => Response.json(mine) },
    });
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('uses the “you” copy and exports my data', async () => {
    renderReports('/reports/me', {
      me: MEMBER_ME,
      extra: { [`${REPORTS_API}/people/me`]: () => Response.json(mine) },
    });
    expect(await screen.findByText('Visible only to you and workspace admins')).toBeInTheDocument();
    expect(screen.getByText('Dorj E. · Frontend engineer', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Choose a person/ })).toBeNull();
    expect(
      within(card('Overdue now')).getByText('6 days late — set a new date?'),
    ).toBeInTheDocument();
    expect(
      within(card('Your review turnaround')).getByText('9 reviews by you · before: 2.1'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How you helped others' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Mentions answered' })).toHaveTextContent(
      'All answered · median reply 1h',
    );
    expect(screen.getByText('People you worked with most')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your open tasks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to My Tasks' })).toHaveAttribute(
      'href',
      '/my-tasks',
    );
    expect(screen.getByRole('link', { name: 'Export my data' })).toHaveAttribute(
      'href',
      `/api/v1/workspaces/${WORKSPACE_ID}/reports/people/me.csv`,
    );
  });
});
