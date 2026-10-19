import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { useUiStore } from '../../../stores/ui';
import { ME, PROJECT, PROJECT_ID, SPACE_ID, WORKSPACE_ID } from '../../../test/fixtures';
import { REPORTS_API, renderReports, requested } from '../../../test/renderReports';
import { REPORTS_NOW, SPRINTS, sprintDetail, sprintsReport } from '../../../test/reports';
import { at } from '../../../test/tasks';

const SPRINTS_API = `${REPORTS_API}/sprints`;
const STATUSES = [
  {
    id: '01890000-0000-7000-8000-000000000041',
    name: null,
    category: 'todo',
    color: null,
    position: 'a0',
  },
  {
    id: '01890000-0000-7000-8000-000000000042',
    name: null,
    category: 'review',
    color: null,
    position: 'a1',
  },
  {
    id: '01890000-0000-7000-8000-000000000043',
    name: null,
    category: 'done',
    color: null,
    position: 'a2',
  },
];
const PROJECT_REF_OF = (n: number, key: string, name: string) => ({
  id: `01890000-0000-7000-8000-0000000000${String(20 + n)}`,
  spaceId: SPACE_ID,
  key,
  name,
  color: 'violet' as const,
});
const projectApi = {
  [`GET /api/v1/projects/${PROJECT_ID}`]: () => Response.json({ ...PROJECT, statuses: STATUSES }),
};

