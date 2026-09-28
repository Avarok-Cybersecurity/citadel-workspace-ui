/**
 * Saving the workspace's hierarchy (UpdateTreeSchema).
 *
 * Resolves when the server has accepted it, and rejects with the server's reason: a schema it
 * finds unsound, or one that would strand an existing office or room, names what is wrong. The
 * answer is matched by content. TreeSchema is also what every other admin's save broadcasts and
 * what GetTreeSchema answers, and neither should resolve this save.
 */
import type { TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import type { WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';
import type { ProtocolSender } from './workspace-operations';
import { awaitWriteResponse } from './await-write-response';

/** The levels and rules, which is what a save sets; `max_depth` is derived by the server. */
const shapeOf = (schema: TreeSchema): string => JSON.stringify([schema.rules, schema.entity_type_configs]);

export function schemaSavedAs(sent: TreeSchema): (payload: unknown) => boolean {
  const expected: string = shapeOf(sent);
  return (payload: unknown): boolean =>
    typeof payload === 'object' && payload !== null && shapeOf(payload as TreeSchema) === expected;
}

export async function updateTreeSchema(sender: ProtocolSender, schema: TreeSchema): Promise<void> {
  const requestPart: WorkspaceProtocolRequestTS = { UpdateTreeSchema: { schema } };
  return awaitWriteResponse('UpdateTreeSchema', () => sender.sendProtocolRequest(requestPart), schemaSavedAs(schema));
}
