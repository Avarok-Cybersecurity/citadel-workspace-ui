/**
 * The browser's load verdict for an app module: refused before instantiation unless it imports
 * only from `citadel_app_abi_1`, only names the ABI defines, only groups its manifest declares,
 * imports its memory (unshared, 32-bit, within the host maximum) and defines none, has no start
 * function, and exports the required functions. The Rust stream's native inspector applies the
 * same rules; the two must agree on every fixture.
 *
 * Two sources, cross-checked: the engine's `WebAssembly.Module.imports/exports` (authoritative for
 * names and kinds) and wasm-binary.ts (start section, memory flags, which the engine does not
 * report). If they disagree about the import list, the module is refused.
 */
import {
  ABI_MEMORY_IMPORT, ABI_NAMESPACE, ABI_OPTIONAL_EXPORTS, ABI_REPLY_LEN, ABI_REPLY_READ, ABI_REQUIRED_EXPORTS, isAbiGroup,
} from './abi';
import { declaredGroups, type Capability } from './capabilities';
import { readBinaryFacts, type BinaryFacts, type BinaryImport, type MemoryLimits } from './wasm-binary';

export type LoadRefusalCode =
  | 'not_wasm' | 'engine_disagrees' | 'foreign_import' | 'unknown_import' | 'undeclared_group' | 'import_kind'
  | 'no_memory_import' | 'own_memory' | 'shared_memory' | 'memory64' | 'memory_too_large'
  | 'start_function' | 'missing_export' | 'export_kind';

export interface LoadRefusal {
  readonly code: LoadRefusalCode;
  readonly detail: string;
}

export type LoadVerdict =
  | {
    readonly ok: true;
    readonly module: WebAssembly.Module;
    readonly memory: { readonly minPages: number; readonly maxPages: number | null };
    readonly hasFrame: boolean;
  }
  | { readonly ok: false; readonly refusal: LoadRefusal };

const refuse = (code: LoadRefusalCode, detail: string): LoadVerdict => ({ ok: false, refusal: { code, detail } });

function checkImport(imp: BinaryImport, groups: ReadonlySet<string>): LoadVerdict | null {
  const where: string = `${imp.module}.${imp.name}`;
  if (imp.module !== ABI_NAMESPACE) return refuse('foreign_import', where);
  if (imp.name === ABI_MEMORY_IMPORT) return imp.kind === 'memory' ? null : refuse('import_kind', where);
  if (imp.name !== ABI_REPLY_READ && imp.name !== ABI_REPLY_LEN && !isAbiGroup(imp.name)) return refuse('unknown_import', where);
  if (imp.kind !== 'function') return refuse('import_kind', where);
  if (isAbiGroup(imp.name) && !groups.has(imp.name)) return refuse('undeclared_group', imp.name);
  return null;
}

function checkMemory(limits: MemoryLimits | null, hostMaxPages: number): LoadVerdict | null {
  if (limits === null) return refuse('no_memory_import', `${ABI_NAMESPACE}.${ABI_MEMORY_IMPORT}`);
  if (limits.shared) return refuse('shared_memory', 'the imported memory is shared');
  if (limits.memory64) return refuse('memory64', 'the imported memory is 64-bit');
  if (limits.minPages > hostMaxPages) return refuse('memory_too_large', `asks for ${limits.minPages} pages; the host allows ${hostMaxPages}`);
  return null;
}

function sameImports(facts: BinaryFacts, engine: readonly WebAssembly.ModuleImportDescriptor[]): boolean {
  if (facts.imports.length !== engine.length) return false;
  return facts.imports.every((imp: BinaryImport, i: number) =>
    imp.module === engine[i].module && imp.name === engine[i].name && imp.kind === engine[i].kind);
}

/** The verdict for a compiled module and its bytes. */
export function inspectModule(
  bytes: Uint8Array,
  module: WebAssembly.Module,
  declared: ReadonlySet<Capability>,
  hostMaxPages: number,
): LoadVerdict {
  let facts: BinaryFacts;
  try {
    facts = readBinaryFacts(bytes);
  } catch (error: unknown) {
    return refuse('not_wasm', error instanceof Error ? error.message : String(error));
  }
  if (!sameImports(facts, WebAssembly.Module.imports(module))) return refuse('engine_disagrees', 'the import lists differ');
  const groups: ReadonlySet<string> = declaredGroups(declared);
  let memory: MemoryLimits | null = null;
  for (const imp of facts.imports) {
    const bad: LoadVerdict | null = checkImport(imp, groups);
    if (bad !== null) return bad;
    if (imp.kind === 'memory') memory = imp.memory;
  }
  const badMemory: LoadVerdict | null = checkMemory(memory, hostMaxPages);
  if (badMemory !== null) return badMemory;
  if (memory === null) return refuse('no_memory_import', ABI_MEMORY_IMPORT);
  if (facts.definesMemory) return refuse('own_memory', 'the module defines a memory of its own');
  if (facts.hasStart) return refuse('start_function', 'the module has a start function');
  const exports: Map<string, string> = new Map(WebAssembly.Module.exports(module).map((e) => [e.name, e.kind]));
  for (const name of ABI_REQUIRED_EXPORTS) {
    const kind: string | undefined = exports.get(name);
    if (kind === undefined) return refuse('missing_export', name);
    if (kind !== 'function') return refuse('export_kind', name);
  }
  for (const name of ABI_OPTIONAL_EXPORTS) {
    const kind: string | undefined = exports.get(name);
    if (kind !== undefined && kind !== 'function') return refuse('export_kind', name);
  }
  return { ok: true, module, memory: { minPages: memory.minPages, maxPages: memory.maxPages }, hasFrame: exports.has('app_frame') };
}

/** Compiles (never instantiates) and inspects. Bytes the engine cannot compile are `not_wasm`. */
export async function inspectArtifact(bytes: Uint8Array, declared: ReadonlySet<Capability>, hostMaxPages: number): Promise<LoadVerdict> {
  let module: WebAssembly.Module;
  try {
    module = await WebAssembly.compile(new Uint8Array(bytes));
  } catch (error: unknown) {
    return refuse('not_wasm', error instanceof Error ? error.message : String(error));
  }
  return inspectModule(bytes, module, declared, hostMaxPages);
}
