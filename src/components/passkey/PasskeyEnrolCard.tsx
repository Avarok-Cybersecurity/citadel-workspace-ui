import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { PASSKEY_COPY } from '@/lib/passkey/copy';
import type { EnrolPrompt } from './usePasskeyEnrolPrompt';

/** Shown once, after a password sign-in the user asked to be offered this on. */
export function PasskeyEnrolCard({ prompt }: { prompt: EnrolPrompt }): JSX.Element {
  const [label, setLabel] = useState<string>(prompt.defaultLabel);
  return (
    <Card className="bg-background border-border shadow-2xl shadow-black/40 w-full max-w-md" data-testid="passkey-enrol">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold text-foreground">{PASSKEY_COPY.enrolSwitch}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{PASSKEY_COPY.enrolPitch}</p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <label htmlFor="passkey-label" className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          Name this key
        </label>
        <Input id="passkey-label" value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} />
        <p className="text-xs text-muted-foreground">{PASSKEY_COPY.pinNote}</p>
      </CardContent>
      <CardFooter className="gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => prompt.choose(null)}>Not now</Button>
        <Button type="button" data-testid="passkey-enrol-continue" disabled={!label.trim()} onClick={() => prompt.choose(label.trim())}>
          Set up
        </Button>
      </CardFooter>
    </Card>
  );
}
