// Builds the Claude Desktop extension: dist/kite-tasks.mcpb.
// 1. tsup bundles the server into dist/index.js (one file, no node_modules needed).
// 2. A stage folder gets manifest.json (version from package.json), server/index.mjs and icon.png.
// 3. `mcpb validate` + `mcpb pack` turn it into the .mcpb (a zip Claude Desktop installs).
// Commands run with execFileSync (argument arrays, no shell), and any failure exits non-zero.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = join(root, '.mcpb-stage');
const output = join(root, 'dist', 'kite-tasks.mcpb');
const bin = (name) => join(root, 'node_modules', '.bin', name);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

run(bin('tsup'), []);

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'server'), { recursive: true });

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8'));
manifest.version = version;
writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// `.mjs`: the bundle is ESM and no package.json with "type": "module" sits next to it.
copyFileSync(join(root, 'dist', 'index.js'), join(stage, 'server', 'index.mjs'));
copyFileSync(join(root, '..', 'web', 'public', 'icons', 'icon-512.png'), join(stage, 'icon.png'));

run(bin('mcpb'), ['validate', join(stage, 'manifest.json')]);
rmSync(output, { force: true });
run(bin('mcpb'), ['pack', stage, output]);

console.log(
  `kite-tasks.mcpb ${version}: ${(statSync(output).size / 1024).toFixed(0)} KB → ${output}`,
);
