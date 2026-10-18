/**
 * Real replicas: the production EditorSession over the production worker host, engine and
 * vendored cdoc wasm, in process (InProcessCdocClient: everything but the thread hop). Each
 * replica gets a runtime of its own, as each tab has a worker of its own.
 *
 * Every replica opens on one shared base. Two replicas opened `{ kind: 'blank' }` independently
 * do NOT converge on this binary: each blank's structure is authored by its own client id, so
 * one replica's edits name items the other never had. `baseSnapshot` is one blank replica's
 * snapshot, which tests store in the log (KernelLog.seedBase) before anyone opens.
 */
import { inProcessRuntime, type TestRuntime } from '../../../__tests__/wasm-rig';
import type { EditorOrigin } from '../../../editor/controller';
import { createEditorOpener } from '../../../editor/editor-opener';
import type { EditorSession } from '../../../editor/editor-session';

export interface ReplicaSource<R> {
  readonly open: (from: EditorOrigin) => Promise<R>;
  readonly opened: R[];
  readonly sources: EditorOrigin[];
}

let draws: number = 0;

/** Distinct, known ids: a counter, standing in for crypto.getRandomValues. */
function counter(): (bytes: Uint8Array) => Uint8Array {
  return (bytes: Uint8Array): Uint8Array => bytes.map((): number => (draws += 1) & 0xff);
}

export function realReplicas(): ReplicaSource<EditorSession> {
  const opened: EditorSession[] = [];
  const sources: EditorOrigin[] = [];
  const open = async (from: EditorOrigin): Promise<EditorSession> => {
    const runtime: TestRuntime = inProcessRuntime('worker');
    const editor: EditorSession = await createEditorOpener({ client: runtime.client, renderer: runtime.renderer }, counter())(from);
    opened.push(editor);
    sources.push(from);
    return editor;
  };
  return { open, opened, sources };
}

export async function baseSnapshot(): Promise<Uint8Array> {
  const replica: EditorSession = await realReplicas().open({ kind: 'blank' });
  const bytes: Uint8Array = await replica.snapshot();
  replica.dispose();
  return bytes;
}

/** Types `text` one keystroke at a time: one local update each. */
export async function typeInto(editor: EditorSession, text: string): Promise<void> {
  for (const ch of text) await editor.execute({ name: 'insertText', text: ch });
}

/** The replica's text is in its snapshot's text section, as UTF-8. */
export async function snapshotText(editor: EditorSession): Promise<string> {
  return new TextDecoder('utf-8', { fatal: false }).decode(await editor.snapshot());
}
