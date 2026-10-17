/**
 * Where a document node opens: the host an app's editor mounts inside.
 *
 * For R1 it is the shell only. The Citadel Docs canvas editor is a separate work item and
 * mounts in the region marked below; it receives these same props, so the contract is fixed
 * here rather than by whichever editor arrives first. The host does no I/O: what the person
 * may do arrives in `permissions`, already decided by the caller.
 */
import { citadelApp, type CitadelApp, type CitadelAppId } from '@/lib/citadel-apps/registry';
import type { ActionGate } from '@/hooks/use-permission-result';

export interface DocumentPermissions {
  /** Whether the person may change the document, and when not, the reason to show. */
  edit: ActionGate;
}

export interface DocumentHostProps {
  nodeId: string;
  appId: CitadelAppId;
  /** The node's name, which is the document's title. */
  title: string;
  permissions: DocumentPermissions;
}

export function DocumentHost({ nodeId, appId, title, permissions }: DocumentHostProps): JSX.Element {
  const app: CitadelApp = citadelApp(appId);
  const Icon: CitadelApp['icon'] = app.icon;
  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="document-host" data-node-id={nodeId} data-app={appId}>
      <header className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground" title={title}>{title}</h1>
          <p className="text-xs text-muted-foreground">{app.name}</p>
        </div>
      </header>
      {!permissions.edit.enabled && (
        <p role="status" data-testid="document-read-only" className="border-b border-border px-4 py-2 text-sm text-muted-foreground sm:px-6">
          Read only. {permissions.edit.reason}
        </p>
      )}
      <section
        aria-label={`${app.name} editor`}
        data-testid="document-editor-region"
        className="m-4 flex flex-1 items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground sm:m-6"
      >
        {app.name} editor loads here
      </section>
    </div>
  );
}

/** A node that names an app this client cannot read: said plainly, never opened as a page. */
export function UnreadableDocument({ title, reason }: { title: string; reason: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-2 bg-background p-6" data-testid="document-unreadable">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        This document cannot be opened here. {reason} Updating Citadel may fix this.
      </p>
    </div>
  );
}
