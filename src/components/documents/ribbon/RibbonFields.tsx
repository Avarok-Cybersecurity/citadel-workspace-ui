/**
 * The ribbon's pickers and number fields. A picker shows the caret's value, or an empty "—"
 * entry when that value is not known, never a guess; choosing sends the command at once. A
 * number field commits on Enter or when it loses focus, and only a valid, changed value.
 */
import { useEffect, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import { isEnterCommit } from '@/lib/keyboard-commit';
import { cn } from '@/lib/utils';
import { RibbonTip } from './RibbonButton';
import { useRibbon } from './ribbon-context';

const FIELD: string = 'h-[44px] shrink-0 rounded-md border border-input bg-background px-2 text-[14px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

export interface PickerOption {
  readonly value: string;
  readonly label: string;
}

export interface RibbonPickerProps {
  readonly testId: string;
  readonly label: string;
  readonly options: readonly PickerOption[];
  /** The caret's value, or null when it is not known. */
  readonly value: string | null;
  readonly widthPx: number;
  readonly onPick: (value: string) => void;
}

const UNKNOWN_VALUE: string = '';

export function RibbonPicker({ testId, label, options, value, widthPx, onPick }: RibbonPickerProps): JSX.Element {
  const { disabledReason } = useRibbon();
  const known: boolean = value !== null && options.some((o: PickerOption): boolean => o.value === value);
  return (
    <RibbonTip label={label} reason={disabledReason}>
      <select
        data-roving-item=""
        data-testid={testId}
        aria-label={label}
        aria-disabled={disabledReason !== null}
        className={cn(FIELD, 'pr-1')}
        style={{ width: widthPx }}
        value={known && value !== null ? value : UNKNOWN_VALUE}
        onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
          if (disabledReason === null && e.target.value !== UNKNOWN_VALUE) onPick(e.target.value);
        }}
      >
        {!known && <option value={UNKNOWN_VALUE}>—</option>}
        {options.map((o: PickerOption): JSX.Element => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </RibbonTip>
  );
}

export interface RibbonNumberFieldProps {
  readonly testId: string;
  readonly label: string;
  /** The short label shown beside the field ("Before"); `label` names it in full. */
  readonly shortLabel: string;
  /** The unit shown after the field ("pt"). */
  readonly unit: string;
  /** The caret's value in that unit, or null when it is not known. */
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  readonly onCommit: (value: number) => void;
}

function display(value: number | null): string {
  return value === null ? '' : String(value);
}

export function RibbonNumberField({ testId, label, shortLabel, unit, value, min, max, onCommit }: RibbonNumberFieldProps): JSX.Element {
  const { disabledReason } = useRibbon();
  const [draft, setDraft] = useState<string>(display(value));
  useEffect((): void => setDraft(display(value)), [value]);
  const parsed: number = Number(draft.trim());
  const valid: boolean = draft.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const commit: () => void = (): void => {
    if (disabledReason === null && valid && parsed !== value) onCommit(parsed);
    // Back to what the caret reports: the field shows the document, never a pending draft.
    setDraft(display(value));
  };
  return (
    <RibbonTip label={`${label} (${min}–${max} ${unit})`} reason={disabledReason}>
      <label className="mx-1 inline-flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
        <span className="whitespace-nowrap" aria-hidden="true">{shortLabel}</span>
        <input
          type="text"
          inputMode="decimal"
          data-roving-item=""
          data-testid={testId}
          aria-label={`${label}, ${unit}`}
          aria-invalid={draft.trim() !== '' && !valid}
          aria-disabled={disabledReason !== null}
          readOnly={disabledReason !== null}
          placeholder="—"
          className={cn(FIELD, 'w-[64px] text-right')}
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => setDraft(e.target.value)}
          onBlur={(_e: FocusEvent<HTMLInputElement>): void => commit()}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>): void => {
            if (isEnterCommit(e)) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') setDraft(display(value));
          }}
        />
        <span aria-hidden="true">{unit}</span>
      </label>
    </RibbonTip>
  );
}
