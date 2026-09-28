/**
 * The Structure view: the workspace's levels as a graph, edited as a draft and saved at once.
 *
 * - Drag from a level's lower handle to another level to let it contain that level.
 * - Select an edge and press Delete to stop that nesting.
 * - Drag "New level" onto the canvas, or type a name and press Add.
 * - Click a level to edit it in the side panel. Its "Can contain" boxes do the same as dragging,
 *   for the keyboard and small screens.
 *
 * Edits go through `schema-edits`, which refuses what the server would, as the edit happens.
 * Save sends one UpdateTreeSchema, and the server's reason is shown if it still refuses.
 */
import { useMemo, useState, type DragEvent } from 'react';
import { ReactFlow, Background, Controls, type Connection, type Edge, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DomainNode, EntityTypeConfig, TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { toastSuccess } from '@/lib/toast-helpers';
import { describeFailure } from '@/lib/failure-message';
import { getEntityTypeString } from '@/lib/entity-type-registry';
import { isEnterCommit } from '@/lib/keyboard-commit';
import WorkspaceService from '@/lib/workspace-service';
import { addLevel, childrenOf, connect, disconnect, draftProblem, removeLevel, updateLevel, WORKSPACE_LEVEL, type EditResult } from '@/lib/hierarchy/schema-edits';
import { schemaToGraph } from '@/lib/hierarchy/schema-graph';
import { LevelNode, type LevelFlowNode } from './LevelNode';
import { LevelPanel } from './LevelPanel';

const NODE_TYPES: { level: typeof LevelNode } = { level: LevelNode };
const PALETTE_DRAG_TYPE: string = 'application/x-citadel-new-level';

const sameShape = (a: TreeSchema, b: TreeSchema): boolean =>
  JSON.stringify([a.rules, a.entity_type_configs]) === JSON.stringify([b.rules, b.entity_type_configs]);

/** The first "Level N" not yet taken, for a level dropped from the palette before it is named. */
function freshLevelName(schema: TreeSchema): string {
  const taken: Set<string> = new Set<string>(schema.entity_type_configs.map((c: EntityTypeConfig) => c.type_name));
  let n: number = taken.size;
  while (taken.has(`Level ${n}`)) n += 1;
  return `Level ${n}`;
}

export function StructureView({ saved }: { saved: TreeSchema }): JSX.Element {
  const { state } = useWorkspace();
  const { toast } = useToast();
  const isMobile: boolean = useIsMobile();
  const [draft, setDraft] = useState<TreeSchema>(saved);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  /** Take an edit, or show why it was refused; the refusal is reported here, not returned. */
  const apply = (result: EditResult, select?: string): void => {
    if (!result.ok) { setProblem(result.reason); return; }
    setDraft(result.schema);
    setProblem(null);
    if (select !== undefined) setSelected(select);
  };

  const graph: ReturnType<typeof schemaToGraph> = useMemo(() => schemaToGraph(draft), [draft]);
  const nodes: LevelFlowNode[] = graph.nodes.map((n) => ({ ...n, type: 'level', selected: n.id === selected, deletable: false, data: { ...n.data } }));
  const edges: Edge[] = graph.edges.map((e) => ({ ...e, deletable: true, selected: e.id === selectedEdge }));
  const inUse: Map<string, number> = useMemo(() => {
    const counts: Map<string, number> = new Map<string, number>();
    for (const node of Object.values(state.nodes) as DomainNode[]) {
      const level: string = getEntityTypeString(node.entity_type);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    return counts;
  }, [state.nodes]);

  const addNamed = (name: string): void => {
    const result: EditResult = addLevel(draft, name);
    apply(result, name.trim());
    if (result.ok) setNewName('');
  };
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (!e.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) return;
    e.preventDefault();
    const name: string = freshLevelName(draft);
    apply(addLevel(draft, name), name);
  };
  const onNodeClick: NodeMouseHandler<LevelFlowNode> = (_e, node) => { setSelected(node.id); setSelectedEdge(null); };
  // Several edges can go at once; each disconnect builds on the last, not on the same draft.
  const removeEdges = (gone: Edge[]): void => {
    const result: EditResult = gone.reduce<EditResult>(
      (acc: EditResult, e: Edge) => (acc.ok ? disconnect(acc.schema, e.source, e.target) : acc),
      { ok: true, schema: draft },
    );
    apply(result);
    setSelectedEdge(null);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await WorkspaceService.updateTreeSchema(draft);
      toastSuccess(toast, 'Hierarchy saved');
      setProblem(null);
    } catch (error) {
      setProblem(describeFailure(error, 'The hierarchy could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const dirty: boolean = !sameShape(draft, saved);
  const blocking: string | null = draftProblem(draft);
  const config: EntityTypeConfig | undefined = draft.entity_type_configs.find((c: EntityTypeConfig) => c.type_name === selected);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.setData(PALETTE_DRAG_TYPE, 'level'); e.dataTransfer.effectAllowed = 'copy'; }}
          className="cursor-grab rounded-md border-2 border-dashed border-control-border px-3 py-1.5 text-sm"
          data-testid="palette-new-level"
          aria-hidden="true"
        >
          New level
        </div>
        <Input className="w-44" placeholder="Level name" value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (isEnterCommit(e)) addNamed(newName); }} data-testid="new-level-name" aria-label="New level name" />
        <Button variant="outline" onClick={() => addNamed(newName)} disabled={newName.trim() === ''} data-testid="add-level">Add</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => { setDraft(saved); setProblem(null); }} disabled={!dirty || saving} data-testid="discard-hierarchy">Discard</Button>
          <Button onClick={() => { const _: Promise<void> = save(); }} disabled={!dirty || blocking !== null || saving} data-testid="save-hierarchy">
            {saving ? 'Saving…' : 'Save hierarchy'}
          </Button>
        </div>
      </div>
      {(problem ?? (dirty ? blocking : null)) && (
        <p role="alert" className="border-b border-border px-3 py-2 text-sm text-destructive-emphasis" data-testid="hierarchy-problem">
          {problem ?? blocking}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {isMobile ? (
          <ul className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Levels">
            {graph.nodes.map((n) => (
              <li key={n.id}><Button variant={n.id === selected ? 'default' : 'ghost'} className="w-full justify-start" onClick={() => setSelected(n.id)} data-testid={`level-list-${n.id}`}>{n.data.label}</Button></li>
            ))}
          </ul>
        ) : (
          <div className="min-h-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="structure-canvas">
            <ReactFlow<LevelFlowNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              nodesDraggable={false}
              onConnect={(c: Connection) => apply(connect(draft, c.source, c.target))}
              onEdgesDelete={removeEdges}
              onEdgeClick={(_e, edge: Edge) => { setSelectedEdge(edge.id); setSelected(null); }}
              onNodeClick={onNodeClick}
              onPaneClick={() => { setSelected(null); setSelectedEdge(null); }}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        )}
        {config && (
          <LevelPanel
            key={config.type_name}
            config={config}
            inUse={inUse.get(config.type_name) ?? 0}
            others={graph.nodes.filter((n) => n.id !== config.type_name && n.id !== WORKSPACE_LEVEL).map((n) => ({ typeName: n.id, label: n.data.label }))}
            contains={childrenOf(draft, config.type_name)}
            onChange={(patch) => apply(updateLevel(draft, config.type_name, patch))}
            onToggleChild={(child: string, on: boolean) => apply(on ? connect(draft, config.type_name, child) : disconnect(draft, config.type_name, child))}
            onRemove={() => apply(removeLevel(draft, config.type_name, inUse.get(config.type_name) ?? 0), '')}
          />
        )}
      </div>
    </div>
  );
}
