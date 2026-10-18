/**
 * What every ribbon control reads: whether commands can run (and if not, why), the caret's
 * formatting, the environment, and whether groups are collapsed for a phone. One runner sends
 * every command, so a rejection is always shown and focus always returns to the document.
 */
import { createContext, useContext, useMemo, useState, type Context } from 'react';
import { toast } from 'sonner';
import type { AddedImage, CaretFormatting, EditorCommand, EditorState } from '@/lib/cdoc/editor/controller';
import type { ActionGate } from '@/hooks/use-permission-result';
import { describeError } from '@/lib/describe-error';
import type { RibbonEditor } from './editor-context';
import type { RibbonEnvironment } from './ribbon-environment';

export interface Ribbon {
  /** The last refusal, kept in the ribbon's status line until a later command succeeds. */
  readonly failure: string | null;
  /** Why no command can run now, or null when they can. */
  readonly disabledReason: string | null;
  readonly caret: CaretFormatting;
  readonly environment: RibbonEnvironment;
  /** Groups collapse into one button each (phone width). */
  readonly compact: boolean;
  /** Sends `command`; `what` completes "Could not …" if the editor refuses it. */
  run(command: EditorCommand, what: string): Promise<void>;
  /** Runs `work` the way `run` runs a command: a failure is shown, and focus returns after. */
  attempt(what: string, work: () => Promise<unknown>): Promise<void>;
  /** Hands a picture file of at most `maxBytes` to the editor, which reads its type and pixel size. */
  addImage(bytes: Uint8Array, maxBytes: number): Promise<AddedImage>;
  /** Hands keyboard focus back to the document, e.g. after a dialog closes with nothing done. */
  returnFocus(): void;
}

export const RibbonContext: Context<Ribbon | null> = createContext<Ribbon | null>(null);

export function useRibbon(): Ribbon {
  const ribbon: Ribbon | null = useContext(RibbonContext);
  if (ribbon === null) throw new Error('a ribbon control is rendered outside DocsRibbon');
  return ribbon;
}

const UNKNOWN: CaretFormatting = { known: false };

function reasonFor(editor: RibbonEditor | null, state: EditorState | null, edit: ActionGate): string | null {
  if (!edit.enabled) return edit.reason ?? 'You cannot edit this document.';
  if (editor === null || state === null) return 'The document is still opening.';
  if (state.composing) return 'Finish the text you are composing first.';
  return null;
}

/** How long a refusal's toast stays: long enough to read twice; the status line keeps it after. */
const REFUSAL_TOAST_MS: number = 8000;

export function useRibbonValue(editor: RibbonEditor | null, state: EditorState | null, edit: ActionGate, environment: RibbonEnvironment, compact: boolean): Ribbon {
  const [failure, setFailure] = useState<string | null>(null);
  return useMemo((): Ribbon => {
    const disabledReason: string | null = reasonFor(editor, state, edit);
    const attempt: (what: string, work: (live: RibbonEditor) => Promise<unknown>) => Promise<void> = async (what: string, work: (live: RibbonEditor) => Promise<unknown>): Promise<void> => {
      if (editor === null || disabledReason !== null) return;
      try {
        await work(editor);
        setFailure(null);
      } catch (error: unknown) {
        const message: string = `Could not ${what}. ${describeError(error)}`;
        // Finite, so on a phone it never sits over the ribbon for good; the status line keeps it.
        toast.error(message, { duration: REFUSAL_TOAST_MS });
        setFailure(message);
      } finally {
        editor.focus();
      }
    };
    return {
      failure,
      disabledReason,
      caret: state?.caretFormatting ?? UNKNOWN,
      environment,
      compact,
      run: (command: EditorCommand, what: string): Promise<void> => attempt(what, (live: RibbonEditor): Promise<EditorState> => live.execute(command)),
      attempt: (what: string, work: () => Promise<unknown>): Promise<void> => attempt(what, work),
      addImage: (bytes: Uint8Array, maxBytes: number): Promise<AddedImage> => {
        if (editor === null) return Promise.reject(new Error('the editor has not opened'));
        return editor.addImage(bytes, maxBytes);
      },
      returnFocus: (): void => editor?.focus(),
    };
  }, [editor, state, edit, environment, compact, failure]);
}
