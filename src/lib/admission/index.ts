/** Composition root: discovery wired to this page's control plane and fetch. */
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { discoverAdmission, type Admission } from './discovery';

export function browserDiscoverAdmission(): Promise<Admission | null> {
  return discoverAdmission((input: string, init?: RequestInit): Promise<Response> => window.fetch(input, init), readControlPlaneBase(document));
}

export type { Admission } from './discovery';
export { AdmissionRefusal, admissionReasonOf, isAdmissionRefusal, type AdmissionReason } from './refusal';
