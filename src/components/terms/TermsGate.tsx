import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useTermsGate, type TermsGate as Gate } from './use-terms-gate';
import { TermsSections } from '@/components/TermsDialog';
import { termsTexts } from './terms-texts';

/**
 * Blocks the workspace until the member accepts terms they have not accepted yet: the platform's
 * new version, or the workspace's own. Nothing else in the workspace is reachable behind it.
 */
export function TermsGate(): JSX.Element | null {
  const gate: Gate = useTermsGate();
  if (gate.owed === null) return null;
  return (
    <AlertDialog open>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto" data-testid="terms-gate">
        <AlertDialogHeader>
          <AlertDialogTitle>Please accept the updated terms</AlertDialogTitle>
          <AlertDialogDescription>You can keep using this workspace once you accept them.</AlertDialogDescription>
        </AlertDialogHeader>
        <TermsSections documents={termsTexts(gate.owed)} />
        {gate.problem && <p role="alert" className="text-sm text-destructive-emphasis">{gate.problem}</p>}
        <AlertDialogFooter>
          <Button data-testid="terms-gate-accept" disabled={gate.accepting} onClick={(): void => { void gate.accept(); }}>
            {gate.accepting ? 'Saving…' : 'I accept'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
