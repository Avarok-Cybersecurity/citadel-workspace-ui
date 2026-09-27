/**
 * The creator's email on the first /create step, typed twice.
 *
 * Owner, 2026-09-27: required, and its link verifies it. The claim code is emailed to it, so a
 * mistyped address loses the copy the creator is counting on; that is why it is entered twice.
 */
import { Input } from '@/components/ui/input';
import { MAX_EMAIL_LENGTH } from '@/lib/onboarding/owner-email';

interface OwnerEmailFieldProps {
  email: string;
  confirmation: string;
  /** Shown once both have been typed and they cannot be used; null otherwise. */
  problem: string | null;
  onEmailChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
}

export function OwnerEmailField({ email, confirmation, problem, onEmailChange, onConfirmationChange }: OwnerEmailFieldProps): JSX.Element {
  return (
    <div className="space-y-2">
      <label htmlFor="owner-email" className="text-sm font-medium text-foreground">Your email</label>
      <p id="owner-email-help" className="text-sm text-muted-foreground">
        We email you the claim code, with a link that takes you straight to claiming the workspace.
      </p>
      <Input
        id="owner-email"
        data-testid="create-email"
        type="email"
        autoComplete="email"
        value={email}
        maxLength={MAX_EMAIL_LENGTH}
        aria-describedby="owner-email-help"
        onChange={(e) => onEmailChange(e.target.value)}
        className="h-11"
      />
      <label htmlFor="owner-email-again" className="sr-only">Your email, again</label>
      <Input
        id="owner-email-again"
        data-testid="create-email-again"
        type="email"
        autoComplete="email"
        placeholder="Type it again"
        value={confirmation}
        maxLength={MAX_EMAIL_LENGTH}
        onChange={(e) => onConfirmationChange(e.target.value)}
        className="h-11"
      />
      {problem && <p role="alert" className="text-sm text-destructive-emphasis" data-testid="create-email-problem">{problem}</p>}
    </div>
  );
}
