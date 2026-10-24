/**
 * Whether the reader may send, as the live value a transport holds.
 *
 * A role can change while a conversation is open, and the transport is built once per
 * conversation (rebuilding it would reload the history), so the answer lives in a store the
 * transport reads and this keeps it current.
 */
import { useEffect, useState } from 'react';
import { createValueStore, type ValueStore } from '@/lib/value-store';
import type { GroupRestriction } from '@/components/chat/group-restriction';

export function useLiveGate(context: string, restriction: GroupRestriction): ValueStore<GroupRestriction> {
  const [gate] = useState<ValueStore<GroupRestriction>>((): ValueStore<GroupRestriction> => createValueStore<GroupRestriction>(context, restriction));
  useEffect((): void => gate.set(restriction), [gate, restriction]);
  return gate;
}
