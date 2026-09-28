/**
 * One office, room or other node in the Organisation view: its level's icon, its name, and the
 * level's label.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ComponentType } from 'react';
import { getEntityMetadata } from '@/lib/entity-type-registry';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, type OrgData } from '@/lib/hierarchy/schema-graph';
import { cn } from '@/lib/utils';

export type OrgFlowNode = Node<OrgData & Record<string, unknown>, 'org'>;

export function OrgNode({ data, selected }: NodeProps<OrgFlowNode>): JSX.Element {
  const meta: ReturnType<typeof getEntityMetadata> = getEntityMetadata(data.typeName);
  const Icon: ComponentType<{ className?: string }> = meta.icon;
  return (
    <div
      data-testid={`org-node-${data.nodeId}`}
      style={{ width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT }}
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 bg-card px-3 text-card-foreground shadow-sm',
        selected ? 'border-primary' : 'border-control-border',
      )}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="!opacity-0" />
      <Icon className="h-4 w-4 shrink-0 text-primary-accent" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{data.name}</p>
        <p className="truncate text-xs text-muted-foreground">{meta.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!opacity-0" />
    </div>
  );
}
