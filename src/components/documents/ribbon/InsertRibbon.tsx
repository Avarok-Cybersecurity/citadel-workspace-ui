/**
 * The Insert tab: Table, Links, Comments, Footnotes, Breaks and Symbols. Picture is absent on
 * purpose: InsertImage names a content id, and nothing yet hands an image's bytes to the
 * editor in the worker, so the picture would insert as a reference to nothing.
 */
import { Asterisk, Link, MessageSquarePlus, Omega, SeparatorHorizontal, Table } from 'lucide-react';
import { BreakButtons, FootnoteButton, SymbolPicker } from './BreaksAndSymbols';
import { CommentControl, LinkControls } from './LinkAndComment';
import { RibbonGroup, RibbonToolbar } from './RibbonToolbar';
import { TablePicker } from './TablePicker';

export function InsertRibbon({ commentAuthor }: { commentAuthor: string | null }): JSX.Element {
  return (
    <RibbonToolbar label="Insert" testId="ribbon-insert-toolbar">
      <RibbonGroup label="Tables" testId="ribbon-tables" icon={Table}><TablePicker /></RibbonGroup>
      <RibbonGroup label="Links" testId="ribbon-links" icon={Link}><LinkControls /></RibbonGroup>
      <RibbonGroup label="Comments" testId="ribbon-comments" icon={MessageSquarePlus}><CommentControl author={commentAuthor} /></RibbonGroup>
      <RibbonGroup label="Footnotes" testId="ribbon-footnotes" icon={Asterisk}><FootnoteButton /></RibbonGroup>
      <RibbonGroup label="Breaks" testId="ribbon-insert-breaks" icon={SeparatorHorizontal}><BreakButtons idPrefix="ribbon-insert" /></RibbonGroup>
      <RibbonGroup label="Symbols" testId="ribbon-symbols-group" icon={Omega}><SymbolPicker /></RibbonGroup>
    </RibbonToolbar>
  );
}
