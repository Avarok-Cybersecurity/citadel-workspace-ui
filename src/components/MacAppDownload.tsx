import React from 'react';
import { macAppDownloadUrl, MAC_APP_ASSET, RELEASES_PAGE } from '@/lib/agent-download';
import { Button } from '@/components/ui/button';
import { OS_ICONS } from '@/components/icons/os-icons';
import { ExternalLink } from 'lucide-react';

/**
 * The Mac download: the app, three steps, and nothing to type.
 *
 * The app runs the agent with this site's settings itself (apps/macos-agent), sits in the menu
 * bar and starts at login, so the page no longer shows a command. The disk image is notarised
 * and stapled, which is what lets macOS open it without the "cannot be verified" refusal the
 * bare binary in the archive met.
 */
export const MacAppDownload: React.FC = () => {
  const AppleIcon: React.FC<{ className?: string }> = OS_ICONS['macos-arm64'];
  return (
    <>
      <div className="mt-3">
        <Button size="sm" asChild>
          <a href={macAppDownloadUrl()} download={MAC_APP_ASSET} data-testid="agent-download-macos-app">
            <AppleIcon className="mr-2 h-4 w-4" />
            Download Citadel for Mac
          </a>
        </Button>
      </div>
      <ol className="text-muted-foreground mt-3 list-decimal space-y-1 pl-5">
        <li>Open the downloaded file.</li>
        <li>Drag Citadel Agent into Applications.</li>
        <li>Open Citadel Agent. It runs in your menu bar and starts when you log in.</li>
      </ol>
      <p className="text-muted-foreground mt-2">For Apple Silicon and Intel Macs, macOS 13 or later.</p>
      <a
        href={RELEASES_PAGE}
        target="_blank"
        rel="noreferrer"
        className="text-foreground mt-2 inline-flex items-center gap-1 py-1 min-h-[24px] underline underline-offset-4 hover:text-muted-foreground"
      >
        All releases and checksums
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </>
  );
};
