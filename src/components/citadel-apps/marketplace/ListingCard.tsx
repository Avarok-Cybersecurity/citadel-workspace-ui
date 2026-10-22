/**
 * One app in a list: icon, name, summary, publisher and categories, every one a text node (the
 * listing is the publisher's words, never markup). The whole card is one 44px+ button.
 */
import type { AppInstall } from 'citadel-workspace-client-ts';
import type { ListedApp } from '@/lib/citadel-apps/listing-model';
import { AppIconImage } from './AppIconImage';

interface ListingCardProps {
  app: ListedApp;
  installed: AppInstall | null;
  onOpen: (app: ListedApp) => void;
}

export function ListingCard({ app, installed, onOpen }: ListingCardProps): JSX.Element {
  const m: ListedApp['manifest'] = app.manifest;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(app)}
        data-testid="apps-listing-card"
        data-app-id={m.id}
        className="flex min-h-[80px] w-full items-start gap-[12px] rounded-lg border border-border bg-card p-[12px] text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AppIconImage icon={m.icon} size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="flex flex-wrap items-baseline gap-x-[8px]">
            <span className="break-words font-medium text-foreground">{m.name}</span>
            <span className="text-xs text-muted-foreground">{m.version}</span>
            {installed !== null && <span className="text-xs font-medium text-success-emphasis" data-testid="apps-listing-installed">Installed</span>}
          </span>
          <span className="break-words text-sm text-foreground/80">{m.summary}</span>
          <span className="break-words text-xs text-muted-foreground">
            {m.publisher.name} · {m.categories.join(', ')}
          </span>
        </span>
      </button>
    </li>
  );
}
