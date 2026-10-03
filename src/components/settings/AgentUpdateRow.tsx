/**
 * The agent's updater settings: install automatically when nobody is signed in (on until the
 * user turns it off), and Check now. Agent-wide, not per account. Hidden when the agent has no
 * updater (before 0.8.7, or a build without one).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { askUpdater } from '@/lib/agent-update/requests';
import { agentUpdate, updaterSettings, type AgentUpdate, type UpdaterSettings } from '@/lib/agent-update/update-state';
import { describeFailure } from '@/lib/failure-message';

export function versionLine(settings: UpdaterSettings, update: AgentUpdate | null): string {
  if (update) return `Citadel Agent ${settings.current}. ${update.latest} is available.`;
  const checked: string = settings.lastChecked === null
    ? 'not checked yet'
    : `last checked ${new Date(Number(settings.lastChecked) * 1000).toLocaleString()}`;
  return `Citadel Agent ${settings.current}, up to date (${checked}).`;
}

export function AgentUpdateRow(): JSX.Element | null {
  const settings: UpdaterSettings | null = useSyncExternalStore(updaterSettings.subscribe, updaterSettings.get);
  const update: AgentUpdate | null = useSyncExternalStore(agentUpdate.subscribe, agentUpdate.get);
  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    askUpdater('UpdateGetStatus').catch((): void => undefined);
  }, []);

  if (!settings || settings.current === '') return null;

  const change = (on: boolean): void => {
    setError(null);
    askUpdater('UpdateSetSettings', { auto_install: on })
      .catch((e: unknown) => setError(describeFailure(e, 'The setting was not saved.')));
  };
  const check = (): void => {
    setChecking(true);
    setError(null);
    askUpdater('UpdateCheckNow')
      .catch((e: unknown) => setError(describeFailure(e, 'The check did not finish.')))
      .finally(() => setChecking(false));
  };
  const shown: string | null = error ?? settings.lastError;

  return (
    <div className="space-y-2 p-3 rounded-lg bg-background/50" data-testid="agent-update-settings">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="agent-auto-install" className="text-sm font-medium">Automatically install updates when no account is signed in</Label>
          <p id="agent-auto-install-description" className="text-xs text-muted-foreground">{versionLine(settings, update)}</p>
        </div>
        <Switch id="agent-auto-install" aria-describedby="agent-auto-install-description" data-testid="agent-auto-install"
          checked={settings.autoInstall} onCheckedChange={change} />
      </div>
      <div className="flex items-center justify-between gap-3">
        {shown ? <p role="alert" className="text-xs text-destructive">{shown}</p> : <span />}
        <Button size="sm" variant="secondary" onClick={check} disabled={checking} data-testid="agent-update-check" className="gap-2">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          {checking ? 'Checking…' : 'Check now'}
        </Button>
      </div>
    </div>
  );
}
