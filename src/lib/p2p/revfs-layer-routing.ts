/**
 * Hands an inbound REVFS operation to the sync engine, loading it on demand.
 *
 * Extracted from `message-handler-routing` so the deferred-load concern lives
 * in one place, and because inlining it there pushed that file over the
 * 250-line limit.
 */
import { revfsWhenReady } from '@/lib/revfs/revfs-loader';
import { debugLog } from '@/lib/debug-config';
import type { RevfsOperation } from '@/types/revfs-types';

/**
 * The engine is loaded on demand -- a static import of it from `lib/p2p` put
 * the whole thing on the landing page's critical path. Awaiting the SAME
 * promise `useConnectionHandler` started is what guarantees the service has its
 * transport before it is handed an operation.
 */
export async function routeRevfsOperation(
  peerCid: bigint,
  myCid: bigint,
  operation: RevfsOperation,
): Promise<void> {
  const pending: ReturnType<typeof revfsWhenReady> = revfsWhenReady();
  if (pending === null) {
    // Not a silent drop: the sender's ack never arrives and it retries, by
    // which time the connection handler has started the engine.
    debugLog(
      'P2PMessageHandler',
      'REVFS operation arrived before the engine was initialized; leaving it unacked to be retried',
    );
    return;
  }
  const { revfsService } = await pending;
  void revfsService.handleRevfsOperation(peerCid, myCid, operation);
}
