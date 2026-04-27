/**
 * WASM → UI Member Mapping
 *
 * SSOT for the WASM→UI member field normalisation. The WASM `User` type
 * from the citadel bindings carries a `name` field; the UI expects
 * `username` + `displayName`. Centralising the mapping here means every
 * downstream consumer can rely on those fields existing without writing
 * its own defensive `as`-cast logic.
 *
 * Lives in its own module so `workspace-handlers.ts` stays under the
 * 250-line CI cap.
 */

/** Shape emitted on `members:loaded` / `member:loaded`. */
export interface MappedMember {
  id?: string;
  username: string;
  displayName: string;
  role?: string;
  [k: string]: unknown;
}

/**
 * Normalise a single raw WASM member record into the fields the UI
 * expects. Invoked from both the `Members` (plural) and `Member`
 * (singular) WorkspaceProtocolResponse handlers.
 */
export function mapWasmMember(raw: Record<string, unknown>): MappedMember {
  const name = typeof raw.name === 'string' ? raw.name : undefined;
  const id = typeof raw.id === 'string' ? raw.id : undefined;
  const username = typeof raw.username === 'string' ? raw.username : undefined;
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : undefined;
  const role = typeof raw.role === 'string' ? raw.role : undefined;

  return {
    ...raw,
    id,
    username: username ?? name ?? id ?? '',
    displayName: displayName ?? name ?? username ?? id ?? '',
    role,
  };
}
