import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PASSKEY_COPY } from '@/lib/passkey/copy';

/**
 * Offered first when the username has a working passkey here. The password
 * field stays below it: it is the fallback for every failure and the recovery
 * path if every key is lost.
 */
export function PasskeySignIn({ onUse, disabled }: { onUse: () => void; disabled: boolean }): JSX.Element {
  return (
    <div className="space-y-3">
      <Button
        type="button"
        data-testid="login-passkey"
        className="w-full h-11 rounded-lg gap-2"
        disabled={disabled}
        onClick={onUse}
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        {PASSKEY_COPY.signInButton}
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {PASSKEY_COPY.orPassword}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
