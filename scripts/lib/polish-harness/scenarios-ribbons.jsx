/**
 * The Citadel Docs ribbon, unmodified, over the FakeEditor its unit tests use (the real
 * controller needs the cdoc worker, which the editor wiring brings). `docs-ribbon` reports a
 * known caret (a Heading 1 run, so pressed states and the gallery's current style draw);
 * `docs-ribbon-unknown` reports none, the state the engine is in today.
 */
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { DocsRibbon } from '@/components/documents/ribbon/DocsRibbon';
import { EditorControllerContext } from '@/components/documents/ribbon/editor-context';
import { browserRibbonEnvironment } from '@/components/documents/ribbon/ribbon-environment';
import { FakeEditor } from '@/components/documents/ribbon/__tests__/fake-editor';

const KNOWN = {
  known: true,
  run: { bold: true, font: 'Calibri Light', size: 32, color: '#2F5496' },
  paragraph: { style: 'Heading1', alignment: 'left', spacing: { before: 1200, after: 0 } },
};

function Ribbon({ caret }) {
  const [editor] = useState(() => new FakeEditor(caret, true));
  return (
    <EditorControllerContext.Provider value={editor}>
      <div className="flex h-screen flex-col bg-background">
        <DocsRibbon edit={{ enabled: true, reason: null }} commentAuthor="Ada Lovelace" environment={browserRibbonEnvironment()} />
        <div className="flex-1 bg-muted" data-testid="ribbon-page-stand-in" />
      </div>
      <Toaster />
    </EditorControllerContext.Provider>
  );
}

export const RIBBON_SCENARIOS = {
  'docs-ribbon': () => <Ribbon caret={KNOWN} />,
  'docs-ribbon-unknown': () => <Ribbon caret={{ known: false }} />,
};
