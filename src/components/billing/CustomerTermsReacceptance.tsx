import { useState, type JSX } from 'react';
import { Button } from '@/components/ui/button';
import { TermsAcceptanceModal } from '@/components/terms/TermsAcceptanceModal';
import { CUSTOMER_TERMS_DOCUMENT } from '@/lib/terms/legal-documents';
import { SHOWN_CUSTOMER_TERMS_VERSION } from '@/lib/terms/customer-terms';

export interface CustomerTermsReacceptanceProps {
  /** The version the control plane now requires. */
  readonly current: number;
  /** The person ticked and accepted `current`: ask the portal again with it. */
  readonly onAccepted: (version: number) => void;
}

/**
 * The portal is refused until the current Customer Terms are accepted. Only a version this page
 * can show is offered: accepting a number whose text the person never saw would be no acceptance,
 * so a newer one than the bundled text asks for a reload instead.
 */
export function CustomerTermsReacceptance({ current, onAccepted }: CustomerTermsReacceptanceProps): JSX.Element {
  const [reading, setReading] = useState<boolean>(false);
  if (current !== SHOWN_CUSTOMER_TERMS_VERSION) {
    return (
      <p role="alert" className="text-sm text-destructive-emphasis" data-testid="customer-terms-reload">
        {`The Customer Terms have changed to version ${current} since this page was loaded. Reload the page to read and accept them.`}
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="customer-terms-stale">
      <p role="alert" className="text-sm text-foreground">
        {`The Customer Terms have been updated to version ${current}. Accept them to open billing.`}
      </p>
      <Button type="button" variant="outline" onClick={(): void => setReading(true)} className="min-h-[36px]" data-testid="customer-terms-read">
        Read and accept the Customer Terms
      </Button>
      {reading && (
        <TermsAcceptanceModal
          title="Customer Terms"
          documents={[CUSTOMER_TERMS_DOCUMENT]}
          agreement="I agree to the Customer Terms, on behalf of myself or the organization I represent."
          onCancel={(): void => setReading(false)}
          onAccept={(): void => { setReading(false); onAccepted(current); }}
        />
      )}
    </div>
  );
}
