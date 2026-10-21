/**
 * The few facts about a wasm binary that `WebAssembly.Module.imports/exports` do not report: whether
 * there is a start section, whether the module defines a memory of its own, and each imported
 * memory's limits (shared, 64-bit, min, max). Read straight from the bytes, bounds-checked; any
 * malformation throws, and inspect.ts turns that into a refusal.
 */

export type ImportKind = 'function' | 'table' | 'memory' | 'global' | 'tag';

export interface MemoryLimits {
  readonly minPages: number;
  readonly maxPages: number | null;
  readonly shared: boolean;
  readonly memory64: boolean;
}

export interface BinaryImport {
  readonly module: string;
  readonly name: string;
  readonly kind: ImportKind;
  /** Only for kind 'memory'. */
  readonly memory: MemoryLimits | null;
}

export interface BinaryFacts {
  readonly imports: readonly BinaryImport[];
  readonly hasStart: boolean;
  readonly definesMemory: boolean;
}

const SECTION = { import: 2, memory: 5, start: 8 } as const;
const KINDS: readonly ImportKind[] = ['function', 'table', 'memory', 'global', 'tag'];

class Reader {
  private at: number;
  constructor(private readonly bytes: Uint8Array, start: number, private readonly end: number) {
    this.at = start;
  }

  get done(): boolean {
    return this.at >= this.end;
  }

  get offset(): number {
    return this.at;
  }

  skip(n: number): void {
    if (this.at + n > this.end) throw new Error('wasm: section past the end');
    this.at += n;
  }

  byte(): number {
    if (this.at >= this.end) throw new Error('wasm: unexpected end');
    return this.bytes[this.at++];
  }

  /** An unsigned LEB128 of up to 64 bits, as a number (exact up to 2^53, which bounds every limit here). */
  uleb(): number {
    let result: number = 0;
    let scale: number = 1;
    for (let i: number = 0; i < 10; i++) {
      const b: number = this.byte();
      result += (b & 0x7f) * scale;
      if ((b & 0x80) === 0) return result;
      scale *= 128;
    }
    throw new Error('wasm: LEB128 too long');
  }

  name(): string {
    const len: number = this.uleb();
    if (this.at + len > this.end) throw new Error('wasm: name past the end');
    const s: string = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(this.at, this.at + len));
    this.at += len;
    return s;
  }

  limits(): MemoryLimits {
    const flags: number = this.uleb();
    if ((flags & ~0x07) !== 0) throw new Error(`wasm: unknown limits flags ${flags}`);
    const minPages: number = this.uleb();
    const maxPages: number | null = (flags & 0x01) !== 0 ? this.uleb() : null;
    return { minPages, maxPages, shared: (flags & 0x02) !== 0, memory64: (flags & 0x04) !== 0 };
  }
}

function readImports(r: Reader): BinaryImport[] {
  const count: number = r.uleb();
  const out: BinaryImport[] = [];
  for (let i: number = 0; i < count; i++) {
    const module: string = r.name();
    const name: string = r.name();
    const kindByte: number = r.byte();
    const kind: ImportKind | undefined = KINDS[kindByte];
    if (kind === undefined) throw new Error(`wasm: unknown import kind ${kindByte}`);
    let memory: MemoryLimits | null = null;
    if (kind === 'function') r.uleb();
    else if (kind === 'table') { r.byte(); r.limits(); }
    else if (kind === 'memory') memory = r.limits();
    else if (kind === 'global') { r.byte(); r.byte(); }
    else { r.byte(); r.uleb(); }
    out.push({ module, name, kind, memory });
  }
  if (!r.done) throw new Error('wasm: import section has trailing bytes');
  return out;
}

export function readBinaryFacts(bytes: Uint8Array): BinaryFacts {
  const magic: readonly number[] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  if (bytes.byteLength < 8 || magic.some((b: number, i: number) => bytes[i] !== b)) throw new Error('wasm: not a version-1 module');
  const top: Reader = new Reader(bytes, 8, bytes.byteLength);
  let imports: BinaryImport[] = [];
  let hasStart: boolean = false;
  let definesMemory: boolean = false;
  while (!top.done) {
    const id: number = top.byte();
    const size: number = top.uleb();
    const start: number = top.offset;
    if (start + size > bytes.byteLength) throw new Error('wasm: section past the end');
    const body: Reader = new Reader(bytes, start, start + size);
    if (id === SECTION.import) imports = readImports(body);
    else if (id === SECTION.start) hasStart = true;
    else if (id === SECTION.memory) definesMemory = body.uleb() > 0;
    top.skip(size);
  }
  return { imports, hasStart, definesMemory };
}
