import React from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AGENT_ASSETS,
  RELEASES_PAGE,
  agentDownloadUrl,
  agentPlatformCandidates,
  type AgentPlatform,
} from '@/lib/agent-download';

const LABELS: Record<AgentPlatform, string> = {
  'macos-arm64': 'macOS (Apple Silicon)',
  'macos-x64': 'macOS (Intel)',
  'linux-x64': 'Linux (x64)',
  'windows-x64': 'Windows (x64)',
};

/**
 * Offers the agent download when the app cannot reach one.
 *
 * "Unable to reach the connection service" is only half an answer to someone who
 * has never installed the agent — the app is unusable without it and nothing
 * else on screen says where to get one. Shown inside the connection-failure
 * modal, where the question actually arises, rather than as a banner everyone
 * sees forever.
 */
export const AgentDownloadHint: React.FC<{ navigatorRef?: Navigator }> = ({ navigatorRef }) => {
  const candidates = agentPlatformCandidates(navigatorRef ?? navigator);

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="text-foreground font-medium">Don&apos;t have the agent running?</p>
      <p className="text-muted-foreground mt-1">
        Citadel needs a small program on this machine to hold your connections.
      </p>

      {candidates.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidates.map((platform) => (
            <Button key={platform} variant="secondary" size="sm" asChild>
              <a href={agentDownloadUrl(platform)} download={AGENT_ASSETS[platform]}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {LABELS[platform]}
              </a>
            </Button>
          ))}
        </div>
      ) : (
        // No build fits this device — phones and tablets land here. Offering a
        // desktop archive would download fine and never run.
        <p className="text-muted-foreground mt-2">
          The agent runs on a desktop or laptop; this device cannot host one.
        </p>
      )}

      <p className="text-muted-foreground mt-3">
        Once unpacked, run it with{' '}
        <code className="bg-background rounded px-1 py-0.5 text-xs">
          --bind 127.0.0.1:12345 --backend filesystem
        </code>
        . Both flags matter: there is no default bind address, and the default
        account store is in-memory.
      </p>

      <a
        href={RELEASES_PAGE}
        target="_blank"
        rel="noreferrer"
        className="text-primary mt-2 inline-flex items-center gap-1 hover:underline"
      >
        All releases and checksums
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
};
