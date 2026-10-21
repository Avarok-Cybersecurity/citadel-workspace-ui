/**
 * What the consent screen lists, decided from the manifest, the installer's permissions and the
 * optional capabilities they turned off: one row per requested capability (its words, the
 * publisher's reason, its risk, its hosts one by one), what the app can never do, whose key this
 * is, and exactly what Install would grant. `check_grant` (rules.rs) is the control.
 */
import type { AppInstall, AppManifest, Capability, CapabilityRequest } from 'citadel-workspace-client-ts';
import { PERMISSION_LABELS } from '@/lib/permissions-service/types';
import { CAPABILITY_COPY, FIRST_PARTY_ONLY, NETWORK_CAPABILITIES, type Risk } from './capability-copy';
import type { Authority } from './scope-options';

export interface ConsentRow {
  cap: Capability;
  label: string;
  why: string;
  risk: Risk;
  optional: boolean;
  /** Whether it is in the grant: required ones always, optional ones unless turned off. */
  on: boolean;
  /** Why the installer cannot grant it; null when they can. */
  blocked: string | null;
  /** The hosts of a network capability, each shown on its own; empty otherwise. */
  hosts: string[];
}

export function consentRows(manifest: AppManifest, turnedOff: ReadonlySet<Capability>, authority: Authority, domain: string): ConsentRow[] {
  return manifest.capabilities.map((r: CapabilityRequest): ConsentRow => {
    const copy: (typeof CAPABILITY_COPY)[Capability] = CAPABILITY_COPY[r.cap];
    const held: string = authority.holds(copy.installerNeeds, domain);
    const blocked: string | null = FIRST_PARTY_ONLY.has(r.cap)
      ? 'Only apps published by Avarok may have this.'
      : held === 'no' ? `You need “${PERMISSION_LABELS[copy.installerNeeds]}” to allow this.`
      : held === 'unknown' ? 'Checking your permissions…' : null;
    return {
      cap: r.cap, label: copy.label, why: r.why, risk: copy.risk, optional: r.optional,
      on: !r.optional || (!turnedOff.has(r.cap) && blocked === null), blocked, hosts: r.hosts ?? [],
    };
  });
}

/** The capabilities Install sends: every row that is on. */
export const grantOf = (rows: readonly ConsentRow[]): Capability[] => rows.filter((r: ConsentRow) => r.on).map((r: ConsentRow) => r.cap);

/** Why Install cannot be pressed whatever the person does: a required row they cannot grant. */
export function grantProblem(rows: readonly ConsentRow[]): string | null {
  const stuck: ConsentRow | undefined = rows.find((r: ConsentRow) => !r.optional && r.blocked !== null);
  if (stuck !== undefined) return `This app needs “${stuck.label}”, which you cannot allow. ${stuck.blocked}`;
  const on: Set<Capability> = new Set(grantOf(rows));
  if (on.has('net.host.private') && !on.has('net.host')) return 'Reaching the local network needs reaching websites from each person’s computer too.';
  return null;
}

/** What an app is never given, whatever it asks: none of these is a capability. */
export function canNever(rows: readonly ConsentRow[]): string[] {
  const never: string[] = [
    'Change roles or who may do what',
    'Change who can see a page',
    'Read other workspaces',
    'See your password, keys or sign-in',
    'Read or change secure links',
  ];
  if (!rows.some((r: ConsentRow) => r.on && NETWORK_CAPABILITIES.has(r.cap))) never.push('Reach the internet or your network');
  return never;
}

export type KeyTrust = { kind: 'first-time' } | { kind: 'known'; apps: number };

/** Whether this person already trusts the publisher key: the apps they use pinned under it. */
export function keyTrust(publicKey: string, installs: readonly AppInstall[], appId: string): KeyTrust {
  const apps: Set<string> = new Set(installs.filter((i: AppInstall) => i.pinned_publisher_key === publicKey && i.app_id !== appId).map((i: AppInstall) => i.app_id));
  return apps.size === 0 ? { kind: 'first-time' } : { kind: 'known', apps: apps.size };
}

export function keyTrustCopy(trust: KeyTrust): string {
  if (trust.kind === 'first-time') return 'This is the first time you trust this publisher key.';
  return `Same key as ${trust.apps} ${trust.apps === 1 ? 'app' : 'apps'} you already use.`;
}
