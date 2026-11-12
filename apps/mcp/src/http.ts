/**
 * Entry point of the remote Claude connector (its own container, behind the web server at
 * `<web address>/mcp`). Logs go to stderr; tokens are never printed.
 */
import { createServer } from 'node:http';
import { ConfigError } from './config.js';
import { createHttpHandler, readHttpConfig, resourceUrl } from './http-server.js';
import { useConnectorHints } from './tooling.js';

const log = (message: string) => process.stderr.write(`[kite-mcp] ${message}\n`);

function main(): void {
  const config = readHttpConfig();
  useConnectorHints();
  const handler = createHttpHandler(config, { log });
  const server = createServer((req, res) => void handler(req, res));
  server.listen(config.port, config.host, () => {
    log(`connector for ${resourceUrl(config)} listening on ${config.host}:${config.port}`);
  });
  const stop = () => {
    server.close(() => process.exit(0));
    // Open keep-alive connections would hold the process.
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

try {
  main();
} catch (err) {
  log(err instanceof ConfigError ? err.message : `failed to start: ${String(err)}`);
  process.exit(1);
}
