/**
 * The title bar's save controls for an open document, Word-style: the AutoSave switch, where
 * the edits are (the one place the status is shown), and Save. Closing the page warns only
 * while some edits are neither acknowledged nor yet written to this device. Nothing renders
 * until the document's session is open.
 */
import { useEffect, useId, useSyncExternalStore, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { canSave, saveStatus, warnsOnUnload, type SaveInputs, type SaveStatus } from '@/lib/document-save/save-status';
import { SAVE_STATUS_TEXT } from '@/lib/document-save/save-status-text';
import type { SaveControl } from './save-control';

const useInputs = (control: SaveControl): SaveInputs | null => useSyncExternalStore(control.inputs.subscribe, control.inputs.get);

/** A refusal is the session's to report (as a notice); this is only an action that could not start. */
function attempt(action: Promise<void>, what: string): void {
  action.catch((error: unknown): void => { toast.error(`Could not ${what}. ${error instanceof Error ? error.message : String(error)}`); });
}

export function DocumentSaveControls({ control }: { readonly control: SaveControl }): JSX.Element | null {
  const inputs: SaveInputs | null = useInputs(control);
  const switchId: string = useId();
  const warns: boolean = inputs !== null && warnsOnUnload(inputs);
  useEffect((): (() => void) | undefined => {
    if (!warns) return undefined;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return (): void => window.removeEventListener('beforeunload', warn);
  }, [warns]);
  if (inputs === null) return null;
  const status: SaveStatus = saveStatus(inputs);
  return (
    <div className="ml-auto flex shrink-0 items-center gap-[12px]" data-testid="docs-save-controls">
      <div className="flex items-center gap-[8px]">
        <Switch id={switchId} checked={inputs.autoSave} data-testid="docs-autosave" onCheckedChange={(on: boolean): void => attempt(control.setAutoSave(on), 'change AutoSave')} />
        <label htmlFor={switchId} className="text-sm text-foreground">AutoSave</label>
      </div>
      {/* At phone width the words go to screen readers only; the switch and Save stay. */}
      <span role="status" data-testid="docs-save-status" data-status={status} className="text-sm text-muted-foreground max-[480px]:sr-only">
        {SAVE_STATUS_TEXT[status]}
      </span>
      <button
        type="button"
        data-testid="docs-save"
        disabled={!canSave(inputs)}
        onClick={(): void => attempt(control.save(), 'save')}
        className="min-h-[44px] min-w-[44px] rounded-md border border-border px-[12px] text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

/**
 * Ctrl/Cmd+S over the document region (not the window, so other screens keep their keys):
 * Save, and never the browser's "save page". Bound on capture, ahead of the editor's own keys.
 */
export function saveShortcut(control: SaveControl | null): ((event: KeyboardEvent<HTMLElement>) => void) | undefined {
  if (control === null) return undefined;
  return (event: KeyboardEvent<HTMLElement>): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    const inputs: SaveInputs | null = control.inputs.get();
    if (inputs !== null && canSave(inputs)) attempt(control.save(), 'save');
  };
}
