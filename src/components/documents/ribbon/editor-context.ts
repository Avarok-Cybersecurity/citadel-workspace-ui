/**
 * Where the ribbons find the editor. The editor wiring provides its EditorController here
 * (`<EditorControllerContext.Provider value={controller}>`); until it does the ribbons render
 * disabled, saying the document is still opening. The ribbons need only this slice of the
 * controller, so nothing about collaboration or hit-testing reaches them.
 */
import { createContext, useCallback, useContext, useSyncExternalStore, type Context } from 'react';
import type { EditorController, EditorState } from '@/lib/cdoc/editor/controller';

/**
 * Hands an image's bytes to the editor, which stores them and answers the content id an
 * InsertImage names (cdoc-edit's `add_image`, worker kind `addImage`). Not yet on the
 * controller: until it is, the Picture control is not offered at all.
 */
export interface ImageInsertion {
  addImage(bytes: Uint8Array, mime: string): Promise<string>;
}

export type RibbonEditor = Pick<EditorController, 'state' | 'execute' | 'focus' | 'on'> & Partial<ImageInsertion>;

export const EditorControllerContext: Context<RibbonEditor | null> = createContext<RibbonEditor | null>(null);

export function useEditorController(): RibbonEditor | null {
  return useContext(EditorControllerContext);
}

const NO_SUBSCRIPTION: () => void = (): void => undefined;

/** The editor's state, re-read on every `selection` event; null with no editor. */
export function useEditorState(editor: RibbonEditor | null): EditorState | null {
  const subscribe: (onChange: () => void) => () => void = useCallback(
    (onChange: () => void): (() => void) => (editor === null ? NO_SUBSCRIPTION : editor.on('selection', onChange)),
    [editor],
  );
  return useSyncExternalStore(subscribe, (): EditorState | null => editor?.state ?? null);
}
