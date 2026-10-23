/**
 * An app's toolbar, drawn by the host above its zone: real buttons, in the page's design tokens,
 * keyboard-reachable and named by their label, which is set as text and so can never be markup.
 * Each update replaces the buttons shown; an empty toolbar draws nothing. A press is reported to
 * the zone until the toolbar is disposed, and never after.
 */
import type { ToolbarButton } from './toolbar-model';

export interface ZoneToolbar {
  readonly element: HTMLElement;
  readonly set: (buttons: readonly ToolbarButton[]) => void;
  readonly dispose: () => void;
}

const BUTTON: string = 'inline-flex min-h-[44px] min-w-[44px] max-w-full items-center justify-center rounded-md border border-border bg-background px-[12px] text-[14px] font-medium text-foreground break-words hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function zoneToolbar(doc: Document, appName: string, onPress: (id: string) => void): ZoneToolbar {
  const bar: HTMLDivElement = doc.createElement('div');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', `${appName} actions`);
  bar.dataset.testid = 'app-zone-toolbar';
  bar.className = 'mb-[8px] flex flex-wrap gap-[8px]';
  bar.style.display = 'none';
  let live: boolean = true;
  return {
    element: bar,
    set: (buttons: readonly ToolbarButton[]): void => {
      if (!live) return;
      bar.replaceChildren(...buttons.map((b: ToolbarButton): HTMLButtonElement => {
        const button: HTMLButtonElement = doc.createElement('button');
        button.type = 'button';
        button.textContent = b.label;
        button.className = BUTTON;
        button.dataset.testid = 'app-toolbar-item';
        button.dataset.itemId = b.id;
        button.addEventListener('click', (): void => { if (live) onPress(b.id); });
        return button;
      }));
      bar.style.display = buttons.length === 0 ? 'none' : '';
    },
    dispose: (): void => {
      live = false;
      bar.remove();
    },
  };
}
