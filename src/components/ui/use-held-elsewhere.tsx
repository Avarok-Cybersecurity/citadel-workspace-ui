/**
 * A tab whose session another browser now holds.
 *
 * The agent refuses to hand a live session to a different connection without
 * the password, so on load this tab used to adopt a session it could not use
 * and wait for ever on "Workspace data is taking longer than expected". The
 * workspace switcher already had the answer (#59): ask, then open sign-in with
 * the username filled in. This is that same offer -- `offerTakeover` and
 * `TakeoverSignIn` -- reached from page start instead.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { offerTakeover, takeoverPrompt } from '@/lib/sessions/claim-session';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { LazyTakeoverSignIn as TakeoverSignIn } from '@/components/LazyTakeoverSignIn';
import { Button } from '@/components/ui/button';

export interface HeldElsewhere {
  /** Whose session is held elsewhere, or null when none is. */
  username: string | null;
  offer: (username: string) => void;
  /** What the loader shows instead of its spinner. */
  notice: JSX.Element;
}

export function useHeldElsewhere(): HeldElsewhere {
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  const navigate: NavigateFunction = useNavigate();
  const [username, setUsername] = useState<string | null>(null);
  const [signingInAs, setSigningInAs] = useState<string | null>(null);

  const offer: (name: string) => void = useCallback((name: string): void => {
    setUsername(name);
    void offerTakeover(name, { confirm, signInAs: setSigningInAs });
  }, [confirm]);

  const prompt: ReturnType<typeof takeoverPrompt> | null = username === null ? null : takeoverPrompt(username);
  const notice: JSX.Element = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4" data-testid="session-held-elsewhere">
      <div className="flex max-w-md flex-col items-center space-y-4 text-center">
        <p className="text-lg font-medium text-foreground">{prompt?.title}</p>
        <p className="text-sm text-muted-foreground">{prompt?.description}</p>
        <div className="flex gap-2">
          <Button onClick={() => { if (username !== null) setSigningInAs(username); }}>{prompt?.confirmLabel}</Button>
          <Button variant="outline" onClick={() => navigate('/connect')}>Go to Connect</Button>
        </div>
      </div>
      <TakeoverSignIn username={signingInAs} onClose={() => setSigningInAs(null)} />
    </div>
  );
  return { username, offer, notice };
}
