/**
 * One tab's listings with a search over name, summary and categories, and the states around them:
 * loading, nothing listed, nothing found, and a source that could not be read.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { AppInstall } from 'citadel-workspace-client-ts';
import { searchApps, type ListedApp, type ListingOrigin } from '@/lib/citadel-apps/listing-model';
import { refusalCopy } from '@/lib/citadel-apps/refusal-copy';
import { ListingCard } from './ListingCard';
import type { MarketplaceData } from './use-marketplace-data';

interface AppsBrowseProps {
  data: MarketplaceData;
  origin: ListingOrigin;
  onOpen: (app: ListedApp) => void;
}

export function AppsBrowse({ data, origin, onOpen }: AppsBrowseProps): JSX.Element {
  const [query, setQuery] = useState<string>('');
  const listed: ListedApp[] = data.apps.filter((a: ListedApp) => a.origin === origin);
  const found: ListedApp[] = searchApps(listed, query);
  const problem: string | null = origin === 'global'
    ? (data.globalProblem === null ? null : 'The global catalogue could not be loaded.')
    : (data.serverProblem === null ? null : refusalCopy(data.serverProblem));
  const installedOf = (id: string): AppInstall | null => data.installs.find((i: AppInstall) => i.app_id === id) ?? null;

  return (
    <div className="flex flex-col gap-[12px]" data-testid={`apps-browse-${origin}`}>
      <Input
        type="search"
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        placeholder="Search apps"
        aria-label="Search apps"
        className="min-h-[44px]"
        data-testid="apps-search"
      />
      {problem !== null && <p role="alert" className="text-sm text-destructive-emphasis" data-testid="apps-browse-problem">{problem}</p>}
      {data.loading ? (
        <p role="status" className="text-sm text-muted-foreground" data-testid="apps-browse-loading">Loading apps…</p>
      ) : listed.length === 0 ? (
        <p className="py-[12px] text-sm text-muted-foreground" data-testid="apps-browse-empty">
          {origin === 'global' ? 'No apps are in the global catalogue yet.' : 'No apps have been published to this workspace yet.'}
        </p>
      ) : found.length === 0 ? (
        <p className="py-[12px] text-sm text-muted-foreground" data-testid="apps-browse-none-found">No apps match “{query}”.</p>
      ) : (
        <ul className="flex flex-col gap-[8px]">
          {found.map((app: ListedApp) => (
            <ListingCard key={`${app.origin}:${app.manifest.id}`} app={app} installed={installedOf(app.manifest.id)} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}
