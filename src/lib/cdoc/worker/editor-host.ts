/**
 * The editor half of the worker host: answers the editor kinds from the open EditorEngine.
 * CdocHost owns the session's lifetime (opening one replaces any other document) and the
 * painter; this module only maps requests onto the engine, one call each.
 */
import type { CdocEngine } from '../engine/cdoc-engine';
import type { EditorEngine } from '../engine/editor-engine';
import type { EditorRequestBody, EditorResults } from './editor-protocol';

export type EditorSessionRequest = Exclude<EditorRequestBody, { kind: 'editorOpen' } | { kind: 'invalidatePages' }>;

export async function openEditor(engine: CdocEngine, req: Extract<EditorRequestBody, { kind: 'editorOpen' }>): Promise<{ readonly editor: EditorEngine; readonly result: EditorResults['editorOpen'] }> {
  const editor: EditorEngine = await engine.openEditor(req.client, req.from);
  const awareness: Uint8Array = editor.awareness();
  // The opening caret and selection: this replica's own awareness, mapped as a peer's would be.
  const view: Uint8Array = editor.peerView(awareness.slice());
  return { editor, result: { pageSizes: editor.pageSizes(), awareness, view } };
}

export function serveEditor(editor: EditorEngine, req: EditorSessionRequest): EditorResults[EditorSessionRequest['kind']] {
  switch (req.kind) {
    case 'apply': return { result: editor.request(req.record) };
    case 'applyRemote': return { result: editor.applyRemote(req.update) };
    case 'hitTest': return { position: editor.hitTest(req.page, req.x, req.y) };
    case 'snapshot': return { snapshot: editor.snapshot() };
    case 'awareness': return { record: editor.awareness() };
    case 'peerView': return { record: editor.peerView(req.record) };
    case 'pageSizes': return { pageSizes: editor.pageSizes() };
    case 'gc':
      editor.collectGarbage();
      return { collected: true };
    case 'addImage': return { contentId: editor.addImage(req.bytes, req.mime) };
  }
}
