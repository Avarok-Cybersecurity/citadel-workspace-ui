import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AgentUpdate } from '@/lib/agent-update/update-state';
import { askUpdater } from '@/lib/agent-update/requests';
import { describeFailure } from '@/lib/failure-message';
import { CONNECTION_LOST } from '@/lib/websocket/request-response';

/** What restarting costs, said before it happens. Sessions live in the agent's memory. */
export const RESTART_WARNING: string =
  'Restarting the agent signs out every account on this computer. Each will need to sign in again.';

/**
 * "Citadel Agent X.Y.Z is available", non-blocking. "Restart to update" when the agent has
 * the release downloaded and verified (after saying what that costs); "Download" when it can
 * only link out (a package-managed or Windows install).
 */
export function AgentUpdateBanner({ update }: { update: AgentUpdate }): JSX.Element | null {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [state, setState] = useState<'idle' | 'restarting' | string>('idle');
  if (dismissed === update.latest) return null;

  const restart = (): void => {
    setState('restarting');
    askUpdater('UpdateApply')
      .then((status) => { if (status.last_error) setState(status.last_error); })
      // The agent restarting closes the socket before it can answer: that is the success case.
      .catch((e: unknown) => { if (!String(e).includes(CONNECTION_LOST)) setState(describeFailure(e, 'The update did not start.')); });
  };

  return (
    <div role="status" aria-live="polite" data-testid="agent-update-banner" data-ready={update.ready}
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm bg-muted text-foreground border-b border-surface">
      <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Citadel Agent {update.latest} is available</strong>
        {state === 'restarting' ? ' — restarting the agent…' : state !== 'idle' ? ` — ${state}` : ''}
      </span>
      {update.ready ? (
        <Button size="sm" data-testid="agent-update-restart" disabled={state === 'restarting'} onClick={(): void => setConfirming(true)}>
          Restart to update
        </Button>
      ) : (
        <Button size="sm" variant="secondary" asChild>
          <a href={update.downloadUrl} target="_blank" rel="noopener noreferrer" data-testid="agent-update-download">Download</a>
        </Button>
      )}
      <Button size="sm" variant="ghost" data-testid="agent-update-later" onClick={(): void => setDismissed(update.latest)}>Later</Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart to update to {update.latest}?</AlertDialogTitle>
            <AlertDialogDescription data-testid="agent-update-warning">{RESTART_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="agent-update-confirm" onClick={restart}>Restart to update</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
