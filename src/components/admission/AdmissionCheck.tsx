import { TurnstileWidget } from '@/components/create-workspace/TurnstileWidget';
import type { AdmissionGate } from './useAdmissionGate';

/**
 * The human check, where a form needs it. Renders nothing for a workspace that
 * does not ask, so its Cloudflare script is never fetched there; the widget is
 * already in the sign-in forms' lazy chunk, off the landing page.
 */
export function AdmissionCheck({ gate }: { gate: AdmissionGate }): JSX.Element | null {
  if (!gate.visible) return null;
  return (
    <div className="space-y-2" data-testid="admission-check">
      {gate.siteKey !== null && (
        <TurnstileWidget sitekey={gate.siteKey} action={gate.action} onToken={gate.onToken} resetSignal={gate.resetSignal} />
      )}
      {gate.message && <p role="alert" className="text-sm text-destructive-emphasis" data-testid="admission-message">{gate.message}</p>}
    </div>
  );
}
