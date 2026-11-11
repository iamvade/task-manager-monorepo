import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import manifest from '../mcpb/manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import { readConfig } from '../src/config.js';
import { Kite } from '../src/kite.js';
import { SERVER_NAME, SERVER_VERSION, createServer } from '../src/server.js';

const TOKEN = 'c'.repeat(43);

describe('the .mcpb manifest', () => {
  it('lists exactly the tools the server registers', async () => {
    const kite = new Kite({ baseUrl: 'http://kite.test', token: TOKEN, workspace: undefined });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createServer(kite);
    const client = new Client({ name: 'test', version: '0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const { tools } = await client.listTools();
    await client.close();
    expect(manifest.tools.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it('is named like the server and runs the bundled entry with the user settings', () => {
    expect(manifest.name).toBe(SERVER_NAME);
    expect(manifest.server.entry_point).toBe('server/index.mjs');
    expect(manifest.server.mcp_config.env).toEqual({
      KITE_URL: '${user_config.kite_url}',
      KITE_TOKEN: '${user_config.kite_token}',
      KITE_WORKSPACE: '${user_config.kite_workspace}',
    });
    expect(manifest.user_config.kite_token.sensitive).toBe(true);
  });

  it('takes its version from package.json, like the server', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});

describe('readConfig with extension settings', () => {
  it('treats a blank optional field passed as its placeholder as unset', () => {
    const config = readConfig({
      KITE_URL: 'https://kite.example.com',
      KITE_TOKEN: TOKEN,
      KITE_WORKSPACE: '${user_config.kite_workspace}',
    });
    expect(config.workspace).toBeUndefined();
  });

  it('asks for the address when the required field arrives as a placeholder', () => {
    expect(() => readConfig({ KITE_URL: '${user_config.kite_url}', KITE_TOKEN: TOKEN })).toThrow(
      /KITE_URL is not set/,
    );
    expect(() =>
      readConfig({ KITE_URL: 'https://k.example', KITE_TOKEN: '${user_config.kite_token}' }),
    ).toThrow(/KITE_TOKEN is missing/);
  });
});
