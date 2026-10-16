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
    absences: [],
    deactivatedAt: null,
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
  createdById: null,
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

  it('sets a per-project notification level', async () => {
    const { fetchMock } = renderSettings('/settings?tab=notifications', {
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/notification-levels`]: () => Response.json([]),
      [`PUT /api/v1/projects/${PROJECT.id}/notification-level`]: () =>
        Response.json({ projectId: PROJECT.id, level: 'none' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications for App Redesign' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Nothing' }));
    await waitFor(() => {
      expect(bodies(fetchMock, 'PUT')).toEqual([{ level: 'none' }]);
    });
    expect(
      await screen.findByRole('button', { name: 'Notifications for App Redesign' }),
    ).toHaveTextContent('Nothing');
  });

  it('deactivates a member with a handover, and lists them for reactivation', async () => {
    let deactivated = false;
    const posts: unknown[] = [];
    renderSettings('/settings?tab=members', {
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/members/${DORJ.user.id}/handover`]: () =>
        Response.json({
          openTasks: 3,
          reviewing: 1,
          leadOf: [{ id: PROJECT.id, key: 'APP', name: 'App Redesign' }],
        }),
      [`POST /api/v1/workspaces/${WORKSPACE_ID}/members/${DORJ.user.id}/deactivate`]: (init) => {
        posts.push(JSON.parse(init?.body as string));
        deactivated = true;
        return Response.json({ ...DORJ, deactivatedAt: '2026-10-08T03:00:00.000Z' });
      },
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/members?include=deactivated`]: () =>
        Response.json(
          deactivated
            ? [...MEMBERS, { ...DORJ, deactivatedAt: '2026-10-08T03:00:00.000Z' }]
            : MEMBERS,
        ),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Dorj E.' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Dorj E.?' });
    expect(await within(dialog).findByText('3 open tasks assigned')).toBeInTheDocument();
    expect(within(dialog).getByText('Reviewer on 1 open task')).toBeInTheDocument();
    expect(within(dialog).getByText('Leads App Redesign')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Hand their open work to/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Sara K\./ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => {
      expect(posts).toEqual([{ reassignTo: SARA.user.id }]);
    });
    expect(await screen.findByRole('heading', { name: 'Deactivated (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
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

  it('filters a long member list by name in either script, title or email', async () => {
    const extra = [
      'Бат-Эрдэнэ Ганболд',
      'Bat-Erdene Tsogt',
      'Oyunaa B.',
      'Mishel D.',
      'Nomin G.',
      'Saruul T.',
    ].map((name, i) => ({
      ...DORJ,
      user: {
        ...DORJ.user,
        id: `01890000-0000-7000-8000-00000000090${String(i)}`,
        name,
        email: `extra${String(i)}@kite.test`,
      },
      title: i === 2 ? 'Sales lead' : null,
    }));
    renderSettings('/settings?tab=members', {
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () =>
        Response.json([...MEMBERS, ...extra]),
    });
    const search = await screen.findByRole('searchbox', {
      name: 'Search members by name, title or email',
    });
    fireEvent.change(search, { target: { value: 'bat' } });
    expect(screen.getByText('Бат-Эрдэнэ Ганболд')).toBeInTheDocument();
    expect(screen.getByText('Bat-Erdene Tsogt')).toBeInTheDocument();
    expect(screen.queryByText('Dorj E.')).toBeNull();
    fireEvent.change(search, { target: { value: 'sales' } });
    expect(screen.getByText('Oyunaa B.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nobody-here' } });
    expect(screen.getByText('No members match')).toBeInTheDocument();
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

    it('shows members Restore only on projects they created', async () => {
      const [old, pilot] = ARCHIVED;
      renderSettings(
        '/settings?tab=archived',
        {
          [`GET /api/v1/workspaces/${WORKSPACE_ID}/archived-projects`]: () =>
            Response.json([old, { ...pilot, createdById: ME.user.id }]),
        },
        'member',
      );
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(
        screen.getByText('Only admins and the person who created a project can restore it.'),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(1);
      const pilotRow = screen.getByText('Pilot').closest('li');
      if (!pilotRow) throw new Error('no row');
      expect(within(pilotRow).getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    });

    it('says when nothing is archived', async () => {
      renderSettings('/settings?tab=archived', {
        [`GET /api/v1/workspaces/${WORKSPACE_ID}/archived-projects`]: () => Response.json([]),
      });
      expect(await screen.findByText('No archived projects')).toBeInTheDocument();
    });
  });

  describe('Tags', () => {
    const TAG_LIST = [
      { id: '01890000-0000-7000-8000-000000000a01', name: 'Bug', color: 'rose', taskCount: 3 },
      { id: '01890000-0000-7000-8000-000000000a02', name: 'bugs', color: 'blue', taskCount: 1 },
      { id: '01890000-0000-7000-8000-000000000a03', name: 'Research', color: 'teal', taskCount: 0 },
    ];
    const tagsGet = {
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/tags`]: () => Response.json(TAG_LIST),
    };
    const rowOf = async (name: string) => {
      const item = (await screen.findAllByRole('listitem')).find(
        (li) => within(li).queryByText(name, { exact: true }) !== null,
      );
      if (!item) throw new Error(`no row ${name}`);
      return item;
    };

    it('lists tags with usage, searches and sorts by use', async () => {
      renderSettings('/settings?tab=tags', tagsGet);
      expect(await screen.findByText('3 tasks')).toBeVisible();
      expect(screen.getByText('1 task')).toBeVisible();
      const search = screen.getByRole('searchbox', { name: 'Search tags' });
      fireEvent.change(search, { target: { value: 'res' } });
      expect(screen.queryByText('Bug')).toBeNull();
      expect(screen.getByText('Research')).toBeVisible();
      fireEvent.change(search, { target: { value: '' } });
      fireEvent.click(screen.getByRole('radio', { name: 'Most used' }));
      const counts = screen.getAllByText(/^\d+ tasks?$/).map((el) => el.textContent);
      expect(counts).toEqual(['3 tasks', '1 task', '0 tasks']);
    });

    it('creates, renames and recolors a tag', async () => {
      const { fetchMock } = renderSettings('/settings?tab=tags', {
        ...tagsGet,
        [`POST /api/v1/workspaces/${WORKSPACE_ID}/tags`]: (init) =>
          Response.json(
            {
              id: '01890000-0000-7000-8000-000000000a09',
              ...(JSON.parse(init?.body as string) as object),
            },
            { status: 201 },
          ),
        'PATCH /api/v1/tags/01890000-0000-7000-8000-000000000a03': (init) =>
          Response.json({ ...at(TAG_LIST, 2), ...(JSON.parse(init?.body as string) as object) }),
      });
      fireEvent.click(await screen.findByRole('button', { name: 'New tag' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Tag name' }), {
        target: { value: 'Ops' },
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Gray' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => {
        expect(bodies(fetchMock, 'POST')).toEqual([{ name: 'Ops', color: 'neutral' }]);
      });

      const research = await rowOf('Research');
      fireEvent.click(within(research).getByRole('button', { name: 'Actions for Research' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Rename Research' }), {
        target: { value: 'Discovery' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(
        await screen.findByRole('button', { name: /^Color of (Research|Discovery): Teal$/ }),
      );
      fireEvent.click(await screen.findByRole('radio', { name: 'Amber' }));
      await waitFor(() => {
        expect(bodies(fetchMock, 'PATCH')).toEqual([{ name: 'Discovery' }, { color: 'amber' }]);
      });
    });

    it('shows a taken name next to the field', async () => {
      renderSettings('/settings?tab=tags', {
        ...tagsGet,
        [`POST /api/v1/workspaces/${WORKSPACE_ID}/tags`]: () =>
          Response.json({ error: { code: 'TAG_EXISTS', message: 'taken' } }, { status: 409 }),
      });
      fireEvent.click(await screen.findByRole('button', { name: 'New tag' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Tag name' }), {
        target: { value: 'BUG' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'A tag named “BUG” already exists',
      );
    });

    it('merges a tag into another after confirming', async () => {
      const { fetchMock } = renderSettings('/settings?tab=tags', {
        ...tagsGet,
        'POST /api/v1/tags/01890000-0000-7000-8000-000000000a02/merge': () =>
          Response.json({ ...at(TAG_LIST, 0), taskCount: 4 }),
      });
      const bugs = await rowOf('bugs');
      fireEvent.click(within(bugs).getByRole('button', { name: 'Actions for bugs' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Merge into…' }));
      const dialog = await screen.findByRole('dialog', { name: 'Merge “bugs”' });
      expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeDisabled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Merge into' }));
      fireEvent.click(await screen.findByRole('option', { name: /^Bug/ }));
      expect(dialog).toHaveTextContent('Tasks tagged “bugs” get “Bug” instead');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));
      await waitFor(() => {
        expect(bodies(fetchMock, 'POST')).toEqual([
          { intoTagId: '01890000-0000-7000-8000-000000000a01' },
        ]);
      });
      expect(await screen.findByText('“bugs” merged into “Bug”')).toBeVisible();
    });

    it('asks before deleting, with how many tasks lose it', async () => {
      const { fetchMock } = renderSettings('/settings?tab=tags', {
        ...tagsGet,
        'DELETE /api/v1/tags/01890000-0000-7000-8000-000000000a01': () =>
          new Response(null, { status: 204 }),
      });
      const bug = await rowOf('Bug');
      fireEvent.click(within(bug).getByRole('button', { name: 'Actions for Bug' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog', { name: 'Delete “Bug”?' });
      expect(dialog).toHaveTextContent('It will be removed from 3 tasks.');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => {
        expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(
          1,
        );
      });
      expect(await screen.findByText('Tag “Bug” deleted')).toBeVisible();
    });

    it('shows plain members the list without controls', async () => {
      renderSettings('/settings?tab=tags', tagsGet, 'member');
      expect(
        await screen.findByText('Only admins and owners can create, edit, merge or delete tags.'),
      ).toBeVisible();
      expect(await screen.findByText('3 tasks')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'New tag' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Color of/ })).toBeNull();
    });
  });
});
