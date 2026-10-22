/**
 * The mapper port over cdoc-wasm's editor artefact (the product's only implementation).
 *
 * The StarterKit importer is cdoc-wasm's `tiptap_to_crdt_snapshot(pm_json, client) ->
 * Migrated` and `tiptap_to_pm(pm_json) -> string`, which the engine stream is adding. Until a
 * glue that exports them is vendored, the loader answers null: it looks at the glue's exports
 * (a small script) before fetching the binary, so a build without the importer costs no
 * download and migrates nothing.
 */
import type { MappedSnapshot, MapperLoader, MigrationMapper } from './mapper-port';

type Glue = typeof import('../../../vendor/cdoc/cdoc_wasm_editor.js');

/** cdoc-wasm's `Migrated`, as `pm_to_crdt_snapshot` already returns it. */
interface MigratedHandle {
  snapshot(): Uint8Array;
  reportJson(): string;
  free(): void;
}

type ToSnapshot = (pmJson: string, client: bigint) => MigratedHandle;
type ToPm = (pmJson: string) => string;

const SNAPSHOT_EXPORT: 'tiptap_to_crdt_snapshot' = 'tiptap_to_crdt_snapshot';
const PM_EXPORT: 'tiptap_to_pm' = 'tiptap_to_pm';

/**
 * The importer's two exports, or null when this glue predates them. Read by name because the
 * vendored declarations do not list them yet; the shapes are the port's contract.
 */
function importerOf(glue: Glue): { readonly toSnapshot: ToSnapshot; readonly toPm: ToPm } | null {
  const exports: Readonly<Record<string, unknown>> = glue;
  const toSnapshot: unknown = exports[SNAPSHOT_EXPORT];
  const toPm: unknown = exports[PM_EXPORT];
  if (typeof toSnapshot !== 'function' || typeof toPm !== 'function') return null;
  return { toSnapshot: toSnapshot as ToSnapshot, toPm: toPm as ToPm };
}

export function mapperOver(importer: { readonly toSnapshot: ToSnapshot; readonly toPm: ToPm }): MigrationMapper {
  return {
    toSnapshot(starterKitJson: string, client: bigint): MappedSnapshot {
      const migrated: MigratedHandle = importer.toSnapshot(starterKitJson, client);
      try {
        return { snapshot: migrated.snapshot(), reportJson: migrated.reportJson() };
      } finally {
        migrated.free();
      }
    },
    toDocsPm: (starterKitJson: string): string => importer.toPm(starterKitJson),
  };
}

let loaded: Promise<MigrationMapper | null> | null = null;

/** One engine for every migration on this page; a failed load is retried on the next call. */
export const loadCdocMigrationMapper: MapperLoader = (): Promise<MigrationMapper | null> => {
  loaded ??= (async (): Promise<MigrationMapper | null> => {
    const glue: Glue = await import('../../../vendor/cdoc/cdoc_wasm_editor.js');
    const importer: { readonly toSnapshot: ToSnapshot; readonly toPm: ToPm } | null = importerOf(glue);
    if (importer === null) return null;
    const { loadCdocEditorWasm } = await import('@/lib/cdoc/engine/load-wasm');
    await loadCdocEditorWasm((): void => undefined);
    return mapperOver(importer);
  })().catch((error: unknown): never => {
    loaded = null;
    throw error;
  });
  return loaded;
};
