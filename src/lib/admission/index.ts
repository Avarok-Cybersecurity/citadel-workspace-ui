/** Composition root: discovery wired to this page's control plane and fetch. */
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { hostedWorkspaceSlug } from '@/lib/onboarding/billing-portal';
import { discoverAdmission, type Admission } from './discovery';

/** `serverAddress` is the workspace the form is for, when the form knows it (registration does). */
export function browserDiscoverAdmission(serverAddress: string | undefined): Promise<Admission | null> {
  const fetchFn = (input: string, init?: RequestInit): Promise<Response> => window.fetch(input, init);
  return discoverAdmission(fetchFn, readControlPlaneBase(document), hostedWorkspaceSlug(serverAddress));
}

export type { Admission } from './discovery';
export { AdmissionRefusal, admissionReasonOf, isAdmissionRefusal, type AdmissionReason } from './refusal';
