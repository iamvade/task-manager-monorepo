import { Navigate, createBrowserRouter, type RouteObject } from 'react-router';
import { RedirectIfAuthed, RequireAuth } from './auth/RouteGuards';
import { RouteError } from './components/ErrorState';
import { ProjectLayout } from './features/project/ProjectLayout';
import { AppShell } from './features/shell/AppShell';
import { SpaceLayout } from './features/space/SpaceLayout';
import { ViewPlaceholder } from './features/views/ViewPlaceholder';
import { InboxPage } from './pages/InboxPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { LoginPage } from './pages/LoginPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskPage } from './pages/TaskPage';

/** List / Board / Calendar children shared by project and space routes. */
const viewRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="list" replace /> },
  { path: 'list', element: <ViewPlaceholder view="list" /> },
  { path: 'board', element: <ViewPlaceholder view="board" /> },
  { path: 'calendar', element: <ViewPlaceholder view="calendar" /> },
];

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { element: <RedirectIfAuthed />, children: [{ path: '/login', element: <LoginPage /> }] },
      { path: '/invite/:token', element: <InviteAcceptPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <Navigate to="/my-tasks" replace /> },
              { path: '/my-tasks', element: <MyTasksPage /> },
              { path: '/inbox', element: <InboxPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/t/:taskKey', element: <TaskPage /> },
              { path: '/p/:projectId', element: <ProjectLayout />, children: viewRoutes },
              { path: '/s/:spaceId', element: <SpaceLayout />, children: viewRoutes },
              { path: '*', element: <Navigate to="/my-tasks" replace /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
