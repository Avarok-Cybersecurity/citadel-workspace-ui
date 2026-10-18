/**
 * Renders the real DocsRibbon over a FakeEditor, with the app's real Toaster so a refused
 * command's message is read off the screen. Environment values are fixed so tests can name
 * the exact ids and dates a command carries.
 */
import { render, type RenderResult } from '@testing-library/react';
import { Toaster } from '@/components/ui/sonner';
import type { ActionGate } from '@/hooks/use-permission-result';
import { DocsRibbon } from '../DocsRibbon';
import { EditorControllerContext } from '../editor-context';
import type { RibbonEnvironment } from '../ribbon-environment';
import type { FakeEditor } from './fake-editor';

export const FIXED_ENVIRONMENT: RibbonEnvironment = {
  newCommentId: (): string => 'comment-1',
  newFootnoteId: (): number => 7,
  now: (): string => '2026-10-17T12:00:00.000Z',
  // jsdom has no Blob.arrayBuffer; FileReader reads the same bytes.
  readBytes: (file: Blob): Promise<Uint8Array> => new Promise((resolve: (bytes: Uint8Array) => void, reject: (error: unknown) => void): void => {
    const reader: FileReader = new FileReader();
    reader.onload = (): void => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = (): void => reject(reader.error);
    reader.readAsArrayBuffer(file);
  }),
  // jsdom decodes no images: every picture reads as 800 × 600 px.
  imageSize: (): Promise<{ width: number; height: number }> => Promise.resolve({ width: 800, height: 600 }),
  modifier: 'Ctrl',
};

export const MAY_EDIT: ActionGate = { enabled: true, reason: null };

export interface RibbonSetup {
  readonly editor: FakeEditor | null;
  readonly edit: ActionGate;
  readonly commentAuthor: string | null;
}

export function renderRibbon({ editor, edit, commentAuthor }: RibbonSetup): RenderResult {
  return render(
    <EditorControllerContext.Provider value={editor}>
      <DocsRibbon edit={edit} commentAuthor={commentAuthor} environment={FIXED_ENVIRONMENT} />
      <Toaster />
    </EditorControllerContext.Provider>,
  );
}
