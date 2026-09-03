import type { PermissionsLoad } from './use-loaded-permissions';

/**
 * What the matrix below is actually showing.
 *
 * Said, not implied. A matrix of client-side defaults is visually
 * indistinguishable from a matrix of real permissions, and for a long time it
 * WAS the defaults — the load was fired and its result discarded, so an admin
 * reviewing someone's access was reading constants. The only honest fix is to
 * label the state, and to keep Save disabled until the server has answered.
 */
export function PermissionMatrixNotice({ load }: { load: PermissionsLoad }): JSX.Element | null {
  if (load.status === 'loaded') return null;

  // The union is tested where it is read rather than aliased into a boolean:
  // an alias narrows `load` only for as long as it carries no annotation, and
  // that made a typed `failed` impossible. Reading `load.status` at each site
  // costs nothing and narrows unconditionally.
  const failedClass: string = 'px-3 pb-2 text-sm text-destructive-emphasis sm:px-6';
  const loadingClass: string = 'px-3 pb-2 text-sm text-muted-foreground sm:px-6';

  return (
    <p role="status" className={load.status === 'failed' ? failedClass : loadingClass}>
      {load.status === 'failed'
        ? `${load.reason} The values below are defaults, not this member's permissions.`
        : 'Loading this member’s permissions… the values below are defaults until they arrive.'}
    </p>
  );
}
