import { describe, it, expect, vi } from 'vitest';
import {
  DB_VERSION,
  MIGRATIONS,
  STORE_NAMES,
  runMigrations,
  missingStores,
} from '../storage-migrations';

/**
 * A returning user always arrives with a database created by whatever version of
 * the app they last ran, and we cannot coordinate with them. These pin the rules
 * that make that safe.
 */

function fakeDb(existingStores: string[] = []) {
  const stores = new Set(existingStores);
  return {
    objectStoreNames: {
      contains: (n: string) => stores.has(n),
      [Symbol.iterator]: () => stores[Symbol.iterator](),
    },
    createObjectStore: vi.fn((n: string) => stores.add(n)),
    _stores: stores,
  };
}

describe('migration list integrity', () => {
  it('has a migration for every version up to DB_VERSION', () => {
    // The failure this catches: bumping DB_VERSION without adding a step, which
    // opens the database at a new version, runs nothing, and leaves new code
    // reading old-shaped data.
    const versions = MIGRATIONS.map(m => m.version);
    expect(Math.max(...versions)).toBe(DB_VERSION);
    for (let v = 1; v <= DB_VERSION; v++) {
      expect(versions).toContain(v);
    }
  });

  it('numbers migrations uniquely and consecutively from 1', () => {
    const versions = MIGRATIONS.map(m => m.version).sort((a, b) => a - b);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });

  it('describes every migration, so an upgrade log is readable', () => {
    for (const m of MIGRATIONS) expect(m.description.trim().length).toBeGreaterThan(0);
  });
});

describe('runMigrations', () => {
  it('creates every store on a fresh database', () => {
    const db = fakeDb();
    runMigrations(db as never, 0, DB_VERSION, {} as never);
    expect([...db._stores].sort()).toEqual([...STORE_NAMES].sort());
  });

  it('does nothing when the database is already current', () => {
    const db = fakeDb([...STORE_NAMES]);
    runMigrations(db as never, DB_VERSION, DB_VERSION, {} as never);
    expect(db.createObjectStore).not.toHaveBeenCalled();
  });

  it('runs every intervening step, so an old install is not a special case', () => {
    // A user returning from v1 to v4 must get steps 2, 3 and 4 — not just 4.
    const ran: number[] = [];
    const steps = [2, 3, 4].map(version => ({
      version,
      description: `step ${version}`,
      run: () => { ran.push(version); },
    }));
    const original = MIGRATIONS.slice();
    MIGRATIONS.push(...steps);
    try {
      runMigrations(fakeDb([...STORE_NAMES]) as never, 1, 4, {} as never);
      expect(ran).toEqual([2, 3, 4]);
    } finally {
      MIGRATIONS.length = 0;
      MIGRATIONS.push(...original);
    }
  });

  it('applies steps in order even if declared out of order', () => {
    const ran: number[] = [];
    const original = MIGRATIONS.slice();
    MIGRATIONS.push(
      { version: 3, description: 'c', run: () => { ran.push(3); } },
      { version: 2, description: 'b', run: () => { ran.push(2); } },
    );
    try {
      runMigrations(fakeDb([...STORE_NAMES]) as never, 1, 3, {} as never);
      expect(ran).toEqual([2, 3]);
    } finally {
      MIGRATIONS.length = 0;
      MIGRATIONS.push(...original);
    }
  });

  it('rethrows a failing step so IndexedDB rolls the whole upgrade back', () => {
    // The alternative — swallowing it — leaves new code running against a
    // half-migrated database, which is worse than not upgrading at all.
    const original = MIGRATIONS.slice();
    MIGRATIONS.push({
      version: 2,
      description: 'explodes',
      run: () => { throw new Error('disk full'); },
    });
    try {
      expect(() => runMigrations(fakeDb([...STORE_NAMES]) as never, 1, 2, {} as never))
        .toThrow('disk full');
    } finally {
      MIGRATIONS.length = 0;
      MIGRATIONS.push(...original);
    }
  });

  it('does not run steps beyond the requested target version', () => {
    const ran: number[] = [];
    const original = MIGRATIONS.slice();
    MIGRATIONS.push(
      { version: 2, description: 'b', run: () => { ran.push(2); } },
      { version: 3, description: 'c', run: () => { ran.push(3); } },
    );
    try {
      runMigrations(fakeDb([...STORE_NAMES]) as never, 1, 2, {} as never);
      expect(ran).toEqual([2]);
    } finally {
      MIGRATIONS.length = 0;
      MIGRATIONS.push(...original);
    }
  });
});

describe('missingStores', () => {
  it('reports nothing when the schema is satisfied', () => {
    expect(missingStores([...STORE_NAMES])).toEqual([]);
  });

  it('names the stores a migration forgot to create', () => {
    expect(missingStores(['keyValue', 'sessions'])).toContain('messages');
    expect(missingStores(['keyValue', 'sessions'])).toContain('peers');
  });
});
