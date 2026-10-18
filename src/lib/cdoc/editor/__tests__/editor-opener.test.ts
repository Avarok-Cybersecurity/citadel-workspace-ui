/**
 * Replicas: each open is a new CRDT client id drawn from the random source, read back from
 * the real engine's own awareness record. And garbage collection either runs in the engine or
 * says it cannot, never a silent success.
 */
import { describe, expect, it } from 'vitest';
import { inProcessRuntime, type TestRuntime } from '../../__tests__/wasm-rig';
import { createEditorOpener, newReplicaId } from '../editor-opener';
import type { EditorSession } from '../editor-session';
import type { EditorOrigin } from '../controller';
import { decodeAwareness } from '../wire/decode-records';

/** A deterministic source standing in for crypto.getRandomValues: the id it yields is known. */
function counting(): (bytes: Uint8Array) => Uint8Array {
  let next: number = 1;
  return (bytes: Uint8Array): Uint8Array => bytes.map((): number => next++ & 0xff);
}

describe('the editor opener', () => {
  it('reads 64 bits big-endian from the random source', () => {
    expect(newReplicaId(counting())).toBe(0x0102030405060708n);
    expect(newReplicaId((b: Uint8Array): Uint8Array => b.fill(0xff))).toBe(0xffff_ffff_ffff_ffffn);
  });

  it('refuses a source that did not fill eight bytes', () => {
    expect(() => newReplicaId((): Uint8Array => new Uint8Array(4))).toThrow(/8 bytes/);
  });

  it('opens every replica with a fresh client id, which the engine then reports as its own', async () => {
    const runtime: TestRuntime = inProcessRuntime('worker');
    const open: (from: EditorOrigin) => Promise<EditorSession> = createEditorOpener({ client: runtime.client, renderer: runtime.renderer }, counting());
    const first: EditorSession = await open({ blank: true });
    const firstId: bigint = decodeAwareness(await first.awareness()).client;
    const second: EditorSession = await open({ blank: true });
    const secondId: bigint = decodeAwareness(await second.awareness()).client;
    expect(firstId).toBe(0x0102030405060708n);
    expect(secondId).toBe(0x090a0b0c0d0e0f10n);
  });

  // The vendored cdoc-edit has no EditorHandle.gc yet (it arrives with the caret-state
  // release); when it does, this turns red and becomes the test that gc ran.
  it('fails, saying so, when the binary cannot collect garbage', async () => {
    const runtime: TestRuntime = inProcessRuntime('worker');
    const editor: EditorSession = await createEditorOpener({ client: runtime.client, renderer: runtime.renderer }, counting())({ blank: true });
    await editor.execute({ name: 'insertText', text: 'tomb' });
    await editor.execute({ name: 'deleteBackward', unit: 'word' });
    await expect(editor.collectGarbage()).rejects.toThrow(/cannot collect garbage \(EditorHandle\.gc is missing\)/);
  });
});
