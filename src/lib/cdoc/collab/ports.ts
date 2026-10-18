/**
 * The I/O a DocumentSession does, each behind a port, so the session itself is pure ordering
 * logic: the kernel link, time, the local cache and the editor are all handed in.
 */
import type { DocumentsRequest, DocumentsResponse } from 'citadel-workspace-client-ts';
import type { EditorOpener } from '../editor/controller';
import type { HexColor } from '../editor/model-values';
import type { DocumentsRelayLimits } from './relay-limits';

export type LinkState = 'up' | 'down';

/** This tab's session's Documents traffic with the workspace server. */
export interface DocumentsTransport {
  /** The session the requests are sent as (the kernel's `author_cid` / `from_cid` for ours). */
  readonly selfCid: bigint;
  /** Resolves once the request has left; the answer arrives through `onResponse`. */
  send(request: DocumentsRequest): Promise<void>;
  /** Every Documents answer and push this tab's session receives, for any node. */
  onResponse(listener: (response: DocumentsResponse) => void): () => void;
  /**
   * The protocol's plain `Error` answers. A missing permission is one of these
   * ("Permission denied: EditMdx required"); it names no node and no request.
   */
  onError(listener: (message: string) => void): () => void;
  /** The session's link to the server dropping and coming back. */
  onLink(listener: (state: LinkState) => void): () => void;
}

export interface Clock {
  now(): number;
  /** Runs `fn` once after `ms`; the returned function cancels it. */
  after(ms: number, fn: () => void): () => void;
}

/** A replica's state as last saved locally: a snapshot and the last log seq it holds. */
export interface CachedDocument {
  readonly docVersion: number;
  readonly snapshot: Uint8Array;
  readonly seq: bigint;
}

export interface DocumentCache {
  load(nodeId: string): Promise<CachedDocument | null>;
  save(nodeId: string, document: CachedDocument): Promise<void>;
  /** Removes the node's copy: the node is gone, or this account may no longer read it. */
  forget(nodeId: string): Promise<void>;
}

/** Who a session is, for drawing their caret: the member list's name and a colour. */
export type PeerIdentity = (cid: bigint) => { readonly name: string; readonly color: HexColor };

/** Every setting is required: nothing here has a default (PCND). */
export interface DocumentSessionConfig {
  readonly nodeId: string;
  /** What this client writes and accepts as `doc_version` (relay-limits' CDOC_CRDT_DOC_VERSION). */
  readonly docVersion: number;
  readonly limits: DocumentsRelayLimits;
  /**
   * Store a snapshot after this many local updates, or `null` to store one only when the
   * server's `Appended.compaction` asks. Never on a timer.
   */
  readonly snapshotAfterLocalUpdates: number | null;
  /**
   * Whether the replica collects its tombstones just before storing a snapshot: 'whenAlone'
   * only when no other peer is present (snapshot-policy.ts says why), 'never' to store every
   * snapshot uncollected.
   */
  readonly gcBeforeSnapshot: 'never' | 'whenAlone';
  /** A Pull unanswered for this long is sent again. */
  readonly pullTimeoutMs: number;
  /** Our awareness is re-sent this often while nothing moves, so peers do not expire us. */
  readonly awarenessHeartbeatMs: number;
  /** A peer not heard from for this long is no longer drawn. */
  readonly peerExpiryMs: number;
  /** The most carets one session's records may place (one per tab of that account). */
  readonly maxCaretsPerSession: number;
  /**
   * The first `client_seq`; each Append takes the next. Unique per session instance (two tabs
   * of one account both see every `Appended`), e.g. a random 32-bit prefix shifted left 32.
   */
  readonly clientSeqBase: bigint;
}

export interface DocumentSessionPorts {
  readonly transport: DocumentsTransport;
  readonly clock: Clock;
  /** `null`: no local cache, every open pulls the whole document. */
  readonly cache: DocumentCache | null;
  readonly openEditor: EditorOpener;
  readonly identify: PeerIdentity;
}
