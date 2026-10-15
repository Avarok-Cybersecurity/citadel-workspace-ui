import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { describeFailure } from '@/lib/failure-message';
import { sendGroupFile } from '@/lib/group-conversations/send-group-file';

export interface GroupFileShare {
  /** True while a share is in flight; the paperclip shows a spinner and both entry points wait. */
  sending: boolean;
  /** Offer `file` to every member. Never rejects: a failed share is a toast. */
  share: (file: File) => Promise<void>;
}

/**
 * The one way a file reaches a peer group, used by the paperclip and by a drop on the
 * conversation, so both share the same in-flight state and the same failure report.
 *
 * Failure of the share as a whole (nothing was sent) is a toast; a member who could not be
 * reached is a row in the resulting bubble, not a toast, because it is part of what happened to
 * this file and has to outlive the toast.
 */
export function useGroupFileShare(groupId: string): GroupFileShare {
  const { toast } = useToast();
  const [sending, setSending] = useState<boolean>(false);
  const share: (file: File) => Promise<void> = useCallback(async (file: File): Promise<void> => {
    setSending(true);
    try {
      await sendGroupFile(groupId, file);
    } catch (error) {
      toast({ title: 'File not shared', description: describeFailure(error, 'Please try again.'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [groupId, toast]);
  return { sending, share };
}
