/**
 * The chat-document migration with its real I/O: the agent's LocalDB through the websocket
 * service, the signed-in account this tab acts as, and cdoc-wasm's StarterKit importer.
 *
 * Loaded only by dynamic import (check-bundle-budget's DEFERRED_MODULES): the sweep from the
 * signed-in layout (hooks/use-live-doc-migration-sweep.ts), and `chatDocumentMigration` from the
 * chat's document tab when it opens one.
 */
import { websocketService } from '@/lib/websocket-service';
import { getCurrentCid } from '@/lib/p2p/current-cid';
import { debugLog, warnLog } from '@/lib/debug-config';
import { MigrationRunner, type MigrationOutcome } from './runner';
import { sweepLiveDocuments, type SweepResult } from './sweep';
import { applyPeerMigration, type PeerMigration, type PeerMigrationOutcome } from './peer-migration';
import { loadCdocMigrationMapper } from './cdoc-mapper';
import type { CreatorSide } from './conflict-rule';
import type { MigrationMarker } from './marker';
import type { MigrationLocalDb } from './account-store';
import type { ConversionReport } from '@/lib/cdoc/editor/file-formats';
import type { ConflictRecord } from './conflict-record';
import type { WalkedDocument } from './yjs-walker';
import { migrationReport, originalDocument, type OriginalDocument } from './migration-report';

/** One document per tick: each may load the engine and convert a whole document. */
const SWEEP_DOCS_PER_TICK: number = 1;
/** How long the sweep waits for an idle moment before taking its turn anyway, in ms. */
const SWEEP_IDLE_TIMEOUT_MS: number = 2_000;

const db: MigrationLocalDb = websocketService;
const runners: Map<bigint, MigrationRunner> = new Map();

async function runnerForThisTab(): Promise<MigrationRunner> {
  const cid: bigint | null = await getCurrentCid();
  if (cid === null) throw new Error('no account is signed in on this tab, so there is no account to migrate documents for');
  let runner: MigrationRunner | undefined = runners.get(cid);
  if (runner === undefined) {
    runner = new MigrationRunner({ db, accountCid: cid, loadMapper: loadCdocMigrationMapper });
    runners.set(cid, runner);
  }
  return runner;
}

/** Migrates the chat document `docId` for this tab's account, once; the chat tab calls it on open. */
async function migrateIfNeeded(docId: string): Promise<MigrationOutcome> {
  return (await runnerForThisTab()).migrateIfNeeded(docId);
}

/** The migrated snapshot to open, checked against its marker; null when not migrated for this account. */
async function readMigratedDocument(docId: string): Promise<{ readonly marker: MigrationMarker; readonly snapshot: Uint8Array } | null> {
  return (await runnerForThisTab()).readMigrated(docId);
}

/** Acts on the peer's migration of `docId` (conflict-rule.ts); `creator` says which side made the chat document. */
async function applyPeerMigrationOf(docId: string, peer: PeerMigration, creator: CreatorSide): Promise<PeerMigrationOutcome> {
  return applyPeerMigration(await runnerForThisTab(), db, docId, peer, creator);
}

/** What the loss banner shows for `docId`; null when it is not migrated for this account. */
async function loadMigrationBanner(docId: string): Promise<{ readonly report: ConversionReport; readonly conflict: ConflictRecord | null } | null> {
  const runner: MigrationRunner = await runnerForThisTab();
  const [marker, conflict]: [MigrationMarker | null, ConflictRecord | null] = await Promise.all([runner.readMarker(docId), runner.readConflict(docId)]);
  return marker === null ? null : { report: migrationReport(marker, conflict), conflict };
}

/** The original for "Show original" (read only, never written); null when this device holds none. */
async function loadOriginalDocument(docId: string): Promise<OriginalDocument | null> {
  const original: { readonly walked: WalkedDocument; readonly title: string } | null = await (await runnerForThisTab()).readOriginal(docId);
  if (original === null) return null;
  return originalDocument(original.walked, original.title, await loadCdocMigrationMapper());
}

function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    // WebKit has no requestIdleCallback; a timeout still lets the UI take its turn.
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback((): void => resolve(), { timeout: SWEEP_IDLE_TIMEOUT_MS });
    else window.setTimeout(resolve, 0);
  });
}

function reportSweep(result: SweepResult): void {
  if (result.kind === 'index-unreadable') {
    warnLog('LiveDocMigration', 'The document index could not be read; nothing was migrated.', result.message);
    return;
  }
  for (const [docId, outcome] of result.outcomes) {
    if (outcome.kind === 'failed') warnLog('LiveDocMigration', `Document ${docId} was not migrated (${outcome.stage}).`, outcome.message);
  }
  debugLog('LiveDocMigration', 'Sweep', result.stopped, result.outcomes.size);
}

/** Starts the background sweep for this tab's account after sign-in; the returned function stops it. */
function startMigrationSweep(): () => void {
  const controller: AbortController = new AbortController();
  runnerForThisTab()
    .then(async (runner: MigrationRunner): Promise<void> => {
      await yieldToUi();
      if (controller.signal.aborted) return;
      reportSweep(await sweepLiveDocuments(db, runner, { perTick: SWEEP_DOCS_PER_TICK, yieldToUi, signal: controller.signal }));
    })
    .catch((error: unknown): void => warnLog('LiveDocMigration', 'The migration sweep stopped.', error));
  return (): void => controller.abort();
}

/** What the chat's document tab and the signed-in layout use; every call acts for this tab's account. */
export interface ChatDocumentMigration {
  /** Migrates `docId` once (single-flight with the sweep); call it when the chat opens a document. */
  readonly migrateIfNeeded: (docId: string) => Promise<MigrationOutcome>;
  /** The migrated snapshot to open, checked against its marker; null when not migrated. */
  readonly readMigrated: (docId: string) => Promise<{ readonly marker: MigrationMarker; readonly snapshot: Uint8Array } | null>;
  /** The loss banner's report and conflict; null when not migrated. */
  readonly loadBanner: (docId: string) => Promise<{ readonly report: ConversionReport; readonly conflict: ConflictRecord | null } | null>;
  /** The original for "Show original" (LossReportBanner's loadOriginal). */
  readonly loadOriginal: (docId: string) => Promise<OriginalDocument | null>;
  /** Acts on a peer's migration (conflict-rule.ts); `creator` says which side made the chat document. */
  readonly applyPeerMigration: (docId: string, peer: PeerMigration, creator: CreatorSide) => Promise<PeerMigrationOutcome>;
  /** The background sweep; the returned function stops it. */
  readonly startSweep: () => () => void;
}

export const chatDocumentMigration: ChatDocumentMigration = {
  migrateIfNeeded,
  readMigrated: readMigratedDocument,
  loadBanner: loadMigrationBanner,
  loadOriginal: loadOriginalDocument,
  applyPeerMigration: applyPeerMigrationOf,
  startSweep: startMigrationSweep,
};
