/**
 * A kernel double and tabs on it, each tab a production DocumentSession over its own replica.
 */
import type { HexColor } from '../../../editor/model-values';
import type { PeerPresence } from '../../../editor/peer-overlay';
import { DocumentSession } from '../../document-session';
import type { EditorOrigin } from '../../../editor/controller';
import type { DocumentSessionConfig, DocumentCache } from '../../ports';
import { CDOC_CRDT_DOC_VERSION, DOCUMENTS_RELAY_LIMITS } from '../../relay-limits';
import type { DocumentSessionError } from '../../session-errors';
import { ManualClock } from './manual-clock';
import { replicaOpener, type ReplicaDouble } from './replica-double';
import { ScriptedKernel, type ScriptedKernelConfig } from './scripted-kernel';

export const NODE: string = 'doc-node-1';
export const ALICE: bigint = 10_000_000_000_000_000_001n;
export const BOB: bigint = 10_000_000_000_000_000_002n;

/** The kernel.toml values (docker/workspace-server/kernel.toml); tests override what they probe. */
export function kernelConfig(overrides: Partial<ScriptedKernelConfig>): ScriptedKernelConfig {
  return {
    maxUpdatesPerPull: 64,
    snapshotMinUpdates: 256n,
    maxUpdateBytes: DOCUMENTS_RELAY_LIMITS.maxUpdateBytes,
    maxSnapshotBytes: DOCUMENTS_RELAY_LIMITS.maxSnapshotBytes,
    maxAwarenessBytes: DOCUMENTS_RELAY_LIMITS.maxAwarenessBytes,
    awarenessPerSecond: DOCUMENTS_RELAY_LIMITS.awarenessPerSecond,
    ...overrides,
  };
}

/**
 * Test values, each chosen so a test can reach it: no snapshot unless the test asks, a pull
 * timeout and heartbeat long enough not to fire unless the clock is moved past them.
 */
export function sessionConfig(clientSeqBase: bigint, overrides: Partial<DocumentSessionConfig>): DocumentSessionConfig {
  return {
    nodeId: NODE,
    docVersion: CDOC_CRDT_DOC_VERSION,
    limits: DOCUMENTS_RELAY_LIMITS,
    snapshotAfterLocalUpdates: null,
    gcBeforeSnapshot: 'never',
    pullTimeoutMs: 5_000,
    awarenessHeartbeatMs: 3_000,
    peerExpiryMs: 10_000,
    clientSeqBase,
    ...overrides,
  };
}

export interface Tab {
  readonly session: DocumentSession;
  readonly replicas: ReplicaDouble[];
  /** What each replica was opened from, in order. */
  readonly sources: EditorOrigin[];
  readonly problems: DocumentSessionError[];
  readonly peers: (readonly PeerPresence[])[];
  /** The replica on screen: the latest one opened. */
  replica(): ReplicaDouble;
}

const COLORS: Record<string, HexColor> = { [ALICE.toString()]: '#4F46E5', [BOB.toString()]: '#10B981' };

let tabs: number = 0;

export function openTab(kernel: ScriptedKernel, clock: ManualClock, cid: bigint, config: Partial<DocumentSessionConfig>, cache: DocumentCache | null = null): Tab {
  tabs += 1;
  const opener: ReturnType<typeof replicaOpener> = replicaOpener(BigInt(tabs) * 1000n);
  const session: DocumentSession = new DocumentSession(sessionConfig(BigInt(tabs) << 32n, config), {
    transport: kernel.connect(cid),
    clock,
    cache,
    openEditor: opener.open,
    identify: (who: bigint): { readonly name: string; readonly color: HexColor } => ({ name: who === ALICE ? 'Alice' : 'Bob', color: COLORS[who.toString()] }),
  });
  const tab: Tab = {
    session,
    replicas: opener.opened,
    sources: opener.sources,
    problems: [],
    peers: [],
    replica: (): ReplicaDouble => {
      const latest: ReplicaDouble | undefined = opener.opened[opener.opened.length - 1];
      if (!latest) throw new Error('no replica opened yet');
      return latest;
    },
  };
  session.on('problem', (problem: DocumentSessionError): void => { tab.problems.push(problem); });
  session.on('peers', (peers: readonly PeerPresence[]): void => { tab.peers.push(peers); });
  return tab;
}

export function newKernel(overrides: Partial<ScriptedKernelConfig>): { readonly kernel: ScriptedKernel; readonly clock: ManualClock } {
  const clock: ManualClock = new ManualClock();
  return { kernel: new ScriptedKernel(NODE, kernelConfig(overrides), clock), clock };
}
