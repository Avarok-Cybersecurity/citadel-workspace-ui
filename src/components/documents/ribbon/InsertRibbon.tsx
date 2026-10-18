/**
 * The Insert tab: Table, Pictures, Links, Comments,
 * Footnotes, Breaks and Symbols.
 */
import { Asterisk, Image, Link, MessageSquarePlus, Omega, SeparatorHorizontal, Table } from 'lucide-react';
import { BreakButtons, FootnoteButton, SymbolPicker } from './BreaksAndSymbols';
import { CommentControl, LinkControls } from './LinkAndComment';
import { PictureControl } from './PictureControl';
import { RibbonGroup, RibbonToolbar } from './RibbonToolbar';
import { TablePicker } from './TablePicker';

export function InsertRibbon({ commentAuthor }: { commentAuthor: string | null }): JSX.Element {
  return (
    <RibbonToolbar label="Insert" testId="ribbon-insert-toolbar">
      <RibbonGroup label="Tables" testId="ribbon-tables" collapses={false} icon={Table}><TablePicker /></RibbonGroup>
      <RibbonGroup label="Pictures" testId="ribbon-pictures" collapses={false} icon={Image}><PictureControl /></RibbonGroup>
      <RibbonGroup label="Links" testId="ribbon-links" collapses={false} icon={Link}><LinkControls /></RibbonGroup>
      <RibbonGroup label="Comments" testId="ribbon-comments" collapses={false} icon={MessageSquarePlus}><CommentControl author={commentAuthor} /></RibbonGroup>
      <RibbonGroup label="Footnotes" testId="ribbon-footnotes" collapses={false} icon={Asterisk}><FootnoteButton /></RibbonGroup>
      <RibbonGroup label="Breaks" testId="ribbon-insert-breaks" collapses={true} icon={SeparatorHorizontal}><BreakButtons idPrefix="ribbon-insert" /></RibbonGroup>
      <RibbonGroup label="Symbols" testId="ribbon-symbols-group" collapses={false} icon={Omega}><SymbolPicker /></RibbonGroup>
    </RibbonToolbar>
  );
}
