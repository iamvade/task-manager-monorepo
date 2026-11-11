import { appUrl } from '../../lib/basePath';

/** Where the built server lives in a checkout; the person replaces it with their own path. */
const SERVER_PATH = '/path/to/kite-tasks/apps/mcp/dist/index.js';

/** The `mcpServers` entry for Claude Desktop's `claude_desktop_config.json`. */
export function desktopConfig(token: string, workspaceSlug: string | undefined): string {
  const env: Record<string, string> = { KITE_URL: appUrl(''), KITE_TOKEN: token };
  if (workspaceSlug) env.KITE_WORKSPACE = workspaceSlug;
  return JSON.stringify(
    { mcpServers: { 'kite-tasks': { command: 'node', args: [SERVER_PATH], env } } },
    null,
    2,
  );
}
