/** Composition root: discovery wired to this page's control plane and fetch. */
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { hostedWorkspaceSlug } from '@/lib/onboarding/billing-portal';
import { isTenantHost } from '@/lib/workspace-address';
import { discoverAdmission, type Discovered } from './discovery';
import { readAccountServers } from './account-servers';
import { askStoredAccounts } from '@/lib/stored-accounts';
import { debugLog } from '@/lib/debug-config';

/** `serverAddress` is the workspace the form is for, when the form knows it (registration does). */
export function browserDiscoverAdmission(serverAddress: string | undefined): Promise<Discovered | null> {
  const fetchFn = (input: string, init?: RequestInit): Promise<Response> => window.fetch(input, init);
  return discoverAdmission(fetchFn, readControlPlaneBase(document), hostedWorkspaceSlug(serverAddress));
}

/** The workspace this page is served from (`acme.work.avarok.net`); undefined on work.avarok.net itself. */
export function browserPageWorkspace(): string | undefined {
  const host: string = window.location.hostname.toLowerCase();
  return isTenantHost(host) ? host : undefined;
}

/**
 * The agent's accounts and the workspace each is on (account-servers.ts). An agent that cannot
 * be asked yields none: the sign-in check then renders unbound, which the server refuses.
 */
export async function browserAccountServers(): Promise<ReadonlyMap<string, string>> {
  try {
    return await askStoredAccounts(readAccountServers);
  } catch (error: unknown) {
    debugLog('Admission', 'the agent could not say which workspace its accounts are on', error);
    return new Map<string, string>();
  }
}

export type { Admission, Discovered, PaymentRequiredAnswer } from './discovery';
export { isPaymentRequired } from './discovery';
export {
  AdmissionRefusal, admissionChallengeOf, admissionReasonOf, isAdmissionRefusal, type AdmissionChallenge, type AdmissionReason,
} from './refusal';
