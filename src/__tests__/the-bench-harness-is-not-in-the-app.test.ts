/**
 * The bench harness page (scripts/lib/bench-harness, which citadel-docs' browser benchmark builds
 * on its own) is never part of the app: walking EVERY import from src/main.tsx, static and
 * dynamic (a lazy chunk ships too), reaches no module of it. The same walk from the harness's
 * own entry reaches the editor, so the walker does follow the imports it is trusted with.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT: string = process.cwd();
const SRC: string = join(ROOT, 'src');
const HARNESS: string = join(ROOT, 'scripts/lib/bench-harness');
const EXTENSIONS: readonly string[] = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];

function resolveImport(from: string, spec: string): string | null {
  const base: string | null = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const ext of EXTENSIONS) {
    const candidate: string = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every value-carrying import of a module: `import`/`export ... from`, bare `import '...'`, and `import('...')`. */
function imports(source: string): string[] {
  const code: string = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs: string[] = [];
  for (const m of code.matchAll(/^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    if (m[2] === undefined && m[4] !== undefined) specs.push(m[4]);
  }
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1] !== undefined) specs.push(m[1]);
  }
  return specs;
}

function reachable(entry: string): Set<string> {
  const seen: Set<string> = new Set<string>([entry]);
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file: string = queue.shift() as string;
    if (!/\.(tsx?|m?js)$/.test(file)) continue;
    for (const spec of imports(readFileSync(file, 'utf8'))) {
      const target: string | null = resolveImport(file, spec);
      if (target !== null && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

const inHarness = (file: string): boolean => !relative(HARNESS, file).startsWith('..');

describe('the bench harness page', () => {
  const app: Set<string> = reachable(join(SRC, 'main.tsx'));

  it('is reached by nothing the app imports, statically or lazily', () => {
    expect(app.size).toBeGreaterThan(200);
    expect([...app].filter(inHarness).map((f: string) => relative(ROOT, f))).toEqual([]);
  });

  it('is walked by the same walker, which reaches the editor from it', () => {
    const harness: Set<string> = reachable(join(HARNESS, 'main.tsx'));
    expect([...harness].map((f: string) => relative(ROOT, f))).toContain('src/components/documents/DocsCanvas.tsx');
  });
});
