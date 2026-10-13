import type { WorkspaceRole } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT, SIDEBAR, SPACE_ID, WORKSPACE_ID, mockApi } from '../../test/fixtures';
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

const archivedProject = (n: number, name: string, key: string, archivedAt: string) => ({
  id: `01890000-0000-7000-8000-00000000092${String(n)}`,
  workspaceId: WORKSPACE_ID,
  spaceId: SPACE_ID,
  key,
  name,
  color: 'blue',
  archivedAt,
  space: { id: SPACE_ID, name: 'Product', initial: 'P', color: 'violet' },
});
const ARCHIVED = [
  archivedProject(1, 'Old site', 'OLD', '2026-10-06T04:00:00.000Z'),
  archivedProject(2, 'Pilot', 'PIL', '2026-09-20T04:00:00.000Z'),
];

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
        Response.json(
          { ...INVITE, email: 'new@kite.test', link: 'https://kite.test/invite/abc123' },
          { status: 201 },
        ),
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
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(await screen.findByText('Invite created for new@kite.test')).toBeInTheDocument();
    expect(bodies(fetchMock, 'POST')).toEqual([{ email: 'new@kite.test', role: 'member' }]);
    // No email goes out: the admin gets the link to pass on.
    expect(screen.getByLabelText('Invite link for new@kite.test')).toHaveValue(
      'https://kite.test/invite/abc123',
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();

    const pending = screen.getByRole('region', { name: 'Pending invites' });
    fireEvent.click(within(pending).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Invite to nara@kite.test revoked')).toBeInTheDocument();
  });

  it('shows plain members the list without controls', async () => {
    renderSettings('/settings?tab=members', {}, 'member');
    expect(await screen.findByText('Dorj E.')).toBeInTheDocument();
    expect(screen.getByText('Only admins can invite people and change roles.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change role/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create invite' })).toBeNull();
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
  describe('Archived', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('lists archived projects and restores one', async () => {
      let archived = ARCHIVED;
      const restored: string[] = [];
      const old = ARCHIVED[0];
      if (!old) throw new Error('fixture');
      renderSettings('/settings?tab=archived', {
        [`GET /api/v1/workspaces/${WORKSPACE_ID}/archived-projects`]: () => Response.json(archived),
        [`POST /api/v1/projects/${old.id}/unarchive`]: () => {
          restored.push(old.id);
          archived = archived.filter((p) => p.id !== old.id);
          return Response.json({ ...PROJECT, id: old.id, name: old.name, archivedAt: null });
        },
      });

      const list = await screen.findByRole('list');
      const rows = within(list).getAllByRole('listitem');
      expect(rows.map((r) => r.textContent)).toEqual([
        expect.stringContaining('Old siteOLDProduct · Archived Oct 6'),
        expect.stringContaining('PilotPILProduct · Archived Sep 20'),
      ]);
      expect(within(at(rows, 0)).getByRole('link', { name: 'Old site' })).toHaveAttribute(
        'href',
        `/p/${old.id}/list`,
      );

      fireEvent.click(within(at(rows, 0)).getByRole('button', { name: 'Restore' }));
      await waitFor(() => {
        expect(screen.queryByText('Old site')).toBeNull();
      });
      expect(restored).toEqual([old.id]);
      expect(useToastStore.getState().toasts.map((x) => x.message)).toEqual(['Old site restored']);
    });

    it('shows members the list without Restore', async () => {
      renderSettings(
        '/settings?tab=archived',
        {
          [`GET /api/v1/workspaces/${WORKSPACE_ID}/archived-projects`]: () =>
            Response.json(ARCHIVED),
        },
        'member',
      );
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(screen.getByText('Only admins can restore projects.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    });

    it('says when nothing is archived', async () => {
      renderSettings('/settings?tab=archived', {
        [`GET /api/v1/workspaces/${WORKSPACE_ID}/archived-projects`]: () => Response.json([]),
      });
      expect(await screen.findByText('No archived projects')).toBeInTheDocument();
    });
  });
});
