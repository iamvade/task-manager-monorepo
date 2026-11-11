/**
 * Entry point Claude Desktop runs (stdio). stdout carries the MCP protocol only: every log line
 * goes to stderr, and the token is never printed.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, isInsecureRemote, readConfig } from './config.js';
import { Kite } from './kite.js';
import { SERVER_VERSION, createServer } from './server.js';

const log = (message: string) => process.stderr.write(`[kite-mcp] ${message}\n`);

async function main(): Promise<void> {
  const config = readConfig();
  if (isInsecureRemote(config.baseUrl)) {
    log(`warning: ${config.baseUrl} is plain http; the token travels unencrypted.`);
  }
  const kite = new Kite(config, { userAgent: `kite-mcp/${SERVER_VERSION}` });
  await createServer(kite).connect(new StdioServerTransport());
  log(`ready for ${config.baseUrl}`);
}

main().catch((err: unknown) => {
  log(err instanceof ConfigError ? err.message : `failed to start: ${String(err)}`);
  process.exit(1);
});
