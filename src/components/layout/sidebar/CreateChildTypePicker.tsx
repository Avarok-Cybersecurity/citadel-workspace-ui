/**
 * "What would you like to add?" -- asked when the place being added to allows more than one
 * level (a Room or a Desk under an Office, say).
 *
 * The sidebar used to take the first allowed level without asking, so with a custom hierarchy
 * every level after the first could not be created from the sidebar at all.
 */
import type { ComponentType } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getEntityMetadata } from '@/lib/entity-type-registry';

export interface TypeChoice {
  parentId: string;
  levels: string[];
}

interface CreateChildTypePickerProps {
  choice: TypeChoice | null;
  onPick: (parentId: string, level: string) => void;
  onClose: () => void;
}

export function CreateChildTypePicker({ choice, onPick, onClose }: CreateChildTypePickerProps): JSX.Element {
  return (
    <Dialog open={choice !== null} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="create-type-picker">
        <DialogHeader>
          <DialogTitle>What would you like to add?</DialogTitle>
          <DialogDescription>More than one kind of item can go here.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {choice?.levels.map((level: string) => {
            const meta: ReturnType<typeof getEntityMetadata> = getEntityMetadata(level);
            const Icon: ComponentType<{ className?: string }> = meta.icon;
            return (
              <Button key={level} variant="outline" className="justify-start" onClick={() => onPick(choice.parentId, level)} data-testid={`create-type-${level}`}>
                <Icon className="mr-2 h-4 w-4" />
                {meta.label}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
