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
import { ME, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { EXTENSION_URL } from '../../api/mcpTokens';
import { desktopConfig } from './claudeConfig';

const TOKEN = 'k'.repeat(43);
const ME_EN = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const device = (id: string, client: string, deviceLabel: string) => ({
  id,
  client,
  deviceLabel,
  createdAt: '2026-11-01T04:00:00.000Z',
  lastSeenAt: '2026-11-10T04:00:00.000Z',
  expiresAt: '2026-12-10T04:00:00.000Z',
  current: false,
});
const OLD = device('01890000-0000-7000-8000-000000000a01', 'mcp', 'Work Mac');
const BROWSER = device('01890000-0000-7000-8000-000000000a02', 'web', 'Chrome on macOS');

function renderClaude(extension: 'served' | 'missing' = 'missing') {
  let devices = [OLD, BROWSER];
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(ME_EN),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    'GET /api/v1/auth/sessions': () => Response.json(devices),
    // Caddy and Vite answer a missing file with index.html (200), so that counts as absent.
    [`HEAD ${EXTENSION_URL()}`]: () =>
      extension === 'served'
        ? new Response(null, { headers: { 'content-length': '342453' } })
        : new Response(null, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    'POST /api/v1/auth/mcp-tokens': () => {
      const created = device('01890000-0000-7000-8000-000000000a03', 'mcp', 'Claude Desktop');
      devices = [created, ...devices];
      return Response.json(
        {
          id: created.id,
          token: TOKEN,
          deviceLabel: created.deviceLabel,
          expiresAt: created.expiresAt,
        },
        { status: 201 },
      );
    },
    [`DELETE /api/v1/auth/sessions/${OLD.id}`]: () => {
      devices = devices.filter((d) => d.id !== OLD.id);
      return new Response(null, { status: 204 });
    },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: ['/w/kite-studio/settings?tab=claude'],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

describe('Settings → Claude', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    await i18n.changeLanguage('en');
  });

  it('lists only MCP tokens', async () => {
    renderClaude();
    expect(await screen.findByText('Work Mac')).toBeInTheDocument();
    expect(screen.queryByText('Chrome on macOS')).not.toBeInTheDocument();
  });

  it('creates a token and shows it once with a ready config', async () => {
    renderClaude();
    fireEvent.click(await screen.findByRole('button', { name: 'Create token' }));
    expect(await screen.findByLabelText('Token for Claude Desktop')).toHaveValue(TOKEN);
    expect(screen.getByText(/"KITE_TOKEN": "k{43}"/)).toBeInTheDocument();
    expect(await screen.findByText('Claude Desktop')).toBeInTheDocument();
  });

  it('offers the extension in three steps when the server serves it', async () => {
    renderClaude('served');
    fireEvent.click(await screen.findByRole('button', { name: 'Create token' }));
    const download = await screen.findByRole('link', { name: 'Download for Claude Desktop' });
    expect(download).toHaveAttribute('href', EXTENSION_URL());
    expect(download).toHaveAttribute('download', 'kite-tasks.mcpb');
    expect(screen.getByLabelText('Kite address')).toHaveValue(window.location.origin);
    expect(screen.getByLabelText('Token for Claude Desktop')).toHaveValue(TOKEN);
    // The manual config is still there, folded away.
    expect(screen.getByText('Set up without the extension (developers)')).toBeInTheDocument();
  });

  it('shows only the manual config when the extension is not served', async () => {
    renderClaude('missing');
    fireEvent.click(await screen.findByRole('button', { name: 'Create token' }));
    expect(await screen.findByLabelText('Token for Claude Desktop')).toHaveValue(TOKEN);
    expect(screen.queryByRole('link', { name: 'Download for Claude Desktop' })).toBeNull();
    expect(screen.queryByText('Set up without the extension (developers)')).toBeNull();
  });

  it('revokes a token after confirming', async () => {
    const { fetchMock } = renderClaude();
    const row = (await screen.findByText('Work Mac')).closest('li');
    if (!row) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke “Work Mac”?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => {
      expect(screen.queryByText('Work Mac')).not.toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === 'DELETE' && typeof url === 'string' && url.endsWith(OLD.id),
      ),
    ).toBe(true);
  });
});

describe('desktopConfig', () => {
  it('points Claude Desktop at this Kite with the token and workspace', () => {
    const parsed = JSON.parse(desktopConfig(TOKEN, 'kite-labs')) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
    };
    expect(parsed.mcpServers['kite-tasks']).toEqual({
      command: 'node',
      args: ['/path/to/kite-tasks/apps/mcp/dist/index.js'],
      env: { KITE_URL: window.location.origin, KITE_TOKEN: TOKEN, KITE_WORKSPACE: 'kite-labs' },
    });
  });
});
