/** How many secure links are in use: yours, and the workspace's shared pool when it has one. */
import { quotaFraction, quotaText, type LinkQuota } from '@/lib/share/link-lifetime';

export function QuotaMeter({ quota, testId }: { quota: LinkQuota; testId: string }): JSX.Element {
  const used: number = Math.round(quotaFraction(quota) * 100);
  const text: string = quotaText(quota);
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Secure links in use</span>
        <span className="text-foreground" data-testid={`${testId}-text`}>{text}</span>
      </div>
      <div role="meter" aria-label="Secure links in use" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} aria-valuetext={text}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className={used >= 100 ? 'h-full bg-destructive' : 'h-full bg-primary-accent'} style={{ width: `${used}%` }} />
      </div>
    </div>
  );
}
