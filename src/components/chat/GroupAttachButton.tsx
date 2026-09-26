/**
 * "Send file" for a peer group: pick a file, offer it to every member.
 *
 * Failure of the share as a whole (nothing was sent) is a toast; a member who
 * could not be reached is a row in the resulting bubble, not a toast, because
 * it is part of what happened to this file and has to outlive the toast.
 */
import React, { useRef, useState, type RefObject } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { describeFailure } from '@/lib/failure-message';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { sendGroupFile } from '@/lib/group-conversations/send-group-file';

export function GroupAttachButton({ groupId }: { groupId: string }): JSX.Element {
  const { toast } = useToast();
  const inputRef: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<boolean>(false);

  const share = async (file: File): Promise<void> => {
    setSending(true);
    try {
      await sendGroupFile(groupId, file);
    } catch (error) {
      toast({ title: 'File not shared', description: describeFailure(error, 'Please try again.'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file: File | undefined = e.target.files?.[0];
    // Cleared so picking the same file again still fires a change.
    e.target.value = '';
    if (file) runAsyncSetup(() => share(file));
  };

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={onChange} data-testid="group-file-input" aria-hidden="true" tabIndex={-1} />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => inputRef.current?.click()}
        disabled={sending}
        aria-label="Send file to the group"
        title="Send file"
        data-testid="group-attach-file"
        className="text-muted-foreground hover:text-foreground hover:bg-foreground/10"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </Button>
    </>
  );
}
