import type { ComponentType } from 'react';
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router';
import { RedirectIfAuthed, RequireAuth } from './auth/RouteGuards';
import { RouteError } from './components/ErrorState';
import { AppShell } from './features/shell/AppShell';

/**
 * Every page is its own chunk (`route.lazy`), loaded on first visit; the guards and the shell
 * (sidebar, overlays) stay in the entry chunk.
 */
const page =
  <M,>(load: () => Promise<M>, pick: (module: M) => ComponentType) =>
  async (): Promise<Pick<RouteObject, 'Component'>> => ({ Component: pick(await load()) });

const views = {
  list: () => import('./features/list/ListView'),
  board: () => import('./features/board/BoardView'),
  calendar: () => import('./features/calendar/CalendarView'),
};

/** List / Board / Calendar children of the project and space routes. */
const viewRoutes = (level: 'project' | 'space'): RouteObject[] => [
  { index: true, element: <Navigate to="list" replace /> },
  {
    path: 'list',
    lazy: page(views.list, (m) => (level === 'project' ? m.ListView : m.SpaceListView)),
  },
  {
    path: 'board',
    lazy: page(views.board, (m) => (level === 'project' ? m.BoardView : m.SpaceBoardView)),
  },
  {
    path: 'calendar',
    lazy: page(views.calendar, (m) => (level === 'project' ? m.CalendarView : m.SpaceCalendarView)),
  },
];

const reportsRoutes = () => import('./features/reports/ReportsRoutes');

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    // Shown while the first page's chunk loads (lazy routes); the page paints right after.
    HydrateFallback: () => null,
    children: [
      {
        element: <RedirectIfAuthed />,
        children: [
          {
            path: '/login',
            lazy: page(
              () => import('./pages/LoginPage'),
              (m) => m.LoginPage,
            ),
          },
        ],
      },
      {
        path: '/invite/:token',
        lazy: page(
          () => import('./pages/InviteAcceptPage'),
          (m) => m.InviteAcceptPage,
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <Navigate to="/my-tasks" replace /> },
              {
                path: '/my-tasks',
                lazy: page(
                  () => import('./pages/MyTasksPage'),
                  (m) => m.MyTasksPage,
                ),
              },
              {
                path: '/inbox',
                lazy: page(
                  () => import('./pages/InboxPage'),
                  (m) => m.InboxPage,
                ),
              },
              {
                path: '/settings',
                lazy: page(
                  () => import('./pages/SettingsPage'),
                  (m) => m.SettingsPage,
                ),
              },
              {
                path: '/t/:taskKey',
                lazy: page(
                  () => import('./pages/TaskPage'),
                  (m) => m.TaskPage,
                ),
              },
              {
                path: '/reports',
                children: [
                  { index: true, element: <Navigate to="overview" replace /> },
                  {
                    path: 'overview',
                    lazy: page(
                      () => import('./features/reports/overview/OverviewTab'),
                      (m) => m.OverviewTab,
                    ),
                  },
                  {
                    path: 'sprints',
                    lazy: page(
                      () => import('./features/reports/sprints/SprintsTab'),
                      (m) => m.SprintsTab,
                    ),
                  },
                  {
                    path: 'workload',
                    lazy: page(
                      () => import('./features/reports/workload/WorkloadTab'),
                      (m) => m.WorkloadTab,
                    ),
                  },
                  { path: 'people/:userId?', lazy: page(reportsRoutes, (m) => m.PeopleRoute) },
                  { path: 'me', lazy: page(reportsRoutes, (m) => m.MyPerformanceRoute) },
                ],
              },
              {
                path: '/p/:projectId',
                lazy: page(
                  () => import('./features/project/ProjectLayout'),
                  (m) => m.ProjectLayout,
                ),
                children: viewRoutes('project'),
              },
              {
                path: '/s/:spaceId',
                lazy: page(
                  () => import('./features/space/SpaceLayout'),
                  (m) => m.SpaceLayout,
                ),
                children: viewRoutes('space'),
              },
              { path: '*', element: <Navigate to="/my-tasks" replace /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