describe('Reports · Sprints', () => {
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

  it('shows the current sprint: banner, cards, charts and the carried-over table', async () => {
    const { fetchMock, router } = renderReports('/reports/sprints', {
      extra: {
        [SPRINTS_API]: () => Response.json(sprintsReport({ project: null })),
        ...projectApi,
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'Sprint 14 · Oct 5 – Oct 23' }),
    ).toBeInTheDocument();
    // No scope in the URL: the whole workspace's current sprint.
    expect(requested(fetchMock, '/reports/sprints?')).toBe(false);
    expect(screen.getByText('Day 4 of 15 working days · 11 days left')).toBeInTheDocument();

    const committed = screen.getByRole('group', { name: 'Committed' });
    expect(within(committed).getByText('42')).toBeInTheDocument();
    expect(within(committed).getByText('incl. 7 carried over')).toBeInTheDocument();
    const completed = screen.getByRole('group', { name: 'Completed' });
    expect(within(completed).getByText('24% of scope · slightly behind ideal')).toBeInTheDocument();
    const added = screen.getByRole('group', { name: 'Added mid-sprint' });
    expect(within(added).getByText('+3')).toBeInTheDocument();
    expect(within(added).getByText('Scope +7%')).toBeInTheDocument();
    const carried = screen.getByRole('group', { name: 'Carried over' });
    expect(carried).toHaveClass('bg-warm-card');
    expect(within(carried).getByText('from Sprint 13 · 3 carried 2+ times')).toBeInTheDocument();

    expect(
      screen.getByRole('figure', { name: /Sprint 9: committed 34, added mid-sprint 4/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('in progress', { selector: 'span span' })).toBeInTheDocument();
    expect(
      screen.getByRole('figure', { name: /on day 4, 34 remain versus 31/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('≈ 12')).toBeInTheDocument();
    expect(
      screen.getByText(/about 12 tasks will be left .* unblocking tasks in review\./),
    ).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Carried over from last sprint' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(at(rows, 0)).getByText('Replan')).toBeInTheDocument();
    expect(within(at(rows, 0)).getByText('3 times')).toBeInTheDocument();
    expect(within(at(rows, 2)).getByText('1 time')).toBeInTheDocument();
    expect(
      screen.getByText(
        '3 tasks moved from Sprint 13 into Sprint 14 · flagged when carried 3 or more times',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'href',
      `/api/v1/workspaces/${WORKSPACE_ID}/reports/sprints.csv?sprintId=${SPRINTS[5]?.id ?? ''}`,
    );
    expect(screen.getByRole('button', { name: /Project:/ })).toHaveTextContent('All');

    // Rows open the drawer.
    fireEvent.click(at(rows, 1));
    expect(new URLSearchParams(router.state.location.search).get('task')).toBe('APP-202');
  });

  it('Replan opens the sprint’s open tasks in the List view', async () => {
    const { router } = renderReports('/reports/sprints', {
      extra: { [SPRINTS_API]: () => Response.json(sprintsReport()), ...projectApi },
    });
    const sprint = SPRINTS[5]?.id ?? '';
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('link', { name: 'Replan' })
          .every((a) => a.getAttribute('href')?.includes('status=')),
      ).toBe(true);
    });
    const [button] = screen.getAllByRole('link', { name: 'Replan' });
    expect(button).toHaveAttribute(
      'href',
      `/p/${PROJECT_ID}/list?sprint=${sprint}&status=${STATUSES[0]?.id ?? ''},${STATUSES[1]?.id ?? ''}`,
    );
    expect(router.state.location.pathname).toBe('/reports/sprints');
  });

  it('picking a sprint keeps the scope and pins the sprint in the URL; a past sprint reads differently', async () => {
    const past = SPRINTS[4];
    if (!past) throw new Error('fixture');
    const pastDetail = sprintDetail({
      ...past,
      state: 'past',
      current: false,
      workingDays: { total: 15, elapsed: 15, left: 0 },
      committed: 40,
      carriedIn: 4,
      added: 5,
      completed: 33,
      carriedOut: 7,
      previousSprint: SPRINTS[3] ?? null,
      nextSprint: SPRINTS[5] ?? null,
      projectedRemaining: null,
      pace: null,
      waitingMost: null,
      burndown: sprintDetail().burndown.map((p, i) => ({ ...p, remaining: 45 - i * 2 })),
    });
    const { fetchMock, router } = renderReports('/reports/sprints', {
      extra: {
        [SPRINTS_API]: () => Response.json(sprintsReport()),
        [`${SPRINTS_API}?sprintId=${past.id}`]: () =>
          Response.json(sprintsReport({ sprint: pastDetail })),
        ...projectApi,
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a sprint: Sprint 14' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringMatching(/^Sprint 14.*Current$/),
      expect.stringMatching(/^Sprint 13/),
      expect.stringMatching(/^Sprint 12/),
      expect.stringMatching(/^Sprint 11/),
      expect.stringMatching(/^Sprint 10/),
      expect.stringMatching(/^Sprint 9/),
    ]);
    fireEvent.click(at(options, 1));
    await waitFor(() => {
      expect(requested(fetchMock, `sprintId=${past.id}`)).toBe(true);
    });
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get('project')).toBeNull();
    expect(search.get('sprint')).toBe(past.id);

    expect(await screen.findByText('Completed sprint · 15 working days')).toBeInTheDocument();
    const out = screen.getByRole('group', { name: 'Carried to next sprint' });
    expect(within(out).getByText('7')).toBeInTheDocument();
    expect(within(out).getByText('into Sprint 14')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Committed' })).getByText('at sprint start'));
    expect(screen.getByRole('heading', { name: 'Sprint 13 burndown' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Replan' })).toBeNull();
    expect(screen.queryByText('≈ 12')).toBeNull();
  });

  it('a shared sprint stays picked while narrowing to one of its projects; Replan opens the space', async () => {
    const CHECKOUT = { ...PROJECT_REF_OF(1, 'CHE', 'Checkout v2') };
    const current = SPRINTS[5];
    if (!current) throw new Error('fixture');
    const shared = { ...current, projects: [...current.projects, CHECKOUT] };
    const detail = sprintDetail({ ...shared });
    const { router } = renderReports(`/reports/sprints?sprint=${current.id}`, {
      extra: {
        [`${SPRINTS_API}?sprintId=${current.id}`]: () =>
          Response.json(sprintsReport({ project: null, sprint: detail })),
        [`${SPRINTS_API}?projectId=${CHECKOUT.id}&spaceId=${SPACE_ID}&sprintId=${current.id}`]:
          () =>
            Response.json(
              sprintsReport({ project: CHECKOUT, sprint: sprintDetail({ ...current }) }),
            ),
        [`GET /api/v1/workspaces/${WORKSPACE_ID}/sprints`]: () =>
          Response.json([
            {
              id: current.id,
              number: current.number,
              name: null,
              startDate: current.startDate,
              endDate: current.endDate,
              projectIds: [PROJECT_ID, CHECKOUT.id],
              createdBy: null,
              taskCount: 42,
            },
          ]),
        ...projectApi,
      },
    });
    const [replan] = await screen.findAllByRole('link', { name: 'Replan' });
    expect(replan).toHaveAttribute(
      'href',
      `/s/${SPACE_ID}/list?sprint=${current.id}&status=todo,in_progress,review`,
    );

    fireEvent.click(screen.getByRole('button', { name: /Project:/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Checkout v2/ }));
    await waitFor(() => {
      const search = new URLSearchParams(router.state.location.search);
      expect(search.get('project')).toBe(CHECKOUT.id);
      expect(search.get('sprint')).toBe(current.id);
    });
  });

  it('shows an empty state for a project without sprints', async () => {
    renderReports('/reports/sprints', {
      extra: {
        [SPRINTS_API]: () => Response.json(sprintsReport({ sprints: [], sprint: null })),
        ...projectApi,
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'No sprints in App Redesign yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('renders Mongolian copy from the design', async () => {
    await i18n.changeLanguage('mn');
    renderReports('/reports/sprints', {
      me: ME,
      extra: { [SPRINTS_API]: () => Response.json(sprintsReport()), ...projectApi },
    });
    expect(
      await screen.findByText('15 ажлын өдрийн 4 дэх өдөр · 11 өдөр үлдсэн'),
    ).toBeInTheDocument();
    expect(screen.getByText('Үүнээс 7 нь өмнөх спринтээс')).toBeInTheDocument();
    expect(screen.getByText('13-р спринтээс · 3 нь 2+ удаа шилжсэн')).toBeInTheDocument();
    expect(
      screen.getByText(/Хамрах хүрээг багасгах эсвэл хянагдаж буй ажлыг түргэсгэхийг бодоорой\./),
    ).toBeInTheDocument();
  });
});
