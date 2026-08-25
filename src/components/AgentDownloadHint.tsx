import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { interactive } from '@/lib/a11y';
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
/** Shown, copied, and asserted in tests from one place. */
const RUN_COMMAND = '--bind 127.0.0.1:12345 --backend filesystem';

export const AgentDownloadHint: React.FC<{ navigatorRef?: Navigator }> = ({ navigatorRef }) => {
  const candidates = agentPlatformCandidates(navigatorRef ?? navigator);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    runAsyncSetup(async () => {
      await navigator.clipboard.writeText(RUN_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/40 p-3 text-sm">
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

      <p className="text-muted-foreground mt-3">Once unpacked, run it with:</p>

      {/* Its own block, and deliberately not allowed to wrap: inline, this
          command broke mid-token — "--" ending one line and "backend
          filesystem" starting the next — which is how someone copies a command
          that then fails with a usage error they cannot explain.
          min-w-0 is load-bearing. A flex item defaults to min-width:auto, so a
          nowrap child cannot shrink below its content width and instead
          stretches the whole dialog grid: at 375px the header, body and this
          panel all ran 67px past the dialog's right edge. min-w-0 lets it
          scroll inside itself instead of pushing everything else out. */}
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <code className="bg-background min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded px-2 py-1 text-xs">
          {RUN_COMMAND}
        </code>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
          aria-label={copied ? 'Command copied' : 'Copy the run command'}
          {...interactive(handleCopy)}
        >
          {copied
            ? <Check className="h-4 w-4" aria-hidden="true" />
            : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <p className="text-muted-foreground mt-2">
        Both flags matter: there is no default bind address, and the default
        account store is in-memory.
      </p>

      <a
        href={RELEASES_PAGE}
        target="_blank"
        rel="noreferrer"
        className="text-foreground mt-2 inline-flex items-center gap-1 underline underline-offset-4 hover:text-muted-foreground"
      >
        All releases and checksums
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
};
