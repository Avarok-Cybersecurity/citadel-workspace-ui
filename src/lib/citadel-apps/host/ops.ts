/**
 * The op table: for each (group, op number) the capability it needs, whether it reaches the
 * server (and so spends the server bucket too), which clock bounds it, and the port method that
 * carries it out. The one place the dispatcher, the worker's remote invoker and the main thread's
 * re-check all read, so they cannot disagree about what an op is.
 *
 * LOCAL NUMBERING: op numbers are 1-based per group and must equal `citadel-app-sdk-types`'
 * HostCall discriminants when that crate lands (the parity test will read both).
 */
import type { AbiGroup } from './abi';
import type { CborMap } from './cbor';
import type { Capability } from './capabilities';
import type { HostPorts, PortKey, PortReply } from './ports';
import { respondArgs } from './ihttp-codec';
import { classifyDocumentLink, type DocumentLinkTarget } from '@/lib/document-links';

export type OpClock = 'compute' | 'port' | 'host_net' | 'server_net';

export interface OpEntry {
  readonly group: AbiGroup;
  readonly op: number;
  readonly name: string;
  readonly port: PortKey;
  /** The capability this call needs; null when the arguments do not say (refused as bad_arguments). */
  readonly cap: (args: CborMap) => Capability | null;
  readonly server: (args: CborMap) => boolean;
  readonly clock: OpClock;
  /** undefined when the port is not injected. */
  readonly invoke: (ports: HostPorts, args: CborMap) => PortReply | undefined;
}

const fixed = (c: Capability) => (): Capability => c;
const never = (): boolean => false;
const always = (): boolean => true;

function entry<K extends PortKey>(
  group: AbiGroup, op: number, name: string, port: K, cap: (args: CborMap) => Capability | null,
  server: (args: CborMap) => boolean, clock: OpClock,
  call: (p: NonNullable<HostPorts[K]>, args: CborMap) => PortReply,
): OpEntry {
  return {
    group, op, name, port, cap, server, clock,
    invoke: (ports: HostPorts, args: CborMap): PortReply | undefined => {
      const p: HostPorts[K] = ports[port];
      return p === undefined ? undefined : call(p as NonNullable<HostPorts[K]>, args);
    },
  };
}

const STORAGE_BACKENDS: Readonly<Record<string, Capability>> = {
  user: 'storage.user', scope: 'storage.scope', node: 'storage.node', local: 'storage.local',
};
const storageCap = (args: CborMap): Capability | null =>
  typeof args.backend === 'string' && Object.hasOwn(STORAGE_BACKENDS, args.backend) ? STORAGE_BACKENDS[args.backend] : null;
const storageServer = (args: CborMap): boolean => args.backend !== 'local';

/** Internal links only: anything classifyDocumentLink does not call internal is refused here. */
function navigate(p: NonNullable<HostPorts['navigate']>, args: CborMap): PortReply {
  if (typeof args.href !== 'string') return { refused: { policy: 'bad_arguments' } };
  const target: DocumentLinkTarget = classifyDocumentLink(args.href, p.currentUrl());
  if (target.kind !== 'internal') return { refused: { policy: 'not_an_internal_link' } };
  return p.open(target.to);
}

function respond(p: NonNullable<HostPorts['ihttp']>, args: CborMap): PortReply {
  const parsed: ReturnType<typeof respondArgs> = respondArgs(args);
  return parsed === null ? { refused: { policy: 'bad_arguments' } } : p.respond(parsed.peer, parsed.frame);
}

