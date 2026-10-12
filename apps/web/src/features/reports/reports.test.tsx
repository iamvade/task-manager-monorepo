import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT_ID, WORKSPACE_ID } from '../../test/fixtures';
import { MEMBER_ME, REPORTS_API, renderReports, requested } from '../../test/renderReports';
import { REPORTS_NOW, overview } from '../../test/reports';
import { at } from '../../test/tasks';

const OVERVIEW = `${REPORTS_API}/overview`;

describe('Reports', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(REPORTS_NOW);
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects /reports to the Overview with the stat cards', async () => {
    const { router } = renderReports('/reports');
    const completed = await screen.findByRole('group', { name: 'Completed' });
    expect(router.state.location.pathname).toBe('/reports/overview');
    expect(within(completed).getByText('142')).toBeInTheDocument();
    expect(within(completed).getByText('· 386 points')).toBeInTheDocument();
    expect(within(completed).getByText('12%')).toBeInTheDocument();

    // Cycle time fell 0.6 days: an improvement, so the chip is green with a down arrow.
    const cycle = screen.getByRole('group', { name: 'Median cycle time' });
    expect(within(cycle).getByText('3.2')).toBeInTheDocument();
    const chip = within(cycle).getByText('0.6 days').closest('span');
    expect(chip).toHaveClass('bg-success-soft');
    expect(chip).toHaveTextContent('Down');
    expect(within(cycle).getByText('lower is better')).toBeInTheDocument();

    const onTime = screen.getByRole('group', { name: 'On-time delivery' });
    expect(within(onTime).getByText('87%')).toBeInTheDocument();
    expect(within(onTime).getByText('124 of 142')).toBeInTheDocument();
    expect(within(onTime).getByText('4 pts')).toBeInTheDocument();

    const overdue = screen.getByRole('group', { name: 'Overdue' });
    expect(within(overdue).getByText('Oldest is 6 days late')).toBeInTheDocument();

    expect(screen.getByText('Updated 5 minutes ago')).toBeInTheDocument();
    expect(
      screen.getByText('Sep 11 – Oct 8 · compared with the previous 4 weeks (Aug 14 – Sep 10)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tasks wait longest in review — 4.6 days on median, about twice as long/),
    ).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /Tasks completed per week/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
  });

  it('flags stale aging tasks, opens a row in the drawer and expands with View all', async () => {
    const { fetchMock, router } = renderReports('/reports/overview');
    const table = await screen.findByRole('table', { name: 'Aging tasks' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(within(at(rows, 0)).getByText('Stale')).toBeInTheDocument();
    expect(within(at(rows, 0)).getByText('9 days')).toBeInTheDocument();
    expect(within(at(rows, 3)).queryByText('Stale')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View all' }));
    await waitFor(() => {
      expect(requested(fetchMock, 'agingLimit=all')).toBe(true);
    });
    expect(router.state.location.search).toBe('?aging=all');
    await waitFor(() => {
      expect(within(table).getAllByRole('row')).toHaveLength(9);
    });
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();

    fireEvent.click(at(within(table).getAllByRole('row'), 1));
    expect(new URLSearchParams(router.state.location.search).get('task')).toBe('APP-100');
  });

  it('keeps the period in the URL and in the request', async () => {
    const { fetchMock, router } = renderReports('/reports/overview');
    await screen.findByRole('group', { name: 'Completed' });
    fireEvent.click(screen.getByRole('radio', { name: 'This quarter' }));
    expect(router.state.location.search).toBe('?period=quarter');
    await waitFor(() => {
      expect(requested(fetchMock, '/reports/overview?period=quarter')).toBe(true);
    });
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'href',
      `/api/v1/workspaces/${WORKSPACE_ID}/reports/overview.csv?period=quarter`,
    );
    // Tabs carry the filters.
    expect(screen.getByRole('tab', { name: 'Sprints' })).toHaveAttribute(
      'href',
      '/reports/sprints?period=quarter',
    );
  });

  it('shows the loading skeleton until the report arrives', async () => {
    let resolve: (r: Response) => void = () => undefined;
    renderReports('/reports/overview', {
      extra: { [OVERVIEW]: () => new Promise<Response>((r) => (resolve = r)) },
    });
    await waitFor(() => {
      expect(
        screen.getAllByRole('status').some((el) => el.textContent === 'Loading reports…'),
      ).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Last 4 weeks' })).toBeDisabled();
    resolve(Response.json(overview()));
    expect(await screen.findByRole('group', { name: 'Completed' })).toBeInTheDocument();
  });

  it('shows "1 / 5" for a project without enough history', async () => {
    renderReports(`/reports/overview?project=${PROJECT_ID}`, {
      extra: {
        [`${OVERVIEW}?projectId=${PROJECT_ID}`]: () =>
          Response.json(
            overview({
              history: { completed: 1, required: 5 },
              scope: { workspaceId: WORKSPACE_ID, spaceId: null, projectId: PROJECT_ID },
            }),
          ),
      },
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Reports appear after your team completes a few tasks',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/App Redesign is new/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Toward your first report' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    expect(screen.getByText('1 task completed so far · 4 more to go')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to project' })).toHaveAttribute(
      'href',
      `/p/${PROJECT_ID}/list`,
    );
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });

  it('renders Mongolian copy from the design', async () => {
    await i18n.changeLanguage('mn');
    renderReports('/reports/overview', { me: ME });
    const onTime = await screen.findByRole('group', { name: 'Хугацаандаа дууссан' });
    expect(within(onTime).getByText('142-оос 124')).toBeInTheDocument();
    expect(screen.getByText('5 минутын өмнө шинэчлэгдсэн')).toBeInTheDocument();
    expect(
      screen.getByText('Одоогийн төлөвтөө 5-аас дээш хоног байгаа ажлыг тэмдэглэв'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Хянагдаж буй ажлууд дунджаар 4.6 хоног хүлээж байна — бусад төлвөөс 2 дахин урт.',
      ),
    ).toBeInTheDocument();
  });

  it('sends members from People to My performance, and admins the other way', async () => {
    const member = renderReports('/reports/people', { me: MEMBER_ME });
    await waitFor(() => {
      expect(member.router.state.location.pathname).toBe('/reports/me');
    });
    expect(await screen.findByRole('tab', { name: 'My performance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workload' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'People' })).toBeNull();
  });

  it('sends owners from My performance to People', async () => {
    const owner = renderReports('/reports/me');
    await waitFor(() => {
      expect(owner.router.state.location.pathname).toBe('/reports/people');
    });
    expect(await screen.findByRole('tab', { name: 'People' })).toBeInTheDocument();
  });
});
