/**
 * The side panel for one node in the Organisation view: open it, add a child of any level its
 * level may contain, or delete it.
 *
 * Each action applies at once, through the same requests the sidebar uses, and the result
 * arrives through the workspace's node events, so the graph redraws from the store.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getEntityMetadata } from '@/lib/entity-type-registry';
import { isEnterCommit } from '@/lib/keyboard-commit';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import type { OrgData } from '@/lib/hierarchy/schema-graph';

interface OrgPanelProps {
  node: OrgData;
  /** The levels this node's level may contain, from the saved schema. */
  childLevels: string[];
  /** Where this node may legally go, as the sidebar's move picker offers: the keyboard's drag. */
  destinations: Array<{ id: string; name: string }>;
  onOpen: () => void;
  onMove: (targetId: string) => void;
  onAddChild: (level: string, name: string) => Promise<void>;
  onDelete: () => void;
}

export function OrgPanel({ node, childLevels, destinations, onOpen, onMove, onAddChild, onDelete }: OrgPanelProps): JSX.Element {
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState('');
  const isRoot: boolean = node.nodeId === WORKSPACE_ROOT_ID;
  const add = async (): Promise<void> => {
    if (adding === null || name.trim() === '') return;
    await onAddChild(adding, name.trim());
    setAdding(null);
    setName('');
  };
  return (
    <aside className="w-full md:w-72 shrink-0 space-y-3 overflow-y-auto border-t md:border-t-0 md:border-l border-border p-4" data-testid="org-panel">
      <div>
        <h3 className="font-semibold">{node.name}</h3>
        <p className="text-sm text-muted-foreground">{getEntityMetadata(node.typeName).label}</p>
      </div>
      {!isRoot && <Button variant="outline" className="w-full" onClick={onOpen} data-testid="org-open">Open</Button>}
      {!isRoot && destinations.length > 0 && (
        <Select value="" onValueChange={onMove}>
          <SelectTrigger aria-label="Move into" data-testid="org-move"><SelectValue placeholder="Move into…" /></SelectTrigger>
          <SelectContent>
            {destinations.map((d) => <SelectItem key={d.id} value={d.id} data-testid={`org-move-${d.id}`}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {childLevels.map((level: string) => (
        <Button key={level} variant="outline" className="w-full" onClick={() => { setAdding(level); setName(''); }} data-testid={`org-add-${level}`}>
          Add {getEntityMetadata(level).label}
        </Button>
      ))}
      {adding !== null && (
        <div className="space-y-2">
          <Input
            aria-label={`Name of the new ${getEntityMetadata(adding).label}`}
            placeholder={getEntityMetadata(adding).namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (isEnterCommit(e)) { const _: Promise<void> = add(); } }}
            data-testid="org-new-name"
          />
          <Button className="w-full" disabled={name.trim() === ''} onClick={() => { const _: Promise<void> = add(); }} data-testid="org-create">
            Create {getEntityMetadata(adding).label}
          </Button>
        </div>
      )}
      {!isRoot && <Button variant="destructive" className="w-full" onClick={onDelete} data-testid="org-delete">Delete</Button>}
    </aside>
  );
}
