/**
 * Identifiers the workspace protocol treats as fixed.
 */

/**
 * The sentinel id of the workspace root domain.
 *
 * Mirrors `crate::WORKSPACE_ROOT_ID` in citadel-workspace-server-kernel. It was
 * written as a bare 'workspace-root' literal in several components, which is
 * exactly the kind of duplication that survives a rename on the Rust side
 * without anything failing to compile.
 */
export const WORKSPACE_ROOT_ID = 'workspace-root';
