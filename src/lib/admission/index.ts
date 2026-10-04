/** Composition root: discovery wired to this page's control plane and fetch. */
import { readControlPlaneBase } from '@/lib/onboarding/control-plane-config';
import { hostedWorkspaceSlug } from '@/lib/onboarding/billing-portal';
import { discoverAdmission, type Admission } from './discovery';
import { readAccountServers } from './account-servers';
import { requestResponse } from '@/lib/websocket/request-response';
import { websocketService } from '@/lib/websocket-service';
import { TIMEOUT } from '@/lib/timeout-constants';
import { debugLog } from '@/lib/debug-config';

/** `serverAddress` is the workspace the form is for, when the form knows it (registration does). */
export function browserDiscoverAdmission(serverAddress: string | undefined): Promise<Admission | null> {
  const fetchFn = (input: string, init?: RequestInit): Promise<Response> => window.fetch(input, init);
  return discoverAdmission(fetchFn, readControlPlaneBase(document), hostedWorkspaceSlug(serverAddress));
}

/**
 * The agent's accounts and the workspace each is on (account-servers.ts). An agent that cannot
 * be asked yields none: the sign-in check then renders unbound, which the server refuses.
 */
export async function browserAccountServers(): Promise<ReadonlyMap<string, string>> {
  const requestId: string = crypto.randomUUID();
  try {
    return await requestResponse<ReadonlyMap<string, string>>({
      request: { GetAccountInformation: { request_id: requestId, cid: null } },
      requestId,
      sendRequest: (request: unknown): Promise<void> => websocketService.sendMessage(request as Record<string, unknown>),
      timeoutMs: TIMEOUT.SERVER_REQUEST_MS,
      operationName: 'GetAccountInformation',
      matcher: {
        matchSuccess: (message: Record<string, unknown>): ReadonlyMap<string, string> | undefined => readAccountServers(message, requestId) ?? undefined,
        matchFailure: (): string | undefined => undefined,
      },
    });
  } catch (error: unknown) {
    debugLog('Admission', 'the agent could not say which workspace its accounts are on', error);
    return new Map<string, string>();
  }
}

export type { Admission } from './discovery';
export { AdmissionRefusal, admissionReasonOf, isAdmissionRefusal, type AdmissionReason } from './refusal';
