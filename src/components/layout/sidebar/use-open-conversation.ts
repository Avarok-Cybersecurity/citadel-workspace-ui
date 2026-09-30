/**
 * Open the conversation with a contact from the sidebar -- one path for every
 * row that can start a chat: the contact rows and a node's member rows.
 *
 * The workspace view renders P2P chat instead of the editor, so this unmounts
 * the buffer as completely as selecting another node does; it asks first.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { mayLeaveEditor } from '@/lib/leave-editor';
import { conversationHref } from './active-conversation';

export function useOpenConversation(): (cid: string, username: string) => Promise<void> {
  const location: ReturnType<typeof useLocation> = useLocation();
  const navigate: NavigateFunction = useNavigate();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  return async (cid: string, username: string): Promise<void> => {
    if (!(await mayLeaveEditor(confirm))) return;
    navigate(conversationHref(location.pathname, location.search, { cid, username }));
  };
}
