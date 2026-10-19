import { useState, type JSX } from 'react';
import { AlertCircle, ArrowLeft, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { workspaceHostFor } from '@/lib/onboarding/slug';
import { STORAGE_ADDON, formatUsd, isPaid, quote, tierById, type PlanSelection, type Quote } from '@/lib/onboarding/tiers';
import { INTERVAL_NAME } from './PlanStep';
import { StepHeading } from './StepHeading';
import { TurnstileWidget } from './TurnstileWidget';
import { TURNSTILE_ACTION, TURNSTILE_SITEKEY } from '@/lib/onboarding/turnstile';
import { TermsAcceptanceModal } from '@/components/terms/TermsAcceptanceModal';
import { CUSTOMER_TERMS_DOCUMENT, PLATFORM_TERMS_DOCUMENT } from '@/lib/terms/legal-documents';
import { OverageChoice, type OverageChoiceProps } from './OverageChoice';

export interface ReviewStepProps {
  readonly displayName: string;
  readonly slug: string;
  readonly plan: PlanSelection;
  readonly onBack: () => void;
  /** A paid plan's required overage-billing choice; undefined for Free, which has none. */
  readonly overage: OverageChoiceProps | undefined;
  /**
   * Spend the token. Resolves to an error message when the request was refused,
   * or `undefined` when it succeeded (and the page has moved on).
   */
  readonly onSubmit: (turnstileToken: string) => Promise<string | undefined>;
}

function Row({ label, value, testId }: { readonly label: string; readonly value: string; readonly testId?: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm font-medium text-foreground" data-testid={testId}>{value}</dd>
    </div>
  );
}

/** Step 3: check everything, prove you are a person, and create. */
export function ReviewStep({ displayName, slug, plan, onBack, overage, onSubmit }: ReviewStepProps): JSX.Element {
  const [token, setToken] = useState<string | undefined>(undefined);
  const [resetSignal, setResetSignal] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState<boolean>(false);
  const paid: boolean = isPaid(plan.tier);
  const q: Quote = quote(plan);
  const per: string = INTERVAL_NAME[plan.interval];
  // Nothing is pre-selected, so a paid workspace cannot be created until its owner has chosen.
  const unchosen: boolean = overage !== undefined && overage.value === undefined;

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (!token) {
      setError('The human check expired while you were reading. Wait for it to refresh, then press the button again.');
      return;
    }
    // One use only: siteverify rejects a token it has seen, so it is dropped
    // here whatever the outcome, and a refusal asks the widget for a new one.
    const spent: string = token;
    setToken(undefined);
    setBusy(true);
    setError(undefined);
    const refusal: string | undefined = await onSubmit(spent);
    if (refusal !== undefined) {
      setError(refusal);
      setBusy(false);
      setResetSignal((n) => n + 1);
    }
  };

  return (
    <div>
      <StepHeading title="Review and create">
        One last check. Confirm you are human, and we will set up your workspace.
      </StepHeading>

      <dl className="divide-y divide-border rounded-xl border border-border bg-background px-4">
        <Row label="Workspace" value={displayName} testId="review-name" />
        <Row label="Address" value={workspaceHostFor(slug)} testId="review-host" />
        <Row label="Plan" value={paid ? `${tierById(plan.tier).name}, billed per ${per}` : 'Free'} testId="review-plan" />
        {paid && <Row label="Seats" value={String(plan.seats)} />}
        {paid && plan.storageBlocks > 0 && <Row label="Extra storage" value={`${plan.storageBlocks * STORAGE_ADDON.gbPerBlock} GB`} />}
        {paid && q.sharedLinks > 0 && (
          <Row label="Extra secure links" value={`${q.sharedLinks.toLocaleString('en-US')}, shared by the workspace`} testId="review-link-packs" />
        )}
        <Row label="Total" value={paid ? `${formatUsd(q.totalCents)} / ${per}` : 'Free'} testId="review-total" />
      </dl>

      {overage && <OverageChoice {...overage} />}

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-foreground">Verify you are human</p>
        <TurnstileWidget sitekey={TURNSTILE_SITEKEY} action={TURNSTILE_ACTION} cData={null} onToken={setToken} resetSignal={resetSignal} />
      </div>

      {error && (
        <div role="alert" data-testid="create-error" className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-emphasis">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row justify-between">
        <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={busy} className="h-11 gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={!token || busy || unchosen}
          onClick={() => setAsking(true)}
          data-testid="create-submit"
          className="h-11 gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : paid && <Lock className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Working…' : paid ? 'Continue to payment' : 'Create workspace'}
        </Button>
      </div>

      {asking && (
        <TermsAcceptanceModal
          title="Customer Terms and Terms of Use"
          documents={[CUSTOMER_TERMS_DOCUMENT, PLATFORM_TERMS_DOCUMENT]}
          agreement="I agree to the Customer Terms and the Terms of Use, on behalf of myself or the organization I represent."
          onCancel={() => setAsking(false)}
          onAccept={() => { setAsking(false); void submit(); }}
        />
      )}
    </div>
  );
}
