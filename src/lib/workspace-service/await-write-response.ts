/**
 * Waiting for the server's answer to a write, instead of for the frame to leave.
 *
 * `sendProtocolRequest` resolves once the request reaches the local WASM sink.
 * The server answers a refusal as a RESPONSE — `WorkspaceProtocolResponse::Error`
 * — which can never reject that promise. So every write reported success on
 * SEND:
 *
 *   - "Office Deleted — Engineering has been deleted successfully" in green,
 *     the modal closed, the user navigated away from the node;
 *   - five seconds later, a red "Failed to delete node: Permission denied:
 *     EditTreeStructure required" in the opposite corner;
 *   - and the node still in the tree.
 *
 * The careful failure handling downstream was all unreachable as a result.
 * TreeNodesSection's delete dialog closes only on success and renders its own
 * `role="alert"` — but the handler it awaits swallowed its errors and always
 * resolved, so neither could ever fire.
 *
 * KNOWN LIMITATION, recorded rather than hidden: the workspace protocol carries
 * no request id (`grep -c request_id citadel-workspace-types/src/lib.rs` is 0),
 * so responses can only be matched by TYPE. Two writes of the same kind in
 * flight at once could take each other's answer. The UI issues these one at a
 * time from a modal or a confirm dialog, so that is not reachable today — but it
 * is a property of the protocol, not of this module, and the real fix is a
 * request id on the wire.
 */

import { eventEmitter } from '../event-emitter';
import { debugLog } from '@/lib/debug-config';

/** How long to wait before treating silence as a failure. */
export const WRITE_RESPONSE_TIMEOUT_MS = 15_000;

/** The response variants that mean a given request succeeded. */
const SUCCESS_RESPONSES: Record<string, readonly string[]> = {
  CreateNode: ['Node'],
  UpdateNode: ['Node'],
  DeleteNode: ['NodeDeleted'],
  MoveNode: ['NodeMoved'],
};

function describeFailure(response: Record<string, unknown>): string {
  const detail = response.Error;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const [variant, value] = Object.entries(detail)[0] ?? [];
    return typeof value === 'string' ? `${variant}: ${value}` : String(variant);
  }
  return 'The server rejected the request.';
}

/**
 * Send a write and resolve only when the server has accepted it.
 *
 * Rejects on `Error`, and on silence past the timeout. Callers already treat a
 * rejection as failure — that is the path their toasts and dialogs were written
 * for and could never reach.
 */
export async function awaitWriteResponse(
  requestType: keyof typeof SUCCESS_RESPONSES,
  send: () => Promise<void>
): Promise<void> {
  const accepted = SUCCESS_RESPONSES[requestType];
  if (!accepted) {
    // An unmapped write would wait for a response that never matches and then
    // fail a correct operation, which is worse than the original defect.
    await send();
    return;
  }

  const settled = new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      eventEmitter.off('workspace:raw-response', handler);
      reject(
        new Error(
          `The server did not answer within ${WRITE_RESPONSE_TIMEOUT_MS / 1000}s. ` +
            'The change may not have been saved.'
        )
      );
    }, WRITE_RESPONSE_TIMEOUT_MS);

    const handler = (response: unknown) => {
      if (!response || typeof response !== 'object') return;
      const responseType = Object.keys(response)[0];
      if (responseType === undefined) return;

      if (responseType === 'Error') {
        clearTimeout(timeoutId);
        eventEmitter.off('workspace:raw-response', handler);
        reject(new Error(describeFailure(response as Record<string, unknown>)));
        return;
      }
      if (accepted.includes(responseType)) {
        clearTimeout(timeoutId);
        eventEmitter.off('workspace:raw-response', handler);
        resolve();
      }
    };

    eventEmitter.on('workspace:raw-response', handler);
  });

  // Subscribe BEFORE sending. The response can arrive within the same tick on a
  // warm local socket, and a listener attached afterwards would miss it and then
  // time out a write that actually succeeded.
  try {
    await send();
  } catch (sendError) {
    debugLog('WorkspaceService', `${requestType} failed to send`, sendError);
    throw sendError;
  }

  return settled;
}
