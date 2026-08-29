/**
 * The facts about a peer connection, as shown in chat settings.
 *
 * Extracted from ChatSettingsPanel, which is one of the files held at its
 * current length by check-file-length's ratchet — an exemption is a ceiling,
 * so adding to it means taking something out.
 *
 * "Connection Type: P2P Encrypted" used to sit here, a constant rendered under
 * a label that reads as live status. It says the same thing whether the peer is
 * connected, offline, or queueing through ILM. It is now labelled as the
 * property of the channel that it is.
 */

import { formatBytes } from '@/lib/format-bytes';

interface ConnectionFactsProps {
  peerCid: string;
  revfsQuota: number;
}

export function ConnectionFacts({ peerCid, revfsQuota }: ConnectionFactsProps) {
  const settings = { revfsQuota };

  return (
    <>
  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
    <span className="text-sm text-muted-foreground">Peer CID</span>
    <span className="text-sm text-foreground/80 font-mono">{peerCid.slice(0, 16)}...</span>
  </div>
  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
    {/* "Connection Type" read as live status while being a
        constant. Relabelled to what it actually states: a
        property of the channel, true whether or not the peer is
        reachable right now. */}
    <span className="text-sm text-muted-foreground">Encryption</span>
    <span className="text-sm text-foreground/80">End-to-end</span>
  </div>
  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
    <span className="text-sm text-muted-foreground">First Connected</span>
    <span className="text-sm text-foreground/80">
      {((): string => {
        try {
          const ts: string | null = localStorage.getItem(`peer-first-seen:${peerCid}`);
          if (!ts) {
            localStorage.setItem(`peer-first-seen:${peerCid}`, Date.now().toString());
            return 'Just now';
          }
          return new Date(parseInt(ts)).toLocaleDateString();
        } catch { return 'Unknown'; }
      })()}
    </span>
  </div>
  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
    <span className="text-sm text-muted-foreground">Storage Used</span>
    <span className="text-sm text-foreground/80">
      {formatBytes(settings.revfsQuota - (settings.revfsQuota * 0.85))}
    </span>
      </div>
    </>
  );
}
