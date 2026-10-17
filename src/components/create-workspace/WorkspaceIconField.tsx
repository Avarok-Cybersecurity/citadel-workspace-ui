/**
 * The optional workspace icon on the first /create step.
 *
 * Owner, 2026-09-27: "during the setup phase that creates a workspace, the user can provide an
 * icon". The same uploader and the same size rule as Workspace settings, so what is chosen here
 * is what the server accepts; it travels in the create request as `logo`.
 */
import { useState } from 'react';
import { AvatarUpload } from '@/components/settings/AvatarUpload';
import { WORKSPACE_ICON } from '@/components/settings/image-upload-kinds';
import { readyIcon, type IconResult } from '@/lib/workspace-metadata/workspace-icon';

interface WorkspaceIconFieldProps {
  /** The chosen icon as a data URL, or null for none. */
  logo: string | null;
  onLogoChange: (logo: string | null) => void;
}

export function WorkspaceIconField({ logo, onLogoChange }: WorkspaceIconFieldProps): JSX.Element {
  const [problem, setProblem] = useState<string | null>(null);
  const choose = (icon: string | null): void => {
    if (icon === null) { setProblem(null); onLogoChange(null); return; }
    const ready: IconResult = readyIcon(icon);
    setProblem(ready.ok ? null : ready.reason);
    onLogoChange(ready.ok ? ready.dataUrl : null);
  };
  return (
    <div className="space-y-2" data-testid="create-icon">
      <p className="text-sm font-medium text-foreground">Icon <span className="font-normal text-muted-foreground">(optional)</span></p>
      <AvatarUpload kind={WORKSPACE_ICON} currentAvatar={logo ?? undefined} onAvatarChange={choose} />
      {problem && <p role="alert" className="text-sm text-destructive-emphasis">{problem}</p>}
    </div>
  );
}
