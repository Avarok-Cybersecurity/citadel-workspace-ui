/**
 * A ribbon button that opens a vertical list of choices (Styles, Margins, Size …): one roving
 * toolbar in a popover, closed when a choice is made, after which the document has focus
 * again. The choices are the caller's.
 */
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RibbonButton } from './RibbonButton';
import { RibbonToolbar } from './RibbonToolbar';
import { useRibbon } from './ribbon-context';

export interface RibbonMenuProps {
  readonly testId: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly text: string;
  readonly widthPx: number;
  /** The choices; `close` shuts the menu, before the chosen command runs. */
  readonly children: (close: () => void) => ReactNode;
}

export function RibbonMenu({ testId, label, icon, text, widthPx, children }: RibbonMenuProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const { returnFocus } = useRibbon();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <RibbonButton testId={`${testId}-open`} label={label} icon={icon} text={text} />
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} className="max-h-[min(480px,70vh)] overflow-y-auto p-2" style={{ width: widthPx }}
        // The document, not the trigger, takes focus back, as after any ribbon command.
        onCloseAutoFocus={(e: Event): void => { e.preventDefault(); returnFocus(); }}>
        <RibbonToolbar label={label} testId={testId} vertical>
          {children((): void => setOpen(false))}
        </RibbonToolbar>
      </PopoverContent>
    </Popover>
  );
}
