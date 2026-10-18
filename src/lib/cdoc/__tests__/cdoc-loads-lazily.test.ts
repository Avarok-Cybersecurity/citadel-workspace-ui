/**
 * Citadel Docs costs nothing until a document opens. Walks the STATIC import graph from
 * src/main.tsx (type-only imports are erased, dynamic import() is the point, so neither is an
 * edge) and fails if it reaches any cdoc module, the page view, or the generated glue. The
 * only doors are lib/cdoc/runtime-loader.ts (a dynamic import) and documents/DocsCanvas.tsx
 * (React.lazy in DocumentHost); types-only document-source.ts is allowed.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC: string = join(process.cwd(), 'src');
const ALLOWED: ReadonlySet<string> = new Set<string>(['lib/cdoc/runtime-loader.ts', 'lib/cdoc/document-source.ts']);
const FORBIDDEN: readonly RegExp[] = [/^lib\/cdoc\//, /^\.\.\/vendor\/cdoc\//, /^components\/documents\/(PageView|DocsCanvas)\.tsx$/, /^components\/documents\/page-view\//];

const EXTENSIONS: readonly string[] = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

function resolveImport(from: string, spec: string): string | null {
  const base: string | null = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const ext of EXTENSIONS) {
    const candidate: string = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Static, value-carrying import and re-export specifiers of a module. */
export function staticImports(source: string): string[] {
  const code: string = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs: string[] = [];
  const pattern: RegExp = /^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  for (const m of code.matchAll(pattern)) {
    if (m[2] === undefined) specs.push(m[4]);
  }
  return specs;
}

function graphFrom(entry: string): Map<string, string> {
  const parent: Map<string, string> = new Map<string, string>([[entry, '']]);
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file: string = queue.shift() as string;
    for (const spec of staticImports(readFileSync(file, 'utf8'))) {
      const target: string | null = resolveImport(file, spec);
      if (target !== null && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return parent;
}

function chain(parent: Map<string, string>, file: string): string {
  const path: string[] = [];
  for (let at: string = file; at !== ''; at = parent.get(at) ?? '') path.unshift(relative(SRC, at));
  return path.join(' -> ');
}

const eagerIn = (graph: Map<string, string>): string[] =>
  [...graph.keys()]
    .map((f: string) => relative(SRC, f))
    .filter((f: string) => !ALLOWED.has(f) && FORBIDDEN.some((re: RegExp) => re.test(f)))
    .map((f: string) => chain(graph, join(SRC, f)));

describe('Citadel Docs is loaded lazily', () => {
  const fromMain: Map<string, string> = graphFrom(join(SRC, 'main.tsx'));
  // DocumentHost is itself behind a lazy route; walking from it too means cdoc stays out of
  // even the chunk that shows a document, until the Docs editor region mounts.
  const fromHost: Map<string, string> = graphFrom(join(SRC, 'components/documents/DocumentHost.tsx'));

  // The file manager opens Docs files in place; it must reach cdoc only through the same doors.
  const fromFileManager: Map<string, string> = graphFrom(join(SRC, 'components/file-manager/FileManagerContent.tsx'));

  it('walks real graphs', () => {
    expect(fromMain.size).toBeGreaterThan(200);
    expect([...fromHost.keys()].map((f: string) => relative(SRC, f))).toContain('lib/citadel-apps/registry.ts');
  });

  it('reaches no cdoc module, page view or glue statically from main.tsx', () => {
    expect(eagerIn(fromMain)).toEqual([]);
  });

  it('reaches none from DocumentHost either: DocsCanvas arrives through React.lazy', () => {
    expect(eagerIn(fromHost)).toEqual([]);
    expect(readFileSync(join(SRC, 'components/documents/DocumentHost.tsx'), 'utf8')).toMatch(/lazy\(\(\) => import\('\.\/DocsCanvas'\)\)/);
  });

  it('reaches none from the file manager, which opens Docs files through DocumentHost', () => {
    expect([...fromFileManager.keys()].map((f: string) => relative(SRC, f))).toContain('components/file-manager/DocsFileScreen.tsx');
    expect(eagerIn(fromFileManager)).toEqual([]);
  });

  it('reads type-only imports as erased and value imports as edges', () => {
    expect(staticImports("import type { A } from './a';\nimport { B } from './b';\nexport { C } from './c';")).toEqual(['./b', './c']);
  });
});
