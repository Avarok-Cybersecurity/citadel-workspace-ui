/**
 * Sending a file the user picked through the NATIVE picker.
 *
 * Distinct enough from `sendFile` to live apart: the browser never holds these
 * bytes. The service reads the file from disk itself and the browser only ever
 * sees a path and a size, so none of the in-memory reasoning that governs
 * `sendFile` — the inline-payload cap, the empty-File refusal, the
 * `InMemoryOnly` brand — applies here.
 */
import { debugLog } from '@/lib/debug-config';
import { sendAgentFile } from './send-agent-file';
import { openChannelBeforeSending } from './open-peer-channel';
import type { LifecycleDeps } from './transfer-lifecycle';

export async function sendFileWithNativePicker(
  deps: LifecycleDeps,
  recipientCid: string,
  title?: string,
  allowedExtensions?: string[]
): Promise<string> {
  const senderCid: bigint | null = await deps.io.getCurrentCid();
  if (!senderCid) {
    throw new Error('No active session');
  }

  await openChannelBeforeSending(deps, recipientCid);
  debugLog('transfer-lifecycle', 'Starting native file picker flow');

  const fileInfo: { file_path: string; file_name: string; file_size: bigint; } = (await deps.io.executeIntent({
    type: 'pick-file',
    cid: senderCid,
    title,
    allowedExtensions,
  })) as { file_path: string; file_name: string; file_size: bigint };

  debugLog('transfer-lifecycle', 'File picked', {
    path: fileInfo.file_path,
    name: fileInfo.file_name,
    size: fileInfo.file_size.toString(),
  });

  return sendAgentFile(
    deps,
    senderCid,
    recipientCid,
    { path: fileInfo.file_path, name: fileInfo.file_name, size: Number(fileInfo.file_size) },
    crypto.randomUUID(),
  );
}
