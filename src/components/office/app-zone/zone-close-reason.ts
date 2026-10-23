/**
 * Why a zone's running app is closed, read from what the zone shows next: the install gone, the
 * person no longer reached by it, or another release replacing it. Pure. AppZone.tsx records the
 * next view in a layout effect of the parent, which React runs in the commit's layout phase,
 * before the passive-effect cleanup that closes the app, so the close carries the reason of the
 * commit that removed or replaced it. A zone whose page goes away keeps the last view: `unmount`.
 */
import type { AppInstall } from 'citadel-workspace-client-ts';
import type { CloseReason } from '@/lib/citadel-apps/sdk/generated/CloseReason';
import type { ZoneView } from './zone-state';

/** The reason to close the app that ran `running`, given what the zone shows next. */
export function closeReasonFor(running: AppInstall, next: ZoneView): CloseReason {
  switch (next.kind) {
    case 'ready': return next.install.id === running.id && next.install.manifest_sha256 !== running.manifest_sha256 ? 'version_update' : 'unmount';
    case 'loading': case 'not-available': return 'unmount';
    case 'install': case 'ask-admin': return 'uninstall';
    case 'disabled': case 'suspended': case 'needs-answer': return 'access_revoked';
    case 'needs-consent': case 'outdated': return 'version_update';
  }
}
