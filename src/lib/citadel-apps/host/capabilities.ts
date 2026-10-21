/**
 * The capabilities a manifest can declare and an install can grant, and which ABI group each one
 * opens. Design Part 2.2 (capability table) with R4.1 (network) and R4.5 (storage backends).
 *
 * LOCAL SHAPE: `Capability` is replaced by the ts-rs export of `citadel-app-sdk-types::Capability`
 * when that crate lands; this list must then equal it (the parity test will say so).
 */
import type { AbiGroup } from './abi';

export const CAPABILITIES = [
  'canvas', 'ui', 'events', 'navigate', 'log',
  'nodes.read', 'nodes.write',
  'md.edit',
  'files.read', 'files.write',
  'chat.read', 'chat.send',
  'members.list', 'presence',
  'storage.user', 'storage.scope', 'storage.node', 'storage.blob', 'storage.local',
  'net.host', 'net.host.private', 'net.server',
  'ihttp.serve', 'ihttp.call',
  'clipboard.read', 'clipboard.write',
  'notifications',
  'documents',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(CAPABILITIES);

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && CAPABILITY_SET.has(value);
}

/** Every app holds these: they reach nothing outside its own surface. */
export const INTRINSIC_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['canvas', 'ui', 'events', 'navigate', 'log']);

/** Which group each capability's calls arrive through. */
export const CAPABILITY_GROUP: Readonly<Record<Capability, AbiGroup>> = {
  canvas: 'canvas', ui: 'ui', events: 'events', navigate: 'navigate', log: 'log',
  'nodes.read': 'nodes', 'nodes.write': 'nodes',
  'md.edit': 'md',
  'files.read': 'files', 'files.write': 'files',
  'chat.read': 'chat', 'chat.send': 'chat',
  'members.list': 'members', presence: 'members',
  'storage.user': 'storage', 'storage.scope': 'storage', 'storage.node': 'storage', 'storage.blob': 'storage', 'storage.local': 'storage',
  'net.host': 'net', 'net.host.private': 'net', 'net.server': 'net',
  'ihttp.serve': 'ihttp', 'ihttp.call': 'ihttp',
  'clipboard.read': 'clipboard', 'clipboard.write': 'clipboard',
  notifications: 'notify',
  documents: 'documents',
};

/** The groups a manifest's declared capabilities (plus the intrinsic ones) may import. */
export function declaredGroups(declared: ReadonlySet<Capability>): ReadonlySet<AbiGroup> {
  const groups: Set<AbiGroup> = new Set<AbiGroup>();
  for (const cap of INTRINSIC_CAPABILITIES) groups.add(CAPABILITY_GROUP[cap]);
  for (const cap of declared) groups.add(CAPABILITY_GROUP[cap]);
  return groups;
}

/** The capabilities in force: what the install granted plus the intrinsic ones. */
export function effectiveGrant(granted: ReadonlySet<Capability>): ReadonlySet<Capability> {
  return new Set<Capability>([...INTRINSIC_CAPABILITIES, ...granted]);
}
