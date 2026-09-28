/**
 * One level in the Structure view: its icon and label, a handle to drag "may contain" edges from,
 * and (except the Workspace) a handle to receive them.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ComponentType } from 'react';
import { resolveIcon } from '@/lib/entity-type-registry';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, type LevelData } from '@/lib/hierarchy/schema-graph';
import { cn } from '@/lib/utils';

export type LevelFlowNode = Node<LevelData & Record<string, unknown>, 'level'>;

export function LevelNode({ data, selected }: NodeProps<LevelFlowNode>): JSX.Element {
  const Icon: ComponentType<{ className?: string }> = resolveIcon(data.icon);
  return (
    <div
      data-testid={`level-node-${data.typeName}`}
      style={{ width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT }}
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 bg-card px-3 text-card-foreground shadow-sm',
        selected ? 'border-primary' : 'border-control-border',
      )}
    >
      {!data.isRoot && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-primary" />}
      <Icon className="h-4 w-4 shrink-0 text-primary-accent" />
      <span className="truncate text-sm font-medium">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-primary" data-testid={`level-handle-${data.typeName}`} />
    </div>
  );
}
