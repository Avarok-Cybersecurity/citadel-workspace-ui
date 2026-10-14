import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsDialog } from './TermsDialog';
import type { OptionalFieldChange } from './join-registration-shape';
import type { SignupConsentFields } from '@/lib/signup-consent';
import { SHOWN_PLATFORM_TERMS_TEXT, SHOWN_PLATFORM_TERMS_VERSION } from '@/lib/terms/platform-terms';

interface JoinConsentFieldsProps {
  values: SignupConsentFields;
  onChange: OptionalFieldChange;
  disabled: boolean;
  /** Shown once Join was pressed without the Terms ticked. */
  termsError: string | null;
}

/** What is sent when diagnostics are on, in one plain line. Also the Privacy tab's description. */
export const DIAGNOSTICS_SENT: string = 'Warnings and errors only, with names, files and addresses removed.';

/**
 * The Profile step's agreements. The Terms are required; diagnostics are a separate choice and
 * stay off unless ticked. Workspace terms, if the admins wrote any, need a session to be read:
 * they are shown right after sign-in, before anything else in the workspace.
 */
export function JoinConsentFields({ values, onChange, disabled, termsError }: JoinConsentFieldsProps): JSX.Element {
  const [reading, setReading] = useState<boolean>(false);
  return (
    <section aria-label="Agreements" className="space-y-3 pt-4 mt-4 border-t border-border">
      <div className="flex items-start gap-2">
        <Checkbox id="join-terms" data-testid="join-terms" checked={values.termsAccepted} disabled={disabled}
          aria-required="true" aria-invalid={termsError ? true : undefined} aria-describedby={termsError ? 'join-terms-error' : undefined}
          onCheckedChange={(on: boolean | 'indeterminate'): void => onChange('termsAccepted', on === true)} />
        <label htmlFor="join-terms" className="text-sm text-foreground">
          I accept the{' '}
          <button type="button" className="underline text-primary-accent" onClick={(): void => setReading(true)}>Terms</button>
          <span className="block text-xs text-muted-foreground">If this workspace has its own terms, you are asked to accept them right after you sign in.</span>
        </label>
      </div>
      {termsError && <p id="join-terms-error" role="alert" className="text-xs text-destructive-emphasis">{termsError}</p>}
      <div className="flex items-start gap-2">
        <Checkbox id="join-diagnostics" data-testid="join-diagnostics" checked={values.shareDiagnostics} disabled={disabled}
          onCheckedChange={(on: boolean | 'indeterminate'): void => onChange('shareDiagnostics', on === true)} />
        <label htmlFor="join-diagnostics" className="text-sm text-foreground">
          Share diagnostic logs with this workspace&apos;s admins
          <span className="block text-xs text-muted-foreground">{DIAGNOSTICS_SENT} Optional; change it any time in Settings &gt; Privacy.</span>
        </label>
      </div>
      {reading && (
        <TermsDialog onClose={(): void => setReading(false)}
          documents={[{ heading: 'Platform terms', version: SHOWN_PLATFORM_TERMS_VERSION, text: SHOWN_PLATFORM_TERMS_TEXT }]} />
      )}
    </section>
  );
}
