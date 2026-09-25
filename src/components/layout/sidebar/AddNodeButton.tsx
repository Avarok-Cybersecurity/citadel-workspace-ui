import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { permits, type UsePermissionResult } from "@/hooks/use-permission-result";

const NO_TREE_EDIT: string = 'You do not have permission to add offices or rooms here. An administrator can grant it.';

/**
 * Why creating cannot succeed, or null when it can: it needs the tree schema
 * (the allowed child types), and the server refuses CreateNode without
 * EditTreeStructure on the workspace. Blocked on a KNOWN "no" only -- an
 * unanswered check still offers "+", and the dialog shows any refusal.
 */
export function createBlockedReason(schemaLoaded: boolean, treeEdit: UsePermissionResult): string | null {
  if (!schemaLoaded) return 'Waiting for the workspace to finish loading';
  return permits(treeEdit) ? null : (treeEdit.reason ?? NO_TREE_EDIT);
}

interface AddNodeButtonProps {
  onClick: () => void;
  /** Null when the button may be pressed; otherwise why it may not, shown as its title. */
  blockedReason: string | null;
  testId: string;
}

/**
 * The hierarchy's "+", once for both the empty and the populated tree.
 *
 * Disabled, with the reason, whenever pressing it can only end in a refusal:
 * the schema has not arrived, or the server would refuse this person
 * (CreateNode needs EditTreeStructure on the workspace).
 */
export function AddNodeButton({ onClick, blockedReason, testId }: AddNodeButtonProps): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="tap-target h-6 w-6 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground disabled:opacity-40"
      onClick={onClick}
      disabled={blockedReason !== null}
      data-testid={testId}
      aria-label={blockedReason === null ? 'Add to this workspace' : `Add to this workspace (${blockedReason})`}
      title={blockedReason ?? 'Add to this workspace'}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );
}
