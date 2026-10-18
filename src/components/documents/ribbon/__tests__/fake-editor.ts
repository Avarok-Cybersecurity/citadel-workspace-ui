/**
 * The one test double in the ribbon suite: an editor that records the commands it is sent and
 * reports whatever state a test gives it. The ribbon talks to the editor only through the
 * `RibbonEditor` slice, so this stands in exactly there. It exists because the real engine
 * cannot be made to report a chosen caret (mixed sets, a Heading 1 run) or to refuse on
 * demand; the-ribbon-drives-the-real-editor.test.tsx drives the same ribbon against the real
 * engine for the paths it can reach. The polish harness uses it too, to give the real ribbon
 * an editor in a browser page with no cdoc worker.
 */
import type { AddedImage, CaretFormatting, EditorCommand, EditorEventName, EditorEvents, EditorPosition, EditorState } from '@/lib/cdoc/editor/controller';
import type { KnownFormatting, ParagraphKey, RunKey } from '@/lib/cdoc/editor/caret-formatting';
import type { ParagraphProperties, RunPropertiesPatch } from '@/lib/cdoc/editor/model-values';
import type { RibbonEditor } from '../editor-context';

/** Formatting the engine reports, with direct values equal to the effective ones and nothing mixed unless named. */
export function knownCaret(
  run: RunPropertiesPatch,
  paragraph: ParagraphProperties,
  mixed: { readonly run?: readonly RunKey[]; readonly paragraph?: readonly ParagraphKey[] } = {},
): KnownFormatting {
  return {
    known: true, run, runDirect: run, paragraph, paragraphDirect: paragraph,
    runMixed: new Set<RunKey>(mixed.run ?? []), paragraphMixed: new Set<ParagraphKey>(mixed.paragraph ?? []),
  };
}

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
  /** The images handed to addImage, in order; each is answered `image-<n>`. */
  readonly images: { readonly bytes: Uint8Array; readonly maxBytes: number }[] = [];
  /** The pixel size addImage reports: a 4:3 picture wider than a column, so sizing scales it. */
  imagePixels: { readonly width: number; readonly height: number } = { width: 800, height: 600 };
  private imageRefusal: string | null = null;
  private imageHeld: Promise<void> | null = null;

  constructor(caretFormatting: CaretFormatting) {
    this.state = editorState(caretFormatting);
  }

  async addImage(bytes: Uint8Array, maxBytes: number): Promise<AddedImage> {
    this.images.push({ bytes, maxBytes });
    if (this.imageHeld !== null) await this.imageHeld;
    const refusal: string | null = this.imageRefusal;
    this.imageRefusal = null;
    if (refusal !== null) throw new Error(refusal);
    return { contentId: `image-${this.images.length}`, kind: 'png', ...this.imagePixels };
  }

  /** The next addImage is refused, as the engine refuses bytes that are not a picture. */
  refuseNextImage(message: string): void {
    this.imageRefusal = message;
  }

  /** addImage waits for `until`, so a test can see the picture control while it works. */
  holdImages(until: Promise<void>): void {
    this.imageHeld = until;
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
