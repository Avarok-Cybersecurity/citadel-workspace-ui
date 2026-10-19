/**
 * Insert › Header & Footer, and the bar shown while the selection is in a story other than the
 * body (EditHeaderFooter, GoToFootnote, ReturnToBody: docs/edit-commands.md § Stories).
 *
 * Header and Footer put the caret in the default header or footer, adding an empty one when the
 * section has none. The section is the one being edited when the caret is in a header or footer;
 * from the body it is the first, since the editor reports the caret's page setup but not which
 * section that is. Clicking a header or footer line on the page enters it too.
 *
 * A header or footer shown on many pages is one story, and the editor draws its caret and
 * selection on the first of those pages only. The bar says so, so a cursor that seems to stay
 * on page one while the header repeats below is explained, not mistaken for a fault.
 */
import { PanelBottom, PanelTop } from 'lucide-react';
import type { Furniture, Story } from '@/lib/cdoc/editor/controller';
import { RIBBON_CONTROL, RibbonButton } from './RibbonButton';
import { useRibbon, type Ribbon } from './ribbon-context';

/** The section the Header and Footer buttons edit: the current header's or footer's, else the first. */
function sectionFor(story: Story | null): number {
  return story !== null && (story.kind === 'header' || story.kind === 'footer') ? story.section : 0;
}

export function HeaderFooterButtons(): JSX.Element {
  const { run, story }: Ribbon = useRibbon();
  const edit = (furniture: Furniture): void => {
    void run({ name: 'editHeaderFooter', furniture, section: sectionFor(story), which: 'default' }, `edit the ${furniture}`);
  };
  return (
    <>
      <RibbonButton testId="ribbon-edit-header" label="Edit the header" icon={PanelTop} text="Header" pressed={story?.kind === 'header'} onPress={(): void => edit('header')} />
      <RibbonButton testId="ribbon-edit-footer" label="Edit the footer" icon={PanelBottom} text="Footer" pressed={story?.kind === 'footer'} onPress={(): void => edit('footer')} />
    </>
  );
}

const WHICH: Readonly<Record<Extract<Story, { kind: Furniture }>['which'], string>> = {
  default: '',
  firstPage: ' (first page)',
  evenPages: ' (even pages)',
};

/** What the bar says about `story`; null in the body, where there is no bar. */
export function storyNotice(story: Story | null): string | null {
  if (story === null || story.kind === 'body') return null;
  if (story.kind === 'footnote') return 'Editing a footnote.';
  return `Editing the ${story.kind}${WHICH[story.which]} of section ${story.section + 1}. It shows on every page of the section; its cursor and selection are drawn on the first of them.`;
}

export function StoryBar(): JSX.Element | null {
  const { run, story }: Ribbon = useRibbon();
  const notice: string | null = storyNotice(story);
  if (notice === null) return null;
  return (
    <div data-testid="docs-story-bar" className="mt-1 flex flex-wrap items-center justify-between gap-x-3 rounded-md bg-muted px-3 text-[14px] text-foreground">
      <p className="min-w-0 py-2">{notice}</p>
      <button type="button" data-testid="docs-story-back" className={RIBBON_CONTROL}
        onClick={(): void => { void run({ name: 'returnToBody' }, 'return to the document'); }}>
        Back to the document
      </button>
    </div>
  );
}
