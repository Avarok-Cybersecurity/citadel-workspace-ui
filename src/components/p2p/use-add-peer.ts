import { useState } from 'react';
import { isUsablePeerCid } from '@/lib/peer-cid-input';
import { debugLog } from '@/lib/debug-config';

/**
 * The add-a-peer-by-CID form.
 *
 * Extracted to keep the peer list under the file cap, and because the error
 * copy is the interesting part. It used to say "Copy it from the peer's
 * account" — advice to do something the app does not allow: no screen anywhere
 * displays a full CID, only a six-character short handle. It named an internal
 * identifier, under an acronym the reader was never told, and pointed at a
 * place that does not exist. The two paths that actually work are the workspace
 * directory and Discover Peers, so those are what it names now.
 */
export function useAddPeer(
  register: (cid: bigint) => Promise<unknown>,
  onAdded: () => void,
) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const submit = async (): Promise<void> => {
    const entered: string = value.trim();
    if (!entered) return;

    // Before BigInt, which throws on anything else — see peer-cid-input.
    if (!isUsablePeerCid(entered)) {
      setError(
        'A peer CID is a number. Find the person in the workspace directory, or use Discover Peers in the sidebar.',
      );
      return;
    }

    setAdding(true);
    setError(null);
    try {
      await register(BigInt(entered));
      setValue('');
      onAdded();
    } catch (caught) {
      debugLog('P2PPeerList', 'Failed to add peer:', caught);
      // Shown, not only logged: debugLog is a no-op outside dev, so this was
      // silence. The server's own words where there are any.
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Could not add that peer. Check the CID and try again.',
      );
    } finally {
      setAdding(false);
    }
  };

  return { value, setValue, error, setError, adding, submit };
}
