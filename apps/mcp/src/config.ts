/** Settings from the environment Claude Desktop starts the server with (`env` in its config). */
export interface McpConfig {
  /** Origin plus any sub-path, no trailing slash: `http://localhost:3000`, `https://host/task-manager`. */
  baseUrl: string;
  /** A token from Settings → Claude (43 base64url characters). */
  token: string;
  /** Workspace slug to use when a tool call names none. */
  workspace: string | undefined;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Reads `KITE_URL`, `KITE_TOKEN` and optional `KITE_WORKSPACE`; throws `ConfigError` with the fix. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawUrl = env.KITE_URL?.trim();
  if (!rawUrl) throw new ConfigError('KITE_URL is not set (e.g. http://localhost:3000).');
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError(`KITE_URL is not a URL: ${rawUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('KITE_URL must start with http:// or https://');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError('KITE_URL must be the plain Kite address (no credentials, query or #).');
  }

  const token = env.KITE_TOKEN?.trim() ?? '';
  if (!TOKEN.test(token)) {
    throw new ConfigError(
      'KITE_TOKEN is missing or malformed. Create one in Kite: Settings → Claude.',
    );
  }

  const workspace = env.KITE_WORKSPACE?.trim();
  return {
    baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
    token,
    workspace: workspace === '' ? undefined : workspace,
  };
}

/** Plain http beyond this machine sends the token in the clear. */
export function isInsecureRemote(baseUrl: string): boolean {
  const { protocol, hostname } = new URL(baseUrl);
  return protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
