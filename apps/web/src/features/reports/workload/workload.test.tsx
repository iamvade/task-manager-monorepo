import type { UserRef } from '@kite/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { useUiStore } from '../../../stores/ui';
import { ME, WORKSPACE_ID } from '../../../test/fixtures';
import { MEMBER_ME, REPORTS_API, renderReports } from '../../../test/renderReports';
import { BAT, DORJ, REPORTS_NOW, SARA, workloadReport } from '../../../test/reports';

const WORKLOAD = `${REPORTS_API}/workload`;
const XL_TASK = '01890000-0000-7000-8000-000000000903';
const member = (user: UserRef, title: string) => ({
  user: { ...user, email: `${user.initials.toLowerCase()}@kite.test` },
  role: 'member',
  title,
  capacityPoints: 15,
  joinedAt: '2026-01-01T00:00:00.000Z',
  awayUntil: null,
  awayNote: null,
  deactivatedAt: null,
});
const MEMBERS = [
  member(DORJ, 'Frontend engineer'),
  member(SARA, 'Product designer'),
  member(BAT, 'Engineering lead'),
];
const membersApi = {
  [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () => Response.json(MEMBERS),
};

const rowNamed = (name: RegExp) => screen.getByRole('button', { name });

describe('Reports · Workload', () => {
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

  it('lists people by open size with buckets, capacity and the load pill', async () => {
    renderReports('/reports/workload', {
      extra: { [WORKLOAD]: () => Response.json(workloadReport()), ...membersApi },
    });
    const table = await screen.findByRole('region', { name: 'Team workload' });
    const rows = within(table).getAllByRole('button', { expanded: false });
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Dorj E., 3 tasks, 16 pts, Heavy',
      'Sara K., 2 tasks, 10 pts, Balanced',
      'Bat O., 1 task, 1 pt, Light',
    ]);
    expect(
      screen.getByText(
        '3 people · 6 open tasks · 27 points in total · 9.0 points per person on average. The dashed line marks capacity for the next 2 weeks (15 points).',
      ),
    ).toBeInTheDocument();
    expect(within(table).getByText('8 pts overdue')).toBeInTheDocument();
    expect(within(table).getByText('Frontend engineer')).toBeInTheDocument();
    expect(within(table).getByTitle('Overdue: 8 pts (2 tasks)')).toBeInTheDocument();
    expect(
      within(table).getAllByTitle('Capacity for the next 2 weeks ≈ 15 points'),
    ).not.toHaveLength(0);
    expect(
      screen.getByText(/it is there to help share work fairly, not to rate anyone/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'href',
      `/api/v1/workspaces/${WORKSPACE_ID}/reports/workload.csv`,
    );
    // No ranks.
    expect(within(table).queryByText('#1')).toBeNull();
  });

  it('sorts by overdue through the URL', async () => {
    const report = workloadReport();
    // Sara gets more points than Dorj but nothing overdue.
    const sara = report.people[0];
    if (sara) sara.points = 30;
    const { router } = renderReports('/reports/workload', {
      extra: { [WORKLOAD]: () => Response.json(report), ...membersApi },
    });
    await screen.findByRole('region', { name: 'Team workload' });
    expect(rowNamed(/^Sara K\./).compareDocumentPosition(rowNamed(/^Dorj E\./))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Overdue' }));
    expect(router.state.location.search).toBe('?sort=overdue');
    expect(rowNamed(/^Dorj E\./).compareDocumentPosition(rowNamed(/^Sara K\./))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('expands a person, opens a task and rebalances it with the assignee picker', async () => {
    let finish: (r: Response) => void = () => undefined;
    const put = vi.fn(() => new Promise<Response>((r) => (finish = r)));
    const { fetchMock, router } = renderReports('/reports/workload', {
      extra: {
        [WORKLOAD]: () => Response.json(workloadReport()),
        ...membersApi,
        [`PUT /api/v1/tasks/${XL_TASK}/assignees`]: put,
      },
    });
    await screen.findByRole('region', { name: 'Team workload' });
    fireEvent.click(rowNamed(/^Dorj E\./));
    expect(rowNamed(/^Dorj E\./)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1 pt over capacity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /APP-303/ })).toHaveTextContent(
      'Workload task 3 · High',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reassign APP-303' }));
    fireEvent.click(await screen.findByRole('option', { name: /Bat O\./ }));
    // Bat's bar grows at once, before the server answers.
    await waitFor(() => {
      expect(rowNamed(/^Bat O\./)).toHaveAttribute(
        'aria-label',
        'Bat O., 2 tasks, 9 pts, Balanced',
      );
    });
    expect(put).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls.find(
      ([u]) => typeof u === 'string' && u.includes('/assignees'),
    );
    const body = (call?.[1]?.body ?? '') as string;
    expect(JSON.parse(body)).toEqual({ userIds: [DORJ.id, BAT.id] });
    finish(new Response(null, { status: 500 }));
    // The write failed: everything rolls back.
    await waitFor(() => {
      expect(rowNamed(/^Bat O\./)).toHaveAttribute('aria-label', 'Bat O., 1 task, 1 pt, Light');
    });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('link', { name: /APP-303/ }));
    expect(new URLSearchParams(router.state.location.search).get('task')).toBe('APP-303');
  });

  it('"Assign work" opens quick create for that person', async () => {
    renderReports('/reports/workload', {
      extra: { [WORKLOAD]: () => Response.json(workloadReport()), ...membersApi },
    });
    await screen.findByRole('region', { name: 'Team workload' });
    fireEvent.click(rowNamed(/^Bat O\./));
    fireEvent.click(screen.getByRole('button', { name: 'Assign work' }));
    expect(useUiStore.getState().createOpen).toBe(true);
    expect(useUiStore.getState().createDefaults).toEqual({ assigneeId: BAT.id });
  });

  it('is open to members too, in Mongolian', async () => {
    await i18n.changeLanguage('mn');
    renderReports('/reports/workload', {
      me: { ...MEMBER_ME, preferences: ME.preferences },
      extra: { [WORKLOAD]: () => Response.json(workloadReport()), ...membersApi },
    });
    expect(await screen.findByRole('heading', { name: 'Багийн ачаалал' })).toBeInTheDocument();
    expect(screen.getByText('8 оноо хэтэрсэн')).toBeInTheDocument();
    expect(screen.getByText('Ачаалал их')).toBeInTheDocument();
    expect(
      screen.getByText(
        /^3 гишүүн · 6 нээлттэй ажил · нийт 27 оноо · нэг хүнд дунджаар 9\.0 оноо\./,
      ),
    ).toBeInTheDocument();
  });
});
