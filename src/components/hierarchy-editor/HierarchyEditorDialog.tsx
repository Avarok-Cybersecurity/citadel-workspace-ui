/**
 * The hierarchy editor: how the business is organised, as an interactive graph.
 *
 * Owner, 2026-09-27: "its own modal with an interactive graph … drag and drop style for
 * constructing the hierarchy of the business, with clickable nodes to more granularly edit each
 * node". Two views, as the owner chose:
 * - Structure: the levels (Workspace, Office, Room by default) and what may contain what.
 * - Organisation: the real offices, rooms and other nodes, moved by dragging.
 *
 * Mounted only while open (see AdminSettingsSection), so Structure starts each time from the saved
 * schema rather than from an abandoned draft.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { StructureView } from './StructureView';
import { OrganisationView } from './OrganisationView';

interface HierarchyEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HierarchyEditorDialog({ open, onOpenChange }: HierarchyEditorDialogProps): JSX.Element {
  const { state } = useWorkspace();
  const [view, setView] = useState<string>('structure');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 p-0" data-testid="hierarchy-editor">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Hierarchy</DialogTitle>
          <DialogDescription>How the workspace is organised: its levels, and what sits where.</DialogDescription>
        </DialogHeader>
        {state.treeSchema === null ? (
          <p className="p-4 text-sm text-muted-foreground" data-testid="hierarchy-loading">Loading the hierarchy…</p>
        ) : (
          <Tabs value={view} onValueChange={setView} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 self-start">
              <TabsTrigger value="structure" data-testid="hierarchy-tab-structure">Structure</TabsTrigger>
              <TabsTrigger value="organisation" data-testid="hierarchy-tab-organisation">Organisation</TabsTrigger>
            </TabsList>
            <TabsContent value="structure" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
              <StructureView saved={state.treeSchema} />
            </TabsContent>
            <TabsContent value="organisation" className="mt-0 flex min-h-0 flex-1 data-[state=inactive]:hidden">
              <OrganisationView schema={state.treeSchema} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
