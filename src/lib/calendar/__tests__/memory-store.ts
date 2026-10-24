/**
 * TEST FAKE: the server's KV as one in-memory map, behind the storage port a glue instance calls,
 * so a test drives the Calendar's real ports and gate over a store it can fill and inspect. Keys
 * are held per backend (an authored key under its author), and lists answer one page at a time.
 */
import type { KvBackend } from '@/lib/citadel-apps/sdk/generated/KvBackend';
import type { AuthoredKey } from '@/lib/citadel-apps/sdk/generated/AuthoredKey';
import type { StoragePort } from '@/lib/citadel-apps/host/ports';

/** Small, so every multi-key test also crosses a page boundary. */
const PAGE: number = 2;

export class MemoryStore {
  readonly values: Map<string, Uint8Array> = new Map();

  constructor(private readonly me: string) {}

  /** Where a key lives; an authored write lands under the signed-in member, as the kernel stamps it. */
  where(backend: KvBackend, key: string, writing: boolean): string {
    if (typeof backend === 'string') return `${backend}|${key}`;
    if ('node' in backend) return `node:${backend.node.node_id}|${key}`;
    const author: string | null = writing ? this.me : backend.node_authored.author;
    return `authored:${backend.node_authored.node_id}:${author ?? ''}|${key}`;
  }

  put(backend: KvBackend, key: string, value: Uint8Array): void {
    this.values.set(this.where(backend, key, true), value);
  }

  port(): StoragePort {
    const page = <T>(all: T[], cursor: string | null): { items: T[]; next: string | null } => {
      const from: number = cursor === null ? 0 : Number(cursor);
      return { items: all.slice(from, from + PAGE), next: from + PAGE < all.length ? String(from + PAGE) : null };
    };
    return {
      KvGet: ({ backend, key }) => ({ ok: { value: this.values.get(this.where(backend, key, false)) ?? null } }),
      KvSet: ({ backend, key, value }) => { this.put(backend, key, value); return { ok: null }; },
      KvSetMany: ({ backend, entries }) => { for (const e of entries) this.put(backend, e.key, e.value); return { ok: null }; },
      KvDelete: ({ backend, key }) => { this.values.delete(this.where(backend, key, true)); return { ok: null }; },
      KvList: ({ backend, prefix, cursor }) => {
        const base: string = this.where(backend, '', false);
        const keys: string[] = [...this.values.keys()].filter((k) => k.startsWith(base + prefix)).map((k) => k.slice(base.length)).sort();
        const { items, next } = page(keys, cursor);
        return { ok: { keys: items, next } };
      },
      KvListAuthored: ({ node_id, prefix, cursor }) => {
        const head: string = `authored:${node_id}:`;
        const found: AuthoredKey[] = [...this.values.keys()].filter((k) => k.startsWith(head)).map((k) => {
          const [who, key] = k.slice(head.length).split('|') as [string, string];
          return { author: who, key };
        }).filter((e) => e.key.startsWith(prefix)).sort((a, b) => (a.author + a.key < b.author + b.key ? -1 : 1));
        const { items, next } = page(found, cursor);
        return { ok: { entries: items, next } };
      },
    };
  }
}
