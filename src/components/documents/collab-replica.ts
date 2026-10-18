/**
 * The keeper for a document shared over the workspace: its replica is opened and kept by a
 * DocumentSession on this tab's session (lib/cdoc/collab), loaded on first use so neither the
 * session nor cdoc is in the shell's bundle. What the session reports is shown to the person,
 * one notice per kind of problem, so a repeated failure updates its notice instead of stacking.
 */
import { toast } from 'sonner';
import type { EditorSession } from '@/lib/cdoc/editor/editor-session';
import type { DocumentSessionError } from '@/lib/cdoc/collab/session-errors';
import type { ReplicaKeeper } from './DocsCanvas';

function showProblem(nodeId: string, error: DocumentSessionError): void {
  toast.error(error.message, { id: `document-collab:${nodeId}:${error.problem.kind}` });
}

export function collaborationKeeper(nodeId: string): ReplicaKeeper {
  return (open, show, fail): (() => void) => {
    let live: boolean = true;
    let release: (() => void) | null = null;
    import('@/lib/cdoc/collab/replica-keeper').then(
      ({ workspaceReplicaKeeper }): void => {
        if (!live) return;
        const keep: ReplicaKeeper = workspaceReplicaKeeper<EditorSession>(nodeId, (error: DocumentSessionError): void => showProblem(nodeId, error));
        release = keep(open, show, fail);
      },
      (error: unknown): void => {
        if (live) fail(error);
      },
    );
    return (): void => {
      live = false;
      release?.();
    };
  };
}
