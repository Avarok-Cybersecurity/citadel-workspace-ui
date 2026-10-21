/**
 * Reply handles for one instance. A handle is issued per host call, ready at once or pending until
 * its port answers, and is read exactly once: `reply_read` copies and releases it. Live handles
 * are capped, so a guest that never reads its replies cannot grow host memory without bound.
 */
import { ABI_ERR } from './abi';

type Slot = { readonly state: 'ready'; readonly bytes: Uint8Array } | { readonly state: 'pending' };

const MAX_HANDLE = 0x7fff_ffff;

export class ReplyTable {
  private readonly slots: Map<number, Slot> = new Map<number, Slot>();
  private next: number = 0;

  constructor(private readonly maxLive: number) {}

  get live(): number {
    return this.slots.size;
  }

  /** A handle for bytes that are ready now, or ABI_ERR.handlesExhausted. */
  ready(bytes: Uint8Array): number {
    return this.issue({ state: 'ready', bytes });
  }

  /** A handle whose reply arrives later through `resolve`, or ABI_ERR.handlesExhausted. */
  pending(): number {
    return this.issue({ state: 'pending' });
  }

  /** Fills a pending handle. False when the handle is not pending (released, or never issued). */
  resolve(handle: number, bytes: Uint8Array): boolean {
    if (this.slots.get(handle)?.state !== 'pending') return false;
    this.slots.set(handle, { state: 'ready', bytes });
    return true;
  }

  length(handle: number): number {
    const slot: Slot | undefined = this.slots.get(handle);
    if (slot === undefined) return ABI_ERR.unknownHandle;
    return slot.state === 'pending' ? ABI_ERR.pending : slot.bytes.byteLength;
  }

  /** Copies the reply into memory at ptr and releases the handle; returns the bytes copied. */
  read(handle: number, memory: WebAssembly.Memory, ptr: number, cap: number): number {
    const slot: Slot | undefined = this.slots.get(handle);
    if (slot === undefined) return ABI_ERR.unknownHandle;
    if (slot.state === 'pending') return ABI_ERR.pending;
    if (cap < slot.bytes.byteLength) return ABI_ERR.bufferTooSmall;
    if (!inBounds(memory, ptr, slot.bytes.byteLength)) return ABI_ERR.badRequest;
    new Uint8Array(memory.buffer, ptr, slot.bytes.byteLength).set(slot.bytes);
    this.slots.delete(handle);
    return slot.bytes.byteLength;
  }

  private issue(slot: Slot): number {
    if (this.slots.size >= this.maxLive) return ABI_ERR.handlesExhausted;
    do {
      this.next = this.next >= MAX_HANDLE ? 0 : this.next + 1;
    } while (this.slots.has(this.next));
    this.slots.set(this.next, slot);
    return this.next;
  }
}

/** Whether [ptr, ptr+len) lies inside the memory, with ptr and len as the guest's u32 values. */
export function inBounds(memory: WebAssembly.Memory, ptr: number, len: number): boolean {
  return Number.isInteger(ptr) && Number.isInteger(len) && ptr >= 0 && len >= 0 && ptr + len <= memory.buffer.byteLength;
}
