/**
 * Diagnostics for the multi-tab inbound router.
 *
 * Kept out of the router itself because these lines exist to answer one
 * specific question — where a message that ILM reported as delivered stops
 * being visible — and that question is not part of the routing rules.
 */

import { debugLog } from '@/lib/debug-config';
import { describeForwarded } from '@/lib/p2p/message-fingerprint';

/**
 * Record an emit and how many handlers were actually listening.
 *
 * A message emitted with no subscriber vanishes silently: no error, no trace,
 * indistinguishable from never having arrived. The router's own receiver
 * attaches at module load, but the P2P messenger subscribes to
 * 'websocket-message' only when it is constructed later in app init — so a
 * message forwarded into a still-booting tab lands in exactly that window.
 *
 * Tagged [ILM-Router] so the integration harness's keyword filter keeps it, and
 * fingerprinted so it joins to the sending tab's `forward ->` line.
 */
export function logEmit(listeners: number, message: unknown): void {
  if (listeners === 0) {
    debugLog(
      'InstanceInboundRouter',
      `[ILM-Router] emit with NO listeners ${describeForwarded(message)} — message is lost here`,
    );
    return;
  }
  debugLog(
    'InstanceInboundRouter',
    `[ILM-Router] emit listeners=${listeners} ${describeForwarded(message)}`,
  );
}
