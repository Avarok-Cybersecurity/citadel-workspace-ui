/**
 * The Layout tab: Breaks, and the paragraph's indent and spacing. Page Setup (margins,
 * orientation, size, columns) is absent on purpose: the editor has no command that sets a
 * section's properties yet (SetSectionProperty is scheduled in cdoc-edit).
 */
import { Pilcrow, SeparatorHorizontal } from 'lucide-react';
import { BreakButtons } from './BreaksAndSymbols';
import { IndentFields, SpacingFields } from './ParagraphFields';
import { RibbonGroup, RibbonToolbar } from './RibbonToolbar';

export function LayoutRibbon(): JSX.Element {
  return (
    <RibbonToolbar label="Layout" testId="ribbon-layout-toolbar">
      <RibbonGroup label="Breaks" testId="ribbon-layout-breaks" icon={SeparatorHorizontal}><BreakButtons idPrefix="ribbon-layout" /></RibbonGroup>
      <RibbonGroup label="Indent" testId="ribbon-layout-indent" icon={Pilcrow}><IndentFields idPrefix="ribbon-layout" /></RibbonGroup>
      <RibbonGroup label="Spacing" testId="ribbon-layout-spacing" icon={Pilcrow}><SpacingFields idPrefix="ribbon-layout" /></RibbonGroup>
    </RibbonToolbar>
  );
}
