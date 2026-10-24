/**
 * A first-party app on the glue ABI (`wasm-bindgen-glue-firstparty`, design 3.2) runs in the page
 * rather than in a worker, but it is still an install: every port call it makes goes through the
 * same op table, the same argument check and the same `admits()` gate a worker's call is re-checked
 * against on the main thread (invoker.ts `regrantedCall`), against the grant its install holds for
 * this member, and the kernel re-checks it again. Nothing reaches a port the grant does not cover.
 */
import type { AbiGroup } from './abi';
import type { CborMap } from './cbor';
import type { Capability } from './capabilities';
import { regrantedCall } from './invoker';
import type { HostPorts, PortReply } from './ports';

export interface GlueInstance {
  /** What the install holds for this member: its grant less what they did not consent to. */
  readonly held: ReadonlySet<Capability>;
  /** One port call by (group, op), as a worker would make it. */
  readonly call: (group: AbiGroup, op: number, args: CborMap) => PortReply;
}

export function glueInstance(ports: HostPorts, held: ReadonlySet<Capability>): GlueInstance {
  return { held, call: (group: AbiGroup, op: number, args: CborMap): PortReply => regrantedCall(ports, held, group, op, args) };
}
