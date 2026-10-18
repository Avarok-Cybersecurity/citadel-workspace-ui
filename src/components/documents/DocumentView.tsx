/**
 * The workspace view for a document node: decides what the person may do and hands the host
 * its props. Kept apart from DocumentHost so the host stays a pure contract for the editor.
 */
import { usePermission } from '@/hooks/use-permission';
import { Permission } from '@/contexts/PermissionsContext';
import { gateOnKnownAnswer } from '@/hooks/use-permission-result';
import type { DomainNode } from '@/components/layout/sidebar/tree-node-types';
import type { NodeAppState } from '@/lib/citadel-apps/node-app-metadata';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import { loadCdocRuntime } from '@/lib/cdoc/runtime-loader';
import { DocumentHost, UnreadableDocument } from './DocumentHost';

/** Until the document-content work item reads the node's stored document, every node opens blank. */
const BLANK_DOCUMENT: DocumentSource = { kind: 'blank' };

interface DocumentViewProps {
  node: DomainNode;
  app: Exclude<NodeAppState, { kind: 'none' }>;
}

export function DocumentView({ node, app }: DocumentViewProps): JSX.Element {
  const edit: ReturnType<typeof usePermission> = usePermission(node.id, Permission.EditContent);
  if (app.kind === 'unreadable') return <UnreadableDocument title={node.name} reason={app.reason} />;
  return (
    <DocumentHost
      nodeId={node.id}
      appId={app.app}
      title={node.name}
      permissions={{ edit: gateOnKnownAnswer(edit) }}
      documentSource={BLANK_DOCUMENT}
      loadCdocRuntime={loadCdocRuntime}
    />
  );
}
