import { useRef, useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDateTime } from '@/lib/format-time';
import { toBase64Url } from '@/lib/passkey/bytes';
import { PASSKEY_COPY, removeCopy } from '@/lib/passkey/copy';
import type { CredentialRecord } from '@/lib/passkey';
import { defaultPasskeyLabel } from './usePasskeyEnrolPrompt';
import { useSignInKeys, type SignInKeys } from './useSignInKeys';

/** Settings -> Privacy -> Sign-in keys. */
export function SignInKeysSection(): JSX.Element | null {
  const k: SignInKeys = useSignInKeys();
  const [label, setLabel] = useState<string>(() => defaultPasskeyLabel(navigator.userAgent));
  const [removing, setRemoving] = useState<CredentialRecord | null>(null);
  // Uncontrolled on purpose: the password is read once at submit, then cleared,
  // and never enters React state.
  const passwordRef: React.RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);

  if (!k.account) return null;
  const needsPassword: boolean = k.keys.length === 0;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const read = (): string => {
      const value: string = passwordRef.current?.value ?? '';
      if (passwordRef.current) passwordRef.current.value = '';
      return value;
    };
    await k.add(label.trim(), read);
  };

  return (
    <div className="space-y-3" data-testid="sign-in-keys">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <KeyRound className="h-4 w-4 text-primary-accent" aria-hidden="true" />
        {PASSKEY_COPY.sectionTitle}
      </div>
      <p className="text-xs text-muted-foreground">{PASSKEY_COPY.enrolPitch}</p>

      {!k.available ? (
        <p className="text-xs text-muted-foreground">{PASSKEY_COPY.unavailableHere}</p>
      ) : (
        <>
          {k.keys.length > 0 && (
            <ul className="space-y-2">
              {k.keys.map((key) => (
                <li key={toBase64Url(key.credentialId)} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{key.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDateTime(key.createdAt)} · {key.lastUsedAt ? `Last used ${formatDateTime(key.lastUsedAt)}` : 'Not used yet'}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" disabled={k.busy} onClick={() => setRemoving(key)} aria-label={`Remove ${key.label}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => { void submit(e); }} className="space-y-2 p-3 rounded-lg bg-background/50">
            <Label htmlFor="new-passkey-label" className="text-sm font-medium">Name this key</Label>
            <Input id="new-passkey-label" value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} />
            {needsPassword && (
              <>
                <Label htmlFor="new-passkey-password" className="text-sm font-medium">Your password</Label>
                <Input id="new-passkey-password" type="password" autoComplete="current-password" ref={passwordRef} />
              </>
            )}
            <p className="text-xs text-muted-foreground">{PASSKEY_COPY.pinNote}</p>
            <Button type="submit" size="sm" disabled={k.busy || !label.trim()} data-testid="add-passkey">
              {PASSKEY_COPY.addButton}
            </Button>
          </form>
        </>
      )}

      {k.message && <p role="status" className="text-xs text-muted-foreground">{k.message}</p>}

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this key?</AlertDialogTitle>
            <AlertDialogDescription>{removing ? removeCopy(removing.label) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (removing) void k.remove(removing); setRemoving(null); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
