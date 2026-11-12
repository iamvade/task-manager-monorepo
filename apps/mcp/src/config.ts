/** Settings from the environment Claude Desktop starts the server with (`env` in its config). */
export interface McpConfig {
  /** Origin plus any sub-path, no trailing slash: `http://localhost:3000`, `https://host/task-manager`. */
  baseUrl: string;
  /** A token from Settings → Claude (43 base64url characters). */
  token: string;
  /** Workspace slug to use when a tool call names none. */
  workspace: string | undefined;
  /**
   * Where API requests go when that differs from `baseUrl` (the HTTP server calls the API inside
   * the deployment, while links must use the address people open). Defaults to `baseUrl`.
   */
  apiBaseUrl?: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * A setting's value, or undefined when empty or still the extension's own placeholder: Claude
 * Desktop may pass an optional field left blank as the literal `${user_config.…}`.
 */
function setting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{user_config\.[\w-]+\}$/.test(trimmed)) return undefined;
  return trimmed;
}

/** Reads `KITE_URL`, `KITE_TOKEN` and optional `KITE_WORKSPACE`; throws `ConfigError` with the fix. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawUrl = setting(env.KITE_URL);
  if (!rawUrl)
    throw new ConfigError(
      'KITE_URL is not set: the address you open Kite at (e.g. https://kite.example.com).',
    );
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

  const token = setting(env.KITE_TOKEN) ?? '';
  if (!TOKEN.test(token)) {
    throw new ConfigError(
      'KITE_TOKEN is missing or malformed. Create one in Kite: Settings → Claude.',
    );
  }

  return {
    baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
    token,
    workspace: setting(env.KITE_WORKSPACE),
  };
}

/** Plain http beyond this machine sends the token in the clear. */
export function isInsecureRemote(baseUrl: string): boolean {
  const { protocol, hostname } = new URL(baseUrl);
  return protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
