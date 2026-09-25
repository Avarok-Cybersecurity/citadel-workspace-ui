import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PASSKEY_COPY } from '@/lib/passkey/copy';

/**
 * Offered first when an account has a working passkey here: the typed one, or,
 * before anything is typed, each account enrolled on this device. The password
 * field stays below it: it is the fallback for every failure and the recovery
 * path if every key is lost.
 */
export function PasskeySignIn({ accounts, onUse, disabled }: {
  accounts: string[];
  onUse: (account: string) => void;
  disabled: boolean;
}): JSX.Element {
  const several: boolean = accounts.length > 1;
  return (
    <div className="space-y-3">
      {several && <p className="text-xs text-muted-foreground">{PASSKEY_COPY.chooseAccount}</p>}
      {accounts.map((account: string) => (
        <Button
          key={account}
          type="button"
          data-testid={several ? 'login-passkey-account' : 'login-passkey'}
          className="w-full h-11 rounded-lg gap-2"
          disabled={disabled}
          onClick={() => onUse(account)}
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {several ? account : PASSKEY_COPY.signInButton}
        </Button>
      ))}
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {PASSKEY_COPY.orPassword}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
