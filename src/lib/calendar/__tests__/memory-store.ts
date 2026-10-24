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
  /**
   * `values` may be shared by several members' stores, as the kernel's KV is one store: each
   * member's own `user` keys stay theirs (`user:<me>|key`), every node key is everyone's.
   */
  constructor(private readonly me: string, readonly values: Map<string, Uint8Array> = new Map()) {}

  /** Where a key lives; an authored write lands under the signed-in member, as the kernel stamps it. */
  where(backend: KvBackend, key: string, writing: boolean): string {
    if (backend === 'user') return `user:${this.me}|${key}`;
    if (typeof backend === 'string') return `${backend}|${key}`;
    if ('node' in backend) return `node:${backend.node.node_id}|${key}`;
    const author: string | null = writing ? this.me : backend.node_authored.author;
    return `authored:${backend.node_authored.node_id}:${author ?? ''}|${key}`;
  }

  put(backend: KvBackend, key: string, value: Uint8Array): void {
    this.values.set(this.where(backend, key, true), value);
  }

  /** A write naming another author is refused, as the kernel refuses it (`authored_namespace`, policy `author`). */
  private foreign(backend: KvBackend): boolean {
    return typeof backend === 'object' && 'node_authored' in backend && backend.node_authored.author !== null && backend.node_authored.author !== this.me;
  }

  /**
   * The same port answering on a later turn, as the kernel does over the network, so two callers'
   * reads and writes can interleave (a race a synchronous fake can never show).
   */
  slowPort(): StoragePort {
    const fast: StoragePort = this.port();
    const later = <A, R>(op: (args: A) => R) => (args: A): Promise<R> =>
      new Promise<R>((answer: (r: R) => void): void => { setTimeout((): void => answer(op(args)), 0); });
    return {
      KvGet: later(fast.KvGet), KvSet: later(fast.KvSet), KvSetMany: later(fast.KvSetMany), KvDelete: later(fast.KvDelete),
      KvList: later(fast.KvList), KvListAuthored: later(fast.KvListAuthored),
    } as StoragePort;
  }

  port(): StoragePort {
    const page = <T>(all: T[], cursor: string | null): { items: T[]; next: string | null } => {
      const from: number = cursor === null ? 0 : Number(cursor);
      return { items: all.slice(from, from + PAGE), next: from + PAGE < all.length ? String(from + PAGE) : null };
    };
    return {
      KvGet: ({ backend, key }) => ({ ok: { value: this.values.get(this.where(backend, key, false)) ?? null } }),
      KvSet: ({ backend, key, value }) => {
        if (this.foreign(backend)) return { refused: { policy: 'author' } };
        this.put(backend, key, value);
        return { ok: null };
      },
      KvSetMany: ({ backend, entries }) => {
        if (this.foreign(backend)) return { refused: { policy: 'author' } };
        for (const e of entries) this.put(backend, e.key, e.value);
        return { ok: null };
      },
      KvDelete: ({ backend, key }) => {
        if (this.foreign(backend)) return { refused: { policy: 'author' } };
        this.values.delete(this.where(backend, key, true));
        return { ok: null };
      },
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
