/**
 * Home › Clipboard: Cut, Copy and Paste (plain text), the operations in clipboard.ts. Cut and
 * Copy wait for a selection.
 */
import { ClipboardPaste, Copy, Scissors } from 'lucide-react';
import { copySelection, cutSelection, hasSelection, pasteClipboard } from './clipboard';
import type { RibbonEditor } from './editor-context';
import { RibbonButton } from './RibbonButton';
import { RibbonGroup } from './RibbonToolbar';
import { useRibbon, type Ribbon } from './ribbon-context';

const NOTHING_SELECTED: string = 'Select some text first.';

export function ClipboardGroup(): JSX.Element {
  const { attempt, environment, selection }: Ribbon = useRibbon();
  const nothing: string | null = selection === null || hasSelection(selection) ? null : NOTHING_SELECTED;
  return (
    <RibbonGroup label="Clipboard" testId="ribbon-clipboard" collapses={true} icon={ClipboardPaste}>
      <RibbonButton testId="ribbon-paste" label="Paste" icon={ClipboardPaste} shortcut={{ key: 'V' }}
        onPress={(): void => { void attempt('paste', (editor: RibbonEditor): Promise<void> => pasteClipboard(editor, environment)); }} />
      <RibbonButton testId="ribbon-cut" label="Cut" icon={Scissors} shortcut={{ key: 'X' }} unavailable={nothing}
        onPress={(): void => { void attempt('cut the selection', (editor: RibbonEditor): Promise<unknown> => cutSelection(editor, environment)); }} />
      <RibbonButton testId="ribbon-copy" label="Copy" icon={Copy} shortcut={{ key: 'C' }} unavailable={nothing}
        onPress={(): void => { void attempt('copy the selection', (editor: RibbonEditor): Promise<void> => copySelection(editor, environment)); }} />
    </RibbonGroup>
  );
}
