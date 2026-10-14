import { useRef, useState, type JSX } from 'react';
import { TermsAcceptanceModal } from '@/components/terms/TermsAcceptanceModal';
import { isAvarokHosted } from '@/lib/onboarding/hosted';
import { PLATFORM_TERMS_DOCUMENT } from '@/lib/terms/legal-documents';

/** Avarok's Terms of Use, put to a person creating an account on a server Avarok hosts. */
export interface HostedTerms {
  /** True only on an Avarok-hosted server; elsewhere there is nothing to ask. */
  readonly required: boolean;
  /** Opens the dialog; resolves true once accepted, false if it was cancelled. */
  readonly ask: () => Promise<boolean>;
  /** Render this: the open dialog, or `null`. */
  readonly dialog: JSX.Element | null;
}

export function useHostedTerms(serverAddress: string): HostedTerms {
  const [open, setOpen] = useState<boolean>(false);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const finish = (accepted: boolean): void => {
    setOpen(false);
    pending.current?.(accepted);
    pending.current = null;
  };
  return {
    required: isAvarokHosted(serverAddress),
    ask: (): Promise<boolean> => new Promise<boolean>((resolve: (accepted: boolean) => void): void => {
      pending.current = resolve;
      setOpen(true);
    }),
    dialog: open ? (
      <TermsAcceptanceModal
        title="Terms of Use"
        documents={[PLATFORM_TERMS_DOCUMENT]}
        agreement="I have read and agree to the Terms of Use."
        onAccept={(): void => finish(true)}
        onCancel={(): void => finish(false)}
      />
    ) : null,
  };
}
