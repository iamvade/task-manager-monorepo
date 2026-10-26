/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STYLES = join(__dirname, '../../../../web/src/styles');

/** `--name: value;` declarations per selector (comments stripped, last declaration wins). */
export function parseCss(file: string): Map<string, Map<string, string>> {
  const css = readFileSync(join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = new Map<string, Map<string, string>>();
  for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = blocks.get(selector.trim()) ?? new Map<string, string>();
    for (const [, name = '', value = ''] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      decls.set(name, value.trim());
    }
    blocks.set(selector.trim(), decls);
  }
  return blocks;
}

/** Resolves `var(--x)` references against `vars`, recursively. */
export function resolveVars(vars: Map<string, string>): Map<string, string> {
  const resolve = (value: string, depth = 0): string => {
    if (depth > 10) throw new Error(`var() cycle in ${value}`);
    return value.replace(/var\(--([\w-]+)\)/g, (_, ref: string) => {
      const target = vars.get(ref);
      if (target === undefined) throw new Error(`Unknown CSS variable --${ref}`);
      return resolve(target, depth + 1);
    });
  };
  return new Map([...vars].map(([name, value]) => [name, resolve(value)]));
}

/** `--bg-sidebar` → `bgSidebar`. */
export function camel(name: string): string {
  return name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

/** Case- and whitespace-insensitive form of a color/shadow value. */
export function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}