export const OPS: readonly OpEntry[] = [
  entry('canvas', 1, 'draw', 'canvas', fixed('canvas'), never, 'compute', (p, a) => p.draw(a)),
  entry('canvas', 2, 'size', 'canvas', fixed('canvas'), never, 'compute', (p, a) => p.size(a)),
  entry('ui', 1, 'set_toolbar', 'ui', fixed('ui'), never, 'port', (p, a) => p.setToolbar(a)),
  entry('ui', 2, 'open_menu', 'ui', fixed('ui'), never, 'port', (p, a) => p.openMenu(a)),
  entry('ui', 3, 'dialog', 'ui', fixed('ui'), never, 'port', (p, a) => p.dialog(a)),
  entry('ui', 4, 'toast', 'ui', fixed('ui'), never, 'port', (p, a) => p.toast(a)),
  entry('ui', 5, 'request_height', 'ui', fixed('ui'), never, 'port', (p, a) => p.requestHeight(a)),
  entry('events', 1, 'set_interest', 'events', fixed('events'), never, 'port', (p, a) => p.setInterest(a)),
  entry('navigate', 1, 'open', 'navigate', fixed('navigate'), never, 'port', navigate),
  entry('nodes', 1, 'read', 'nodes', fixed('nodes.read'), always, 'port', (p, a) => p.read(a)),
  entry('nodes', 2, 'children', 'nodes', fixed('nodes.read'), always, 'port', (p, a) => p.children(a)),
  entry('nodes', 3, 'create', 'nodes', fixed('nodes.write'), always, 'port', (p, a) => p.create(a)),
  entry('nodes', 4, 'rename', 'nodes', fixed('nodes.write'), always, 'port', (p, a) => p.rename(a)),
  entry('nodes', 5, 'move', 'nodes', fixed('nodes.write'), always, 'port', (p, a) => p.move(a)),
  entry('md', 1, 'replace_region', 'md', fixed('md.edit'), always, 'port', (p, a) => p.replaceRegion(a)),
  entry('md', 2, 'append', 'md', fixed('md.edit'), always, 'port', (p, a) => p.append(a)),
  entry('files', 1, 'read', 'files', fixed('files.read'), always, 'port', (p, a) => p.read(a)),
  entry('files', 2, 'list', 'files', fixed('files.read'), always, 'port', (p, a) => p.list(a)),
  entry('files', 3, 'write', 'files', fixed('files.write'), always, 'port', (p, a) => p.write(a)),
  entry('chat', 1, 'read', 'chat', fixed('chat.read'), always, 'port', (p, a) => p.read(a)),
  entry('chat', 2, 'send', 'chat', fixed('chat.send'), always, 'port', (p, a) => p.send(a)),
  entry('members', 1, 'list', 'members', fixed('members.list'), always, 'port', (p, a) => p.list(a)),
  entry('members', 2, 'presence', 'members', fixed('presence'), always, 'port', (p, a) => p.presence(a)),
  entry('storage', 1, 'get', 'storage', storageCap, storageServer, 'port', (p, a) => p.get(a)),
  entry('storage', 2, 'set', 'storage', storageCap, storageServer, 'port', (p, a) => p.set(a)),
  entry('storage', 3, 'set_many', 'storage', storageCap, storageServer, 'port', (p, a) => p.setMany(a)),
  entry('storage', 4, 'delete', 'storage', storageCap, storageServer, 'port', (p, a) => p.delete(a)),
  entry('storage', 5, 'list', 'storage', storageCap, storageServer, 'port', (p, a) => p.list(a)),
  entry('storage', 6, 'blob_put', 'blob', fixed('storage.blob'), always, 'port', (p, a) => p.put(a)),
  entry('storage', 7, 'blob_get', 'blob', fixed('storage.blob'), always, 'port', (p, a) => p.get(a)),
  entry('storage', 8, 'blob_delete', 'blob', fixed('storage.blob'), always, 'port', (p, a) => p.delete(a)),
  entry('net', 1, 'host_fetch', 'hostNet', fixed('net.host'), never, 'host_net', (p, a) => p.fetch(a)),
  entry('net', 2, 'server_fetch', 'serverNet', fixed('net.server'), always, 'server_net', (p, a) => p.fetch(a)),
  entry('ihttp', 1, 'serve', 'ihttp', fixed('ihttp.serve'), always, 'port', (p, a) => p.advertise(a)),
  entry('ihttp', 2, 'respond', 'ihttp', fixed('ihttp.serve'), never, 'port', respond),
  entry('ihttp', 3, 'call', 'ihttp', fixed('ihttp.call'), always, 'port', (p, a) => p.call(a)),
  entry('clipboard', 1, 'read', 'clipboard', fixed('clipboard.read'), never, 'port', (p, a) => p.read(a)),
  entry('clipboard', 2, 'write', 'clipboard', fixed('clipboard.write'), never, 'port', (p, a) => p.write(a)),
  entry('notify', 1, 'toast', 'notify', fixed('notifications'), never, 'port', (p, a) => p.toast(a)),
  entry('documents', 1, 'relay', 'documents', fixed('documents'), always, 'port', (p, a) => p.relay(a)),
  entry('log', 1, 'write', 'log', fixed('log'), never, 'compute', (p, a) => p.write(a)),
];

const BY_KEY: ReadonlyMap<string, OpEntry> = new Map(OPS.map((e: OpEntry) => [`${e.group}/${e.op}`, e]));

export function findOp(group: AbiGroup, op: number): OpEntry | undefined {
  return BY_KEY.get(`${group}/${op}`);
}
