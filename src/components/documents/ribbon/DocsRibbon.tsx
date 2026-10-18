/**
 * The Citadel Docs ribbon: Home, Insert and Layout, Word's commands in this app's design.
 * Every control sends one EditorCommand through the editor in EditorControllerContext and
 * hands focus back to the page; with no editor yet, or no right to edit, every control says
 * why it cannot run. Shortcuts are the editor's: the ribbon only names them.
 */
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { EditorState } from '@/lib/cdoc/editor/controller';
import type { ActionGate } from '@/hooks/use-permission-result';
import { useIsMobile } from '@/hooks/use-mobile';
import { CdocFontFaces } from './CdocFontFaces';
import { HomeRibbon } from './HomeRibbon';
import { InsertRibbon } from './InsertRibbon';
import { LayoutRibbon } from './LayoutRibbon';
import { useEditorController, useEditorState, type RibbonEditor } from './editor-context';
import { RibbonContext, useRibbonValue, type Ribbon } from './ribbon-context';
import type { RibbonEnvironment } from './ribbon-environment';

export type RibbonTab = 'home' | 'insert' | 'layout';

const TABS: readonly { readonly id: RibbonTab; readonly label: string }[] = [
  { id: 'home', label: 'Home' }, { id: 'insert', label: 'Insert' }, { id: 'layout', label: 'Layout' },
];

export interface DocsRibbonProps {
  /** Whether the person may change the document. */
  readonly edit: ActionGate;
  /** The name a new comment is signed with; null until it has loaded. */
  readonly commentAuthor: string | null;
  readonly environment: RibbonEnvironment;
}

export function DocsRibbon({ edit, commentAuthor, environment }: DocsRibbonProps): JSX.Element {
  const editor: RibbonEditor | null = useEditorController();
  const state: EditorState | null = useEditorState(editor);
  const compact: boolean = useIsMobile();
  const ribbon: Ribbon = useRibbonValue(editor, state, edit, environment, compact);
  const [tab, setTab] = useState<RibbonTab>('home');
  return (
    <RibbonContext.Provider value={ribbon}>
      <TooltipProvider delayDuration={400}>
        <CdocFontFaces />
        <Tabs value={tab} onValueChange={(next: string): void => setTab(next as RibbonTab)} data-testid="docs-ribbon"
          className="border-b border-border bg-card px-2 pb-1 sm:px-4">
          <TabsList aria-label="Ribbon" className="h-auto gap-1 bg-transparent p-0 pt-1">
            {TABS.map((t: { id: RibbonTab; label: string }): JSX.Element => (
              <TabsTrigger key={t.id} value={t.id} data-testid={`docs-ribbon-tab-${t.id}`}
                className="h-[44px] rounded-b-none border-b-2 border-transparent px-4 data-[state=active]:border-primary data-[state=active]:shadow-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {ribbon.disabledReason !== null && (
            <p role="status" data-testid="docs-ribbon-unavailable" className="py-1 text-[13px] text-muted-foreground">{ribbon.disabledReason}</p>
          )}
          <TabsContent value="home" className="mt-1"><HomeRibbon /></TabsContent>
          <TabsContent value="insert" className="mt-1"><InsertRibbon commentAuthor={commentAuthor} /></TabsContent>
          <TabsContent value="layout" className="mt-1"><LayoutRibbon /></TabsContent>
        </Tabs>
      </TooltipProvider>
    </RibbonContext.Provider>
  );
}
