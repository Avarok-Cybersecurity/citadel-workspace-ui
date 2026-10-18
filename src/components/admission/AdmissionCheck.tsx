import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { TurnstileWidget } from '@/components/create-workspace/TurnstileWidget';
import { ADMISSION_COPY } from '@/lib/admission/copy';
import type { AdmissionGate } from './useAdmissionGate';
import { PaymentRequiredScreen } from '@/components/billing/PaymentRequiredScreen';
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { browserControlPlane } from '@/lib/onboarding/browser-control-plane';
import { openBrowserPortalTab } from '@/lib/onboarding/browser-portal-tab';
import type { ControlPlane } from '@/lib/onboarding/control-plane-client';

/** The pay screen against this page's control plane, built once per mount. */
function BrowserPaymentRequired({ paused }: { paused: NonNullable<AdmissionGate['paymentRequired']> }): JSX.Element {
  const api: ControlPlane | undefined = useMemo((): ControlPlane | undefined => {
    const base: string | undefined = readControlPlaneBase(document);
    return base === undefined ? undefined : browserControlPlane(base);
  }, []);
  return <PaymentRequiredScreen slug={paused.slug} refusal={paused.refusal} api={api} openTab={openBrowserPortalTab} />;
}

/**
 * The human check, where a form needs it. Renders nothing for a workspace that
 * does not ask, so its Cloudflare script is never fetched there; the widget is
 * already in the sign-in forms' lazy chunk, off the landing page.
 *
 * When neither the agent, this device nor the page knows the account's
 * workspace, it asks for the address first: a token bound to no workspace is
 * refused by the server, so the widget waits until there is one to bind to.
 */
export function AdmissionCheck({ gate }: { gate: AdmissionGate }): JSX.Element | null {
  // A paused workspace refuses every attempt: the form's own check is moot, the pay screen is not.
  if (gate.paymentRequired !== null) return <BrowserPaymentRequired paused={gate.paymentRequired} />;
  if (!gate.visible) return null;
  const unbound: boolean = gate.needsWorkspace && gate.cData === null;
  return (
    <div className="space-y-2" data-testid="admission-check">
      {gate.needsWorkspace && (
        <div className="space-y-1.5">
          <label htmlFor="admission-workspace" className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            {ADMISSION_COPY.workspaceLabel}
          </label>
          <Input
            id="admission-workspace" data-testid="admission-workspace" autoComplete="off" spellCheck={false} inputMode="url"
            placeholder="acme.work.avarok.net" value={gate.workspace.value} onChange={(e) => gate.workspace.set(e.target.value)}
            aria-invalid={gate.workspace.error ? true : undefined}
            aria-describedby={gate.workspace.error ? 'admission-workspace-error' : 'admission-workspace-hint'}
          />
          {gate.workspace.error
            ? <p id="admission-workspace-error" role="alert" className="text-xs text-destructive-emphasis" data-testid="admission-workspace-error">{gate.workspace.error}</p>
            : <p id="admission-workspace-hint" className="text-xs text-muted-foreground">{ADMISSION_COPY.workspaceHint}</p>}
        </div>
      )}
      {gate.siteKey !== null && !unbound && (
        <TurnstileWidget sitekey={gate.siteKey} action={gate.action} cData={gate.cData} onToken={gate.onToken} resetSignal={gate.resetSignal} />
      )}
      {gate.message && <p role="alert" className="text-sm text-destructive-emphasis" data-testid="admission-message">{gate.message}</p>}
    </div>
  );
}
