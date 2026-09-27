/**
 * The server relay's wire (RelayTransport) for one document in one office or room chat.
 *
 * Updates travel as base64 (the kernel's `LiveDocUpdate.update`); remote updates are the
 * `livedoc:updated` broadcasts the response router emits, filtered to this document. An update
 * this member sent comes back in that broadcast too, and the provider drops it by its number.
 */
import { eventEmitter } from '@/lib/event-emitter';
import type { LiveDocSnapshot } from '@/lib/workspace-service/live-doc-operations';
import type { RelayTransport } from './relay-provider';

/** The two calls the transport needs; the workspace service is the real one. */
export interface LiveDocApi {
  openLiveDoc(groupId: string, docId: string): Promise<LiveDocSnapshot>;
  sendLiveDocUpdate(groupId: string, docId: string, update: string): Promise<number>;
}

export function toBase64(bytes: Uint8Array): string {
  let binary: string = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary: string = atob(text);
  const out: Uint8Array = new Uint8Array(binary.length);
  for (let i: number = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

interface Broadcast { group_id: string; doc_id: string; seq: number; update: string }

function isBroadcast(value: unknown): value is Broadcast {
  if (typeof value !== 'object' || value === null) return false;
  const v: Record<string, unknown> = value as Record<string, unknown>;
  return typeof v.group_id === 'string' && typeof v.doc_id === 'string'
    && typeof v.seq === 'number' && typeof v.update === 'string';
}

export function relayTransport(api: LiveDocApi, groupId: string, docId: string): RelayTransport {
  return {
    open: async (): Promise<{ seq: number; state: Uint8Array }> => {
      const { seq, state }: LiveDocSnapshot = await api.openLiveDoc(groupId, docId);
      return { seq, state: fromBase64(state) };
    },
    send: (update: Uint8Array): Promise<number> => api.sendLiveDocUpdate(groupId, docId, toBase64(update)),
    onRemote: (listener: (seq: number, update: Uint8Array) => void): (() => void) => {
      const handler = (payload: unknown): void => {
        if (isBroadcast(payload) && payload.group_id === groupId && payload.doc_id === docId) {
          listener(payload.seq, fromBase64(payload.update));
        }
      };
      eventEmitter.on('livedoc:updated', handler);
      return (): void => eventEmitter.off('livedoc:updated', handler);
    },
  };
}
