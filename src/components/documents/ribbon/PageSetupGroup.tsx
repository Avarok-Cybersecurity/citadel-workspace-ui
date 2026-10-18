/**
 * Layout › Page Setup: Margins, Orientation, Size and Columns, each a menu of choices that
 * sends one SetSectionProperty for the sections the selection spans. The editor does not
 * report a section's setup, so no choice is shown as the current one.
 */
import { Columns2, FileText, RectangleHorizontal, Ruler, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLUMN_CHOICES, MARGIN_CHOICES, ORIENTATION_CHOICES, SIZE_CHOICES, type PageSetupChoice } from './page-setup';
import { RIBBON_CONTROL } from './RibbonButton';
import { RibbonMenu } from './RibbonMenu';
import { RibbonGroup } from './RibbonToolbar';
import { useRibbon, type Ribbon } from './ribbon-context';

interface SetupMenu {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly choices: readonly PageSetupChoice[];
}

const MENUS: readonly SetupMenu[] = [
  { id: 'margins', label: 'Margins', icon: Ruler, choices: MARGIN_CHOICES },
  { id: 'orientation', label: 'Orientation', icon: RectangleHorizontal, choices: ORIENTATION_CHOICES },
  { id: 'size', label: 'Size', icon: FileText, choices: SIZE_CHOICES },
  { id: 'columns', label: 'Columns', icon: Columns2, choices: COLUMN_CHOICES },
];

function SetupOption({ menu, choice, onChoose }: { menu: SetupMenu; choice: PageSetupChoice; onChoose: () => void }): JSX.Element {
  const { disabledReason }: Ribbon = useRibbon();
  return (
    <button type="button" data-roving-item="" data-testid={`ribbon-page-${menu.id}-${choice.id}`} aria-disabled={disabledReason !== null}
      onClick={(): void => { if (disabledReason === null) onChoose(); }}
      className={cn(RIBBON_CONTROL, 'h-auto min-h-[44px] w-full flex-col items-start justify-center px-3 py-1 text-left')}>
      <span>{choice.label}</span>
      <span className="text-[12px] text-muted-foreground">{choice.detail}</span>
    </button>
  );
}

export function PageSetupGroup(): JSX.Element {
  const { run }: Ribbon = useRibbon();
  return (
    <RibbonGroup label="Page Setup" testId="ribbon-page-setup" collapses={true} icon={FileText}>
      {MENUS.map((menu: SetupMenu): JSX.Element => (
        <RibbonMenu key={menu.id} testId={`ribbon-page-${menu.id}`} label={menu.label} icon={menu.icon} text={menu.label} widthPx={240}>
          {(close: () => void): JSX.Element[] => menu.choices.map((choice: PageSetupChoice): JSX.Element => (
            <SetupOption key={choice.id} menu={menu} choice={choice}
              onChoose={(): void => { close(); void run({ name: 'setSectionProperty', patch: choice.patch }, `set the ${menu.label.toLowerCase()} to ${choice.label}`); }} />
          ))}
        </RibbonMenu>
      ))}
    </RibbonGroup>
  );
}
