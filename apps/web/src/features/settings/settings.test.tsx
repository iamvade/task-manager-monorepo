import type { WorkspaceRole } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { at } from '../../test/tasks';

const meAs = (role: WorkspaceRole) => ({
  ...ME,
  preferences: { ...ME.preferences, locale: 'en' },
  workspaces: ME.workspaces.map((w) => ({ ...w, role })),
});

const SARA = { ...at(PROJECT.members, 1), role: 'admin' };
const DORJ = at(PROJECT.members, 3);
const MEMBERS = [
  {
    user: { ...ME.user },
    role: 'owner',
    title: null,
    capacityPoints: 15,
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  SARA,
  DORJ,
];
const INVITE = {
  id: '01890000-0000-7000-8000-000000000901',
  email: 'nara@kite.test',
  role: 'member',
  expiresAt: '2026-10-15T00:00:00.000Z',
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function renderSettings(
  entry: string,
  extra: Record<string, Handler> = {},
  role: WorkspaceRole = 'owner',
) {
  const me = meAs(role);
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(me),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () => Response.json(MEMBERS),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/invites`]: () => Response.json([INVITE]),
    'PATCH /api/v1/me': (init) => {
      const { notificationPrefs, ...body } = JSON.parse(init?.body as string) as Record<
        string,
        object
      >;
      return Response.json({
        ...me,
        preferences: {
          ...me.preferences,
          ...body,
          notificationPrefs: { ...me.preferences.notificationPrefs, ...notificationPrefs },
        },
      });
    },
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

const bodies = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([, init]) => JSON.parse(init?.body as string) as unknown);

describe('Settings', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });

  it('opens on Profile, with tabs in the URL', async () => {
    renderSettings('/settings');
    expect(await screen.findByRole('tab', { name: 'Profile' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Anu Bold');
    expect(screen.getByRole('radio', { name: 'Indigo' })).toBeChecked();
  });

  it('saves a notification toggle as a partial update', async () => {
    const { fetchMock } = renderSettings('/settings?tab=notifications');
    const mentions = await screen.findByRole('switch', { name: /Mentions/ });
    expect(mentions).toBeChecked();
    fireEvent.click(mentions);
    await waitFor(() => {
      expect(mentions).not.toBeChecked();
    });
    await waitFor(() => {
      expect(bodies(fetchMock, 'PATCH')).toEqual([{ notificationPrefs: { mention: false } }]);
    });
  });

  it('applies the accent and theme right away', async () => {
    const { fetchMock } = renderSettings('/settings?tab=preferences');
    fireEvent.click(await screen.findByRole('radio', { name: 'Teal' }));
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0F766E');
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    await waitFor(() => {
      expect(bodies(fetchMock, 'PATCH')).toEqual([{ accent: '#0F766E' }, { theme: 'dark' }]);
    });
  });

  it('lets admins invite, revoke and change roles of others', async () => {
    const { fetchMock } = renderSettings('/settings?tab=members', {
      [`POST /api/v1/workspaces/${WORKSPACE_ID}/invites`]: () =>
        Response.json({ ...INVITE, email: 'new@kite.test' }, { status: 201 }),
      [`DELETE /api/v1/workspaces/${WORKSPACE_ID}/invites/${INVITE.id}`]: () =>
        new Response(null, { status: 204 }),
      [`PATCH /api/v1/workspaces/${WORKSPACE_ID}/members/${DORJ.user.id}`]: () =>
        Response.json({ ...DORJ, role: 'admin' }),
    });
    // The owner (me) and nobody's own row get a role menu; Sara and Dorj do.
    expect(await screen.findByText('Dorj E.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change role of Anu Bold/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change role of Dorj E.: Member' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Admin' }));
    await waitFor(() => {
      expect(bodies(fetchMock, 'PATCH')).toEqual([{ role: 'admin' }]);
    });

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'New@Kite.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText('Invite sent to new@kite.test')).toBeInTheDocument();
    expect(bodies(fetchMock, 'POST')).toEqual([{ email: 'new@kite.test', role: 'member' }]);

    const pending = screen.getByRole('region', { name: 'Pending invites' });
    fireEvent.click(within(pending).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Invite to nara@kite.test revoked')).toBeInTheDocument();
  });

  it('shows plain members the list without controls', async () => {
    renderSettings('/settings?tab=members', {}, 'member');
    expect(await screen.findByText('Dorj E.')).toBeInTheDocument();
    expect(screen.getByText('Only admins can invite people and change roles.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change role/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send invite' })).toBeNull();
    // Job title and capacity are read-only.
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Job title/ })).toBeNull();
    expect(screen.getAllByText('15 pts / 2 wks').length).toBeGreaterThan(0);
  });

  it('lets admins set job titles and capacity inline', async () => {
    const { fetchMock } = renderSettings('/settings?tab=members', {
      [`PATCH /api/v1/workspaces/${WORKSPACE_ID}/members/${DORJ.user.id}`]: (init) =>
        Response.json({ ...DORJ, ...(JSON.parse(init?.body as string) as object) }),
    });
    const title = await screen.findByRole('textbox', { name: 'Job title of Dorj E.' });
    fireEvent.change(title, { target: { value: ' Frontend engineer ' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.blur(title);
    const capacity = screen.getByRole('spinbutton', {
      name: 'Capacity of Dorj E. (points per 2 weeks)',
    });
    expect(capacity).toHaveValue(15);
    fireEvent.change(capacity, { target: { value: '12' } });
    fireEvent.blur(capacity);
    // Out of range: not sent.
    fireEvent.change(capacity, { target: { value: '500' } });
    fireEvent.blur(capacity);
    await waitFor(() => {
      expect(bodies(fetchMock, 'PATCH')).toEqual([
        { title: 'Frontend engineer' },
        { capacityPoints: 12 },
      ]);
    });
  });
});
