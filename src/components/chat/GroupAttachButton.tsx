/**
 * "Send file" for a peer group: pick a file, offer it to every member, through the
 * conversation's one share path (useGroupFileShare.ts), which a drop on the conversation uses too.
 */
import React, { useRef, type RefObject } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import type { GroupFileShare } from './useGroupFileShare';

export function GroupAttachButton({ fileShare }: { fileShare: GroupFileShare }): JSX.Element {
  const inputRef: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
  const { sending, share } = fileShare;
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
