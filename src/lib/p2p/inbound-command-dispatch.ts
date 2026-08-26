/**
 * Decoding an inbound P2P command and running it, reporting the two failures
 * separately.
 *
 * These used to share one `catch`, so EVERY handling failure — including a
 * storage write that timed out three layers down — was logged as "Failed to
 * deserialize P2P command", which it was not. A wrong diagnosis in a log is
 * worse than no log at all: it sends whoever reads it to inspect the wire
 * format, when the wire format was fine and the real fault was elsewhere.
 */

import { debugLog } from '@/lib/debug-config';
import { deserializeP2PCommand } from '@/types/p2p-commands';
import type { P2PCommand } from '@/types/p2p-commands';

/**
 * Decode `bytes` and pass the command to `handle`.
 *
 * Never throws: an inbound message that cannot be processed must not take down
 * the socket's message loop.
 */
export async function dispatchInboundCommand(
  bytes: Uint8Array,
  handle: (command: P2PCommand) => Promise<void>
): Promise<void> {
  let command: P2PCommand;
  try {
    command = deserializeP2PCommand(bytes);
  } catch (error) {
    debugLog('P2PMessageHandler', 'Failed to deserialize P2P command:', error);
    return;
  }

  try {
    await handle(command);
  } catch (error) {
    debugLog('P2PMessageHandler', 'Deserialized fine; handling the command failed:', error);
  }
}
