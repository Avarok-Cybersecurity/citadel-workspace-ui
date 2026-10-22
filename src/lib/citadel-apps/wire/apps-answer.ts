/**
 * An `AppsResponse` the marketplace acts on, read strictly: the variants it asks for, each of its
 * exact shape, or `Refused` with a refusal it knows. Anything else -- an unknown variant, a field
 * missing or extra, a wrong type -- is `malformed`, which every request treats as a refusal.
 */
import type { AppInstall, AppListing, AppsRefusal, Permission } from 'citadel-workspace-client-ts';
import { Permission as PermissionNames } from '@/lib/permissions-service/types';
import { exactly, isAppInstall, isAppListing, isCapability, isObject, isString, isStrings, single } from './install-shape';

export type AppsAnswer =
  | { kind: 'catalogue'; listings: AppListing[] }
  | { kind: 'listing'; listing: AppListing }
  /** `disabledForMe`: the ids among `installs` the caller hid for themselves, as the server keeps them. */
  | { kind: 'installs'; installs: AppInstall[]; disabledForMe: string[] }
  | { kind: 'installed'; install: AppInstall }
  | { kind: 'uninstalled'; installId: string }
  | { kind: 'updated'; install: AppInstall }
  | { kind: 'up-to-date'; installId: string }
  | { kind: 'consented'; install: AppInstall }
  | { kind: 'disabled-for-me'; installId: string; disabled: boolean }
  | { kind: 'install-requested' }
  | { kind: 'refused'; refusal: AppsRefusal }
  | { kind: 'malformed' };

const UNIT_REFUSALS: readonly string[] = [
  'Unavailable', 'ScopeNotSupported', 'ScopeOutsideAudience', 'BadSignature', 'ArtifactMismatch', 'VersionNotNewer',
  'NotActive', 'Policy', 'NoHost', 'HeaderManaged', 'ServerFeatureUnavailable',
];
const CAPABILITY_REFUSALS: readonly string[] = ['CapabilityNotGrantable', 'FirstPartyOnly', 'NotRequested', 'RequiredCapabilityLeftOut', 'Ungranted'];
const isPermission = (v: unknown): v is Permission => isString(v) && (Object.values(PermissionNames) as string[]).includes(v);

export function isAppsRefusal(v: unknown): v is AppsRefusal {
  if (isString(v)) return UNIT_REFUSALS.includes(v);
  if (!isObject(v) || Object.keys(v).length !== 1) return false;
  const [name] = Object.keys(v);
  if (CAPABILITY_REFUSALS.includes(name)) return isCapability(v[name]);
  if (name === 'PermissionRequired') return isPermission(v[name]);
  return (name === 'InvalidManifest' || name === 'Limit') && isString(v[name]);
}

const field = <T>(v: unknown, name: string): T => (v as Record<string, Record<string, unknown>>)[name] as T;
const installOf = (v: unknown, name: string): AppInstall => field<{ install: AppInstall }>(v, name).install;
const hasInstall = (v: unknown, name: string): boolean => single(v, name, (x: unknown) => exactly(x, { install: isAppInstall }));
const hasId = (v: unknown, name: string): boolean => single(v, name, (x: unknown) => exactly(x, { install_id: isString }));

export function readAppsAnswer(payload: unknown): AppsAnswer {
  if (payload === 'InstallRequested') return { kind: 'install-requested' };
  if (single(payload, 'Refused', isAppsRefusal)) return { kind: 'refused', refusal: field<AppsRefusal>(payload, 'Refused') };
  if (single(payload, 'Catalogue', (x: unknown) => exactly(x, { listings: (l: unknown) => Array.isArray(l) && l.every(isAppListing) }))) {
    return { kind: 'catalogue', listings: field<{ listings: AppListing[] }>(payload, 'Catalogue').listings };
  }
  if (single(payload, 'Listing', (x: unknown) => exactly(x, { listing: isAppListing }))) {
    return { kind: 'listing', listing: field<{ listing: AppListing }>(payload, 'Listing').listing };
  }
  if (single(payload, 'Installs', (x: unknown) => exactly(x, { installs: (l: unknown) => Array.isArray(l) && l.every(isAppInstall), disabled_for_me: isStrings }))) {
    const i: { installs: AppInstall[]; disabled_for_me: string[] } = field<{ installs: AppInstall[]; disabled_for_me: string[] }>(payload, 'Installs');
    return { kind: 'installs', installs: i.installs, disabledForMe: i.disabled_for_me };
  }
  if (hasInstall(payload, 'Installed')) return { kind: 'installed', install: installOf(payload, 'Installed') };
  if (hasInstall(payload, 'Updated')) return { kind: 'updated', install: installOf(payload, 'Updated') };
  if (hasInstall(payload, 'Consented')) return { kind: 'consented', install: installOf(payload, 'Consented') };
  if (hasId(payload, 'Uninstalled')) return { kind: 'uninstalled', installId: field<{ install_id: string }>(payload, 'Uninstalled').install_id };
  if (hasId(payload, 'UpToDate')) return { kind: 'up-to-date', installId: field<{ install_id: string }>(payload, 'UpToDate').install_id };
  if (single(payload, 'DisabledForMe', (x: unknown) => exactly(x, { install_id: isString, disabled: (d: unknown) => typeof d === 'boolean' }))) {
    const d: { install_id: string; disabled: boolean } = field<{ install_id: string; disabled: boolean }>(payload, 'DisabledForMe');
    return { kind: 'disabled-for-me', installId: d.install_id, disabled: d.disabled };
  }
  return { kind: 'malformed' };
}
