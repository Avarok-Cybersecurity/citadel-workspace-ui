/**
 * When the member is reminded of an event they make (design §3.7, §3.10): a few offsets to tick,
 * and, in words, the interim limitation until Signals timers ship: a reminder fires only while one
 * of their windows has the Calendar open, and one missed while none did is shown once on return.
 */
import { useId } from 'react';

/** The offsets offered, in minutes; one the event already has is offered too. */
export const REMINDER_CHOICES: readonly number[] = [10, 30, 60, 24 * 60];

const label = (minutes: number): string =>
  minutes % (24 * 60) === 0 ? `${minutes / (24 * 60)} day${minutes === 24 * 60 ? '' : 's'} before`
    : minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'} before` : `${minutes} minutes before`;

interface ReminderPickerProps {
  chosen: readonly number[];
  onChange: (chosen: readonly number[]) => void;
}

export function ReminderPicker({ chosen, onChange }: ReminderPickerProps): JSX.Element {
  const help: string = useId();
  const offered: number[] = [...new Set([...REMINDER_CHOICES, ...chosen])].sort((a: number, b: number) => a - b);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={help}>
      <legend className="mb-1 text-sm font-semibold text-foreground">Remind me</legend>
      <div className="flex min-w-0 flex-wrap gap-2">
        {offered.map((m: number) => (
          <label key={m} className="flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={chosen.includes(m)}
              onChange={(e): void => onChange(e.target.checked ? [...chosen, m] : chosen.filter((c: number) => c !== m))} />
            {label(m)}
          </label>
        ))}
      </div>
      <p id={help} className="text-sm text-muted-foreground">
        For now a reminder arrives only while the Calendar is open in one of your windows. One missed while none was open is shown once, under “While you were away”, when you come back.
      </p>
    </fieldset>
  );
}
