/**
 * Open a node (office, room, or any level) in the workspace view.
 *
 * One definition for the sidebar and the hierarchy editor: ask before leaving an unsaved
 * document, then point the workspace URL at the node, closing whatever overlay was open.
 */
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { mayLeaveEditor } from '@/lib/leave-editor';
import { buildWorkspacePath } from '@/lib/workspace-navigation';
import { useConfirm } from '@/components/shared/confirm-dialog';

export function useOpenNode(): (nodeId: string) => Promise<void> {
  const location: ReturnType<typeof useLocation> = useLocation();
  const navigate: NavigateFunction = useNavigate();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  return useCallback(async (nodeId: string): Promise<void> => {
    if (!(await mayLeaveEditor(confirm))) return;
    const params: URLSearchParams = new URLSearchParams(location.search);
    params.set('nodeId', nodeId);
    params.delete('section');
    // Clear P2P chat overlay when navigating to a different node
    params.delete('showP2P');
    params.delete('channel');
    params.delete('p2pUser');
    navigate(buildWorkspacePath(params));
  }, [location.search, navigate, confirm]);
}
