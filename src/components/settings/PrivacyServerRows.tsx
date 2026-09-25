import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import WorkspaceService from '@/lib/workspace-service';
import { describeFailure } from '@/lib/failure-message';

/**
 * The two privacy rows that talk to the workspace server.
 *
 * Profile visibility is ENFORCED there: the server withholds the avatar, email
 * and title from members who are not your contacts. So the switch shows what
 * the server holds (the own member record) and is disabled until that arrives;
 * a local default here would be a claim about someone else's data store.
 */
export function ProfileVisibilityRow(): JSX.Element {
  const { toast } = useToast();
  const shown: boolean | undefined = useWorkspace().state.currentUser?.showProfileToStrangers;
  const [saving, setSaving] = useState<boolean>(false);

  const change = async (show: boolean): Promise<void> => {
    setSaving(true);
    try {
      // The switch follows the server's answer ('user:profile-updated'), not the click.
      await WorkspaceService.updateUserProfile({ showProfileToStrangers: show });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Profile visibility was not changed', description: describeFailure(error, 'The server did not accept the change.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
      <div>
        <Label htmlFor="profile-visibility" className="text-sm font-medium">Profile Visibility</Label>
        <p className="text-xs text-muted-foreground">
          Show your picture, email and job title to workspace members you aren&apos;t connected with.
          When off, the server sends them only to your contacts — admins included. Your name and role stay visible.
        </p>
      </div>
      <Switch id="profile-visibility"
        disabled={shown === undefined || saving}
        checked={shown ?? false}
        onCheckedChange={(v: boolean) => { void change(v); }}
      />
    </div>
  );
}

interface StrangerRequestsRowProps {
  accepts: boolean;
  /** Saves the local setting, which is what the refusal reads. */
  onLocalChange: (accepts: boolean) => void;
}

/**
 * Enforced by this client, which answers incoming registration requests. The
 * published copy only lets a refused requester be told why, so a failure to
 * publish is reported but does not undo the choice.
 */
export function StrangerRequestsRow({ accepts, onLocalChange }: StrangerRequestsRowProps): JSX.Element {
  const { toast } = useToast();

  const change = async (next: boolean): Promise<void> => {
    onLocalChange(next);
    try {
      await WorkspaceService.updateUserProfile({ acceptsRequestsFromStrangers: next });
    } catch (error: unknown) {
      toast({
        title: 'Saved on this device',
        description: `${describeFailure(error, 'The server could not be told.')} People you refuse may see a generic "did not accept" message.`,
      });
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
      <div>
        <Label htmlFor="stranger-requests" className="text-sm font-medium">Requests From Strangers</Label>
        <p className="text-xs text-muted-foreground">
          Let people you aren&apos;t connected with ask to connect and message you. When off, their requests are
          declined automatically and they are told you aren&apos;t accepting them; your existing contacts are unaffected.
          Applies to every account signed in on this device.
        </p>
      </div>
      <Switch id="stranger-requests"
        checked={accepts}
        onCheckedChange={(v: boolean) => { void change(v); }}
      />
    </div>
  );
}
