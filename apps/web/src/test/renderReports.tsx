import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { AuthProvider } from '../auth/AuthProvider';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { ME, SIDEBAR, WORKSPACE_ID, mockApi } from './fixtures';
import { overview } from './reports';

type Handler = (init?: RequestInit) => Response | Promise<Response>;

export const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
export const MEMBER_ME = {
  ...EN_ME,
  workspaces: EN_ME.workspaces.map((w) => ({ ...w, role: 'member' })),
};
export const REPORTS_API = `GET /api/v1/workspaces/${WORKSPACE_ID}/reports`;

/** The app at `entry` with the session, sidebar and an Overview report mocked. */
export function renderReports(
  entry: string,
  { me = EN_ME, extra = {} }: { me?: typeof EN_ME; extra?: Record<string, Handler> } = {},
) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(me),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    [`${REPORTS_API}/overview`]: () => Response.json(overview()),
    ...extra,
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

/** Whether any request URL so far contains `part`. */
export const requested = (fetchMock: ReturnType<typeof mockApi>, part: string) =>
  fetchMock.mock.calls.some(([input]) => typeof input === 'string' && input.includes(part));
