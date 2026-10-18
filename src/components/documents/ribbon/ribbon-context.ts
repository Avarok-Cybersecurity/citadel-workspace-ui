/**
 * What every ribbon control reads: whether commands can run (and if not, why), the caret's
 * formatting, the environment, and whether groups are collapsed for a phone. One runner sends
 * every command, so a rejection is always shown and focus always returns to the document.
 */
import { createContext, useContext, useMemo, type Context } from 'react';
import { toast } from 'sonner';
import type { CaretFormatting, EditorCommand, EditorState } from '@/lib/cdoc/editor/controller';
import type { ActionGate } from '@/hooks/use-permission-result';
import { describeError } from '@/lib/describe-error';
import type { RibbonEditor } from './editor-context';
import type { RibbonEnvironment } from './ribbon-environment';

export interface Ribbon {
  /** Why no command can run now, or null when they can. */
  readonly disabledReason: string | null;
  readonly caret: CaretFormatting;
  readonly environment: RibbonEnvironment;
  /** Groups collapse into one button each (phone width). */
  readonly compact: boolean;
  /** Sends `command`; `what` completes "Could not …" if the editor refuses it. */
  run(command: EditorCommand, what: string): Promise<void>;
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

export function useRibbonValue(editor: RibbonEditor | null, state: EditorState | null, edit: ActionGate, environment: RibbonEnvironment, compact: boolean): Ribbon {
  return useMemo((): Ribbon => {
    const disabledReason: string | null = reasonFor(editor, state, edit);
    return {
      disabledReason,
      caret: state?.caretFormatting ?? UNKNOWN,
      environment,
      compact,
      run: async (command: EditorCommand, what: string): Promise<void> => {
        if (editor === null || disabledReason !== null) return;
        try {
          await editor.execute(command);
        } catch (error: unknown) {
          toast.error(`Could not ${what}. ${describeError(error)}`);
        } finally {
          editor.focus();
        }
      },
      returnFocus: (): void => editor?.focus(),
    };
  }, [editor, state, edit, environment, compact]);
}
