/**
 * Why a zone's running app is closed, read from what the zone shows next: the install gone, the
 * person no longer reached by it, another release replacing it, or this member's answers taking
 * back something it held (it restarts holding the new answers either way). Pure. AppZone.tsx records the
 * next view in a layout effect of the parent, which React runs in the commit's layout phase,
 * before the passive-effect cleanup that closes the app, so the close carries the reason of the
 * commit that removed or replaced it. A zone whose page goes away keeps the last view: `unmount`.
 */
import type { Capability } from 'citadel-workspace-client-ts';
import type { CloseReason } from '@/lib/citadel-apps/sdk/generated/CloseReason';
import type { ZoneView } from './zone-state';

/** What a running app was started with: its install, and what this member let it hold. */
export type RunningZone = Pick<Extract<ZoneView, { kind: 'ready' }>, 'install' | 'allowed'>;

function readyReason(running: RunningZone, next: Extract<ZoneView, { kind: 'ready' }>): CloseReason {
  if (next.install.id !== running.install.id) return 'unmount';
  if (next.install.manifest_sha256 !== running.install.manifest_sha256) return 'version_update';
  return running.allowed.some((c: Capability) => !next.allowed.includes(c)) ? 'access_revoked' : 'unmount';
}

/** The reason to close the app that ran `running`, given what the zone shows next. */
export function closeReasonFor(running: RunningZone, next: ZoneView): CloseReason {
  switch (next.kind) {
    case 'ready': return readyReason(running, next);
    case 'loading': case 'not-available': return 'unmount';
    case 'install': case 'ask-admin': return 'uninstall';
    case 'disabled': case 'suspended': case 'needs-answer': return 'access_revoked';
    case 'needs-consent': case 'outdated': return 'version_update';
  }
}
