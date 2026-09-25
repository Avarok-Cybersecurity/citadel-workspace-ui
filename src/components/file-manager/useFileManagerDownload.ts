/**
 * Downloading from the file manager, visibly.
 *
 * Live: right-click, Download pulled the file back byte-identical into the
 * agent's data dir (transfers/<peer cid>/...) and the UI said nothing the user
 * saw — no progress, no toast they noticed, no save, and the sidebar FILES list
 * still "No downloaded files yet". A pull goes to the AGENT's filesystem, not
 * the browser's, so there is no browser save to show; what the user needs is
 * that it is happening, that it finished, and where it went.
 *
 * So a pull now shows a progress toast that becomes the outcome, is recorded in
 * the history the FILES list reads, and offers "Show", which opens the same
 * dialog the FILES list opens: where the agent saved it, copyable.
 *
 * A Received file was "opened" by pulling it from RE-VFS under its local save
 * path, which is not a RE-VFS key; it timed out. It is already here, so "Open"
 * now shows where, without a pull.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { describeError } from '@/lib/describe-error';
import { isDownloadableState } from '@/lib/revfs/tree-queries';
import { RevfsFileState, type RevfsNode } from '@/types/revfs-types';
import type { RevfsDownloadHistory, RevfsDownloadRecord } from '@/lib/revfs/download-history';
import { revfsDownloadDetails, type FileDetails } from '@/components/layout/sidebar/file-details';

export interface DownloadDeps {
  downloadFile: (path: string) => Promise<string | undefined>;
  myCid: bigint | null;
  /** The peer holding the bytes, or null for server storage. */
  sourceCid: bigint | null;
  sourceLabel: string;
  history: RevfsDownloadHistory;
  showFile: (details: FileDetails) => void;
  now: () => number;
}

function recordFor(node: RevfsNode, savedTo: string, deps: DownloadDeps): RevfsDownloadRecord {
  return {
    id: `revfs:${node.fileMetadata?.fileId ?? node.path}`,
    fileName: node.name,
    fileSize: node.fileMetadata?.fileSize ?? 0,
    fileType: node.fileMetadata?.fileType ?? '',
    savedTo,
    sourceCid: deps.sourceCid,
    sourceLabel: deps.sourceLabel,
    downloadedAt: deps.now(),
  };
}

export async function downloadVisibly(node: RevfsNode, deps: DownloadDeps): Promise<void> {
  if (node.fileState === RevfsFileState.Received) {
    deps.showFile(revfsDownloadDetails(recordFor(node, node.fileMetadata?.virtualDirectory ?? '', deps)).details);
    return;
  }
  if (!isDownloadableState(node.fileState)) {
    toast.info(`${node.name} — ${node.fileState === RevfsFileState.Hosted ? 'Hosted for peer (encrypted, cannot open)' : 'Info only'}`);
    return;
  }

  const id: string | number = toast.loading(`Downloading ${node.name}…`, {
    description: `Your agent is fetching it from ${deps.sourceLabel}.`,
  });
  let savedTo: string;
  try {
    savedTo = (await deps.downloadFile(node.path)) ?? '';
  } catch (err: unknown) {
    toast.error(`Download failed: ${describeError(err)}`, { id, description: undefined });
    return;
  }

  const record: RevfsDownloadRecord = recordFor(node, savedTo, deps);
  let recorded: boolean = deps.myCid !== null;
  if (deps.myCid !== null) {
    try {
      await deps.history.record(deps.myCid, record);
    } catch {
      recorded = false;
    }
  }
  toast.success(`Downloaded ${node.name}`, {
    id,
    description: [
      savedTo ? `Saved by your agent to ${savedTo}` : 'Your agent did not report where it saved it.',
      recorded ? '' : ' It could not be added to your Files list.',
    ].join(''),
    action: { label: 'Show', onClick: (): void => deps.showFile(revfsDownloadDetails(record).details) },
  });
}

export function useFileManagerDownload(deps: DownloadDeps): (node: RevfsNode) => void {
  const { downloadFile, myCid, sourceCid, sourceLabel, history, showFile, now } = deps;
  return useCallback((node: RevfsNode): void => {
    void downloadVisibly(node, { downloadFile, myCid, sourceCid, sourceLabel, history, showFile, now });
  }, [downloadFile, myCid, sourceCid, sourceLabel, history, showFile, now]);
}
