/**
 * The one test double in the ribbon suite: an editor that records the commands it is sent and
 * reports whatever state a test gives it. The real EditorController needs the cdoc worker and
 * its editor kinds, which land with the editor wiring; it is the ribbon's only collaborator,
 * and the ribbon talks to it only through the `RibbonEditor` slice, so this stands in exactly
 * there and nowhere else. When the wiring merges, an InProcessCdocClient-backed test drives the
 * same ribbon against the real engine. The polish harness uses it too, to give the real
 * ribbon an editor in a browser.
 */
import type { CaretFormatting, EditorCommand, EditorEventName, EditorEvents, EditorPosition, EditorState } from '@/lib/cdoc/editor/controller';
import type { RibbonEditor } from '../editor-context';

const NOWHERE: EditorPosition = new Uint8Array([0, 0]) as EditorPosition;

export function editorState(caretFormatting: CaretFormatting, overrides: Partial<EditorState> = {}): EditorState {
  return {
    anchor: NOWHERE, head: NOWHERE, caret: null, selectionRects: [], caretPage: 0, pageCount: 1, composing: false, caretFormatting, ...overrides,
  };
}

type Listener = (payload: never) => void;

export class FakeEditor implements RibbonEditor {
  state: EditorState;
  readonly sent: EditorCommand[] = [];
  focused: number = 0;
  private readonly listeners: Map<EditorEventName, Set<Listener>> = new Map<EditorEventName, Set<Listener>>();
  private refusal: string | null = null;
  /** The images handed over, when this editor takes image bytes. */
  readonly images: { readonly bytes: Uint8Array; readonly mime: string }[] = [];
  addImage?: (bytes: Uint8Array, mime: string) => Promise<string>;

  /** `takesImages`: whether it offers addImage, as the controller will once the engine can. */
  constructor(caretFormatting: CaretFormatting, takesImages: boolean) {
    this.state = editorState(caretFormatting);
    if (takesImages) {
      this.addImage = (bytes: Uint8Array, mime: string): Promise<string> => {
        this.images.push({ bytes, mime });
        return Promise.resolve(`image-${this.images.length}`);
      };
    }
  }

  execute(command: EditorCommand): Promise<EditorState> {
    this.sent.push(command);
    const refusal: string | null = this.refusal;
    this.refusal = null;
    return refusal === null ? Promise.resolve(this.state) : Promise.reject(new Error(refusal));
  }

  focus(): void {
    this.focused += 1;
  }

  on<E extends EditorEventName>(event: E, listener: (payload: EditorEvents[E]) => void): () => void {
    const set: Set<Listener> = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(event, set);
    return (): void => { set.delete(listener as Listener); };
  }

  /** The next command is refused with `message`, as the engine refuses one that does not apply. */
  refuseNext(message: string): void {
    this.refusal = message;
  }

  /** Moves the caret: replaces the state and emits `selection`, as the controller does. */
  report(next: EditorState): void {
    this.state = next;
    for (const listener of this.listeners.get('selection') ?? []) (listener as (s: EditorState) => void)(next);
  }
}
