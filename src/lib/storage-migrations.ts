/**
 * IndexedDB schema versioning.
 *
 * The app persists sessions, conversations, peer registrations and instance
 * state locally, and ships as an installable PWA — so a returning user always
 * arrives with a database created by whatever version they last ran. Changing
 * the schema is therefore not a code change, it is a data migration against
 * users we cannot coordinate with.
 *
 * The previous `upgrade(db)` handler took no version arguments and only ever
 * created missing stores. That is correct exactly once, at version 1. Bumping
 * the version would have run it again, found every store present, done nothing,
 * and left the new code reading old-shaped data — a silent corruption rather
 * than a failure.
 *
 * Migrations here are:
 *   - **Sequential.** Every step from the user's version to the current one runs
 *     in order, so a user returning from v1 to v4 is not a special case.
 *   - **Transactional.** They run inside IndexedDB's own upgrade transaction; if
 *     any step throws, the whole upgrade is rolled back and the old database
 *     survives intact.
 *   - **Forward-only.** There is no downgrade path. A browser will refuse to open
 *     a database whose on-disk version is newer than requested, which is handled
 *     explicitly in getDB rather than left to surface as an opaque failure.
 */

import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import { debugLog, errorLog } from './debug-config';

/**
 * Current schema version. Bump this and add a matching entry to MIGRATIONS in
 * the same commit — the test in storage-migrations.test.ts fails if they drift.
 */
export const DB_VERSION = 1;

export const DB_NAME = 'citadel-workspace';

/** Every object store the current schema expects to exist. */
export const STORE_NAMES = [
  'keyValue',
  'sessions',
  'messages',
  'peers',
  'tabContext',
  'instances',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

/**
 * A single forward step. `version` is the version this migration produces, so
 * the step numbered N runs when upgrading a database at version N-1.
 *
 * `tx` is the upgrade transaction. Use it for any data rewriting — opening a
 * separate transaction inside an upgrade deadlocks.
 */
export interface Migration<DBTypes = unknown> {
  version: number;
  description: string;
  run: (
    db: IDBPDatabase<DBTypes>,
    tx: IDBPTransaction<DBTypes, StoreNames<DBTypes>[], 'versionchange'>
  ) => void;
}

/**
 * Ordered migration steps.
 *
 * Adding one:
 *   1. Append a step whose `version` is the new DB_VERSION.
 *   2. Bump DB_VERSION above.
 *   3. Never edit or renumber a released step — users have already run it, and
 *      changing it means their database and a fresh one disagree.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Create the initial key-value, session, message, peer, tab and instance stores',
    run: (db, _tx) => {
      for (const name of STORE_NAMES) {
        // Guarded because a database may exist from before migrations were
        // tracked, with some or all stores already present.
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name as never);
        }
      }
    },
  },
];

/**
 * Run every migration needed to get from `oldVersion` to `newVersion`.
 *
 * Called from within `openDB`'s upgrade callback, so it is already inside the
 * version-change transaction.
 */
export function runMigrations<DBTypes>(
  db: IDBPDatabase<DBTypes>,
  oldVersion: number,
  newVersion: number | null,
  tx: IDBPTransaction<DBTypes, StoreNames<DBTypes>[], 'versionchange'>
): void {
  const target = newVersion ?? DB_VERSION;
  const pending = MIGRATIONS.filter(m => m.version > oldVersion && m.version <= target).sort(
    (a, b) => a.version - b.version
  );

  if (pending.length === 0) {
    debugLog('Storage', `No migrations needed (v${oldVersion} -> v${target})`);
    return;
  }

  debugLog('Storage', `Migrating database v${oldVersion} -> v${target}`, {
    steps: pending.map(m => m.version),
  });

  for (const migration of pending) {
    try {
      migration.run(db as IDBPDatabase<unknown>, tx as never);
      debugLog('Storage', `Applied migration v${migration.version}: ${migration.description}`);
    } catch (error) {
      // Rethrowing aborts the version-change transaction, so IndexedDB rolls the
      // database back to `oldVersion` and the user keeps working on the old
      // schema instead of running new code against half-migrated data.
      errorLog('Storage', `Migration v${migration.version} failed, rolling back upgrade`, error);
      throw error;
    }
  }
}

/**
 * Every store the current schema needs, but which the database does not have.
 *
 * A non-empty result after an upgrade means the migration list is out of step
 * with the schema — worth failing loudly on rather than discovering later as a
 * `NotFoundError` from an unrelated read.
 */
export function missingStores(existing: DOMStringList | string[]): StoreName[] {
  const have = new Set(Array.from(existing as Iterable<string>));
  return STORE_NAMES.filter(name => !have.has(name));
}
