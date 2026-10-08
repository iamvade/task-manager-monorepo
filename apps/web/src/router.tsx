import { Navigate, createBrowserRouter, type RouteObject } from 'react-router';
import { RedirectIfAuthed, RequireAuth } from './auth/RouteGuards';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { LoginPage } from './pages/LoginPage';
import { MyTasksPage } from './pages/MyTasksPage';

export const routes: RouteObject[] = [
  { element: <RedirectIfAuthed />, children: [{ path: '/login', element: <LoginPage /> }] },
  { path: '/invite/:token', element: <InviteAcceptPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/my-tasks" replace /> },
      { path: '/my-tasks', element: <MyTasksPage /> },
      { path: '*', element: <Navigate to="/my-tasks" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
