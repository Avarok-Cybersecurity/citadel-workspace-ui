/**
 * The Organisation view: the workspace's actual offices, rooms and other nodes as a graph.
 *
 * - Drag a node onto another to move it there. A drop the saved hierarchy does not allow is
 *   refused, in its own words, before anything is sent; the server checks the move again.
 * - Click a node to open it, add a child of any level it may contain, or delete it.
 *
 * Changes apply at once, through the same requests the sidebar uses. The graph is redrawn from
 * the workspace store when their results arrive, so it never shows a move the server refused.
 */
import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, useNodesState, useReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOpenNode } from '@/hooks/use-open-node';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { toastError, toastSuccess } from '@/lib/toast-helpers';
import { describeFailure } from '@/lib/failure-message';
import { getEntityMetadata } from '@/lib/entity-type-registry';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import WorkspaceService from '@/lib/workspace-service';
import { childrenOf } from '@/lib/hierarchy/schema-edits';
import { dropProblem, moveDestinations, treeToGraph, type OrgData } from '@/lib/hierarchy/schema-graph';
import { OrgNode, type OrgFlowNode } from './OrgNode';
import { OrgPanel } from './OrgPanel';

const NODE_TYPES: { org: typeof OrgNode } = { org: OrgNode };
const labelOf = (level: string): string => getEntityMetadata(level).label;

const asFlow = (graph: ReturnType<typeof treeToGraph>): OrgFlowNode[] =>
  // The workspace itself is the fixed root; everything else can be dragged somewhere new.
  graph.nodes.map((n) => ({ ...n, type: 'org', deletable: false, draggable: n.id !== WORKSPACE_ROOT_ID, data: { ...n.data } }));

function Graph({ schema }: { schema: TreeSchema }): JSX.Element {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const isMobile: boolean = useIsMobile();
  const openNode: (id: string) => Promise<void> = useOpenNode();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  const flow: ReturnType<typeof useReactFlow<OrgFlowNode, Edge>> = useReactFlow<OrgFlowNode, Edge>();
  const all: DomainNode[] = useMemo(() => Object.values(state.nodes) as DomainNode[], [state.nodes]);
  const graph: ReturnType<typeof treeToGraph> = useMemo(() => treeToGraph(all, state.workspace?.name ?? 'Workspace'), [all, state.workspace?.name]);
  const [nodes, setNodes, onNodesChange] = useNodesState<OrgFlowNode>([]);
  const [selected, setSelected] = useState<OrgData | null>(null);

  // Re-laid out from the store whenever it changes, which also puts a refused drag back.
  useEffect(() => { setNodes(asFlow(graph)); }, [graph, setNodes]);

  const fail = (title: string, error: unknown): void => toastError(toast, title, describeFailure(error, title));

  const destinationsOf = (moved: OrgData): Array<{ id: string; name: string }> =>
    moveDestinations(schema, state.nodes, moved.nodeId, state.workspace?.name ?? 'Workspace');
  const parentOf = (id: string): string => all.find((n: DomainNode) => n.id === id)?.parent_id ?? WORKSPACE_ROOT_ID;

  /** The one move, for a drag and for the panel's "Move into". */
  const moveInto = async (moved: OrgData, targetId: string, targetName: string, targetType: string): Promise<void> => {
    if (!destinationsOf(moved).some((d) => d.id === targetId)) {
      toastError(toast, 'Cannot move there',
        dropProblem(schema, moved.typeName, targetType, labelOf) ?? `${moved.name} cannot go inside something it contains.`);
      setNodes(asFlow(graph));
      return;
    }
    try {
      await WorkspaceService.moveNode(moved.nodeId, targetId === WORKSPACE_ROOT_ID ? null : targetId);
      toastSuccess(toast, `Moved ${moved.name} into ${targetName}`);
    } catch (error) {
      fail('Could not move', error);
      setNodes(asFlow(graph));
    }
  };

  const onDragStop = (moved: OrgFlowNode): void => {
    const target: OrgFlowNode | undefined = flow.getIntersectingNodes(moved).find((n: OrgFlowNode) => n.id !== moved.id);
    if (!target || target.id === parentOf(moved.id)) { setNodes(asFlow(graph)); return; }
    const _: Promise<void> = moveInto(moved.data, target.id, target.data.name, target.data.typeName);
  };

  const panel: JSX.Element | null = selected && (
    <OrgPanel
      key={selected.nodeId}
      node={selected}
      childLevels={childrenOf(schema, selected.typeName)}
      destinations={destinationsOf(selected)}
      onOpen={() => { const _: Promise<void> = openNode(selected.nodeId); }}
      onMove={(targetId: string) => {
        const target: OrgData | undefined = graph.nodes.find((n) => n.id === targetId)?.data;
        if (target) { const _: Promise<void> = moveInto(selected, targetId, target.name, target.typeName); }
      }}
      onAddChild={async (level: string, name: string): Promise<void> => {
        try {
          await WorkspaceService.createNode(selected.nodeId, { Child: level }, name, '');
          toastSuccess(toast, `${labelOf(level)} created`);
        } catch (error) { fail(`Could not create the ${labelOf(level)}`, error); }
      }}
      onDelete={() => {
        const _: Promise<void> = (async (): Promise<void> => {
          if (!(await confirm({ title: `Delete ${selected.name}?`, description: 'Everything inside it is deleted too.', confirmLabel: 'Delete' }))) return;
          try {
            await WorkspaceService.deleteNode(selected.nodeId, true);
            setSelected(null);
          } catch (error) { fail('Could not delete', error); }
        })();
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {isMobile ? (
        <ul className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Organisation">
          {graph.nodes.map((n) => (
            <li key={n.id} style={{ paddingLeft: `${(all.find((d: DomainNode) => d.id === n.id)?.depth ?? 0) * 12}px` }}>
              <button type="button" className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => setSelected(n.data)} data-testid={`org-list-${n.id}`}>
                {n.data.name} <span className="text-muted-foreground">· {labelOf(n.data.typeName)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="min-h-0 flex-1" data-testid="organisation-canvas">
          <ReactFlow<OrgFlowNode>
            nodes={nodes}
            edges={graph.edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_e, node: OrgFlowNode) => onDragStop(node)}
            onNodeClick={(_e, node: OrgFlowNode) => setSelected(node.data)}
            onPaneClick={() => setSelected(null)}
            nodesConnectable={false}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
      {panel}
    </div>
  );
}

export function OrganisationView({ schema }: { schema: TreeSchema }): JSX.Element {
  return <ReactFlowProvider><Graph schema={schema} /></ReactFlowProvider>;
}
