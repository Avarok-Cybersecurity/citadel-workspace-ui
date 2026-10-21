/**
 * The load verdict: a module that steps outside the ABI is refused before it is instantiated.
 * Each hostile module is the clean one with exactly one thing changed, and the clean module loading
 * is the control that makes each refusal mean something.
 */
import { describe, expect, it } from 'vitest';
import { ABI_NAMESPACE } from '../abi';
import type { Capability } from '../capabilities';
import { inspectArtifact, type LoadVerdict } from '../inspect';
import { appModule, type AppModuleOptions } from './app-fixtures';
import { I32, buildModule } from './wasm-builder';

const NONE: ReadonlySet<Capability> = new Set<Capability>();
const MAX_PAGES = 64;

const verdict = (options: AppModuleOptions, declared: ReadonlySet<Capability> = NONE): Promise<LoadVerdict> =>
  inspectArtifact(appModule(options), declared, MAX_PAGES);

const refusal = async (options: AppModuleOptions, declared: ReadonlySet<Capability> = NONE): Promise<string> => {
  const v: LoadVerdict = await verdict(options, declared);
  if (v.ok) throw new Error('expected a refusal; the module loaded');
  return v.refusal.code;
};

describe('the clean module (control)', () => {
  it('loads, with its memory limits and whether it has a frame export', async () => {
    const v: LoadVerdict = await verdict({ groups: ['canvas', 'log'], frame: [] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.memory).toEqual({ minPages: 1, maxPages: 16 });
    expect(v.hasFrame).toBe(true);
    expect(v.module).toBeInstanceOf(WebAssembly.Module);
  });

  it('loads with every intrinsic group and a declared one', async () => {
    const v: LoadVerdict = await verdict({ groups: ['canvas', 'ui', 'events', 'navigate', 'log', 'net'] }, new Set<Capability>(['net.server']));
    expect(v.ok).toBe(true);
  });
});

describe('hostile modules are refused at load', () => {
  it('importing env.fetch', async () => {
    expect(await refusal({ extraImports: [{ module: 'env', name: 'fetch', kind: 'func', params: [I32, I32, I32], results: [I32] }] })).toBe('foreign_import');
  });

  it('importing WASI', async () => {
    const fdWrite = { module: 'wasi_snapshot_preview1', name: 'fd_write', kind: 'func', params: [I32, I32, I32], results: [I32] } as const;
    expect(await refusal({ extraImports: [fdWrite] })).toBe('foreign_import');
  });

  it('importing a name that is not in the ABI, inside the namespace', async () => {
    expect(await refusal({ extraImports: [{ module: ABI_NAMESPACE, name: 'eval', kind: 'func', params: [I32, I32, I32], results: [I32] }] })).toBe('unknown_import');
  });

  it('importing a group its manifest does not declare (net without a network capability)', async () => {
    expect(await refusal({ groups: ['net'] })).toBe('undeclared_group');
    // Control: the same module with the capability declared loads.
    expect((await verdict({ groups: ['net'] }, new Set<Capability>(['net.host']))).ok).toBe(true);
  });

  it('importing a global from the namespace', async () => {
    expect(await refusal({ extraImports: [{ module: ABI_NAMESPACE, name: 'log', kind: 'global' }] })).toBe('import_kind');
  });

  it('with a start function', async () => {
    expect(await refusal({ start: true })).toBe('start_function');
  });

  it('with shared memory', async () => {
    expect(await refusal({ memory: { min: 1, max: 16, shared: true } })).toBe('shared_memory');
  });

  it('without the imported memory (defining its own)', async () => {
    expect(await refusal({ memory: 'none' })).toBe('no_memory_import');
  });

  it('asking for more initial memory than the host maximum', async () => {
    expect(await refusal({ memory: { min: MAX_PAGES + 1 } })).toBe('memory_too_large');
  });

  for (const name of ['app_alloc', 'app_free', 'app_init', 'app_event']) {
    it(`lacking the required export ${name}`, async () => {
      expect(await refusal({ omitExports: [name] })).toBe('missing_export');
    });
  }

  it('bytes that are not a wasm module', async () => {
    const v: LoadVerdict = await inspectArtifact(new TextEncoder().encode('<script>alert(1)</script>'), NONE, MAX_PAGES);
    expect(v.ok ? 'loaded' : v.refusal.code).toBe('not_wasm');
  });

  it('a module with no imports at all', async () => {
    const bare: Uint8Array = buildModule({ imports: [], funcs: [{ export: 'app_init', params: [I32, I32], results: [I32], body: [0x41, 0x00] }] });
    expect((await inspectArtifact(bare, NONE, MAX_PAGES)).ok).toBe(false);
  });
});
