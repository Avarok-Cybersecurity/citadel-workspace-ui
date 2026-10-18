/**
 * A ribbon button that opens a small form (Link, Comment). Submitting closes the dialog and
 * sends the command; closing it either way hands focus back to the document, not the button.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RibbonButton, type Shortcut } from './RibbonButton';
import { useRibbon, type Ribbon } from './ribbon-context';

export interface RibbonDialogProps {
  readonly testId: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly shortcut?: Shortcut;
  readonly unavailable?: string | null;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  /** Why the form cannot be submitted yet, shown under it; null when it can. */
  readonly invalid: string | null;
  /** Called when the dialog opens, to start from an empty form. */
  readonly onOpen: () => void;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}

export function RibbonDialog({ testId, label, icon, shortcut, unavailable, title, description, submitLabel, invalid, onOpen, onSubmit, children }: RibbonDialogProps): JSX.Element {
  const { returnFocus }: Ribbon = useRibbon();
  const [open, setOpen] = useState<boolean>(false);
  const [tried, setTried] = useState<boolean>(false);
  const submit: (e: FormEvent<HTMLFormElement>) => void = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setTried(true);
    if (invalid !== null) return;
    setOpen(false);
    onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={(next: boolean): void => { setOpen(next); if (next) { setTried(false); onOpen(); } }}>
      <DialogTrigger asChild>
        <RibbonButton testId={testId} label={label} icon={icon} shortcut={shortcut} unavailable={unavailable} />
      </DialogTrigger>
      <DialogContent className="max-w-md border-border bg-card" data-testid={`${testId}-dialog`}
        onCloseAutoFocus={(e: Event): void => { e.preventDefault(); returnFocus(); }}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-foreground">{title}</DialogTitle>
            <DialogDescription className="text-foreground/80">{description}</DialogDescription>
          </DialogHeader>
          {children}
          {tried && invalid !== null && <p role="alert" data-testid={`${testId}-invalid`} className="text-[14px] text-destructive">{invalid}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={(): void => setOpen(false)}>Cancel</Button>
            <Button type="submit" className="min-h-[44px]" data-testid={`${testId}-submit`}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
