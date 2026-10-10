/**
 * Copy text, and say how it went.
 *
 * Three copy buttons logged a refused write and stopped: the click did nothing visible, so a person
 * pasting later pasted whatever they had before. `copied` flips for two seconds on success so the
 * control can show a tick; a refusal is a toast that says what to do instead.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useToast } from '@/hooks/use-toast';
import { toastError } from '@/lib/toast-helpers';

const COPIED_FOR_MS: number = 2000;

export interface CopyToClipboard {
  copied: boolean;
  copy: (text: string) => Promise<void>;
}

export function useCopyToClipboard(): CopyToClipboard {
  const { toast } = useToast();
  const [copied, setCopied] = useState<boolean>(false);
  const timer: MutableRefObject<number | undefined> = useRef<number | undefined>(undefined);
  useEffect(() => (): void => window.clearTimeout(timer.current), []);

  const copy: (text: string) => Promise<void> = useCallback(async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopied(false);
      toastError(toast, 'Could not copy', 'Your browser refused clipboard access. Select the text and copy it instead.');
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout((): void => setCopied(false), COPIED_FOR_MS);
  }, [toast]);

  return { copied, copy };
}
