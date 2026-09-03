/**
 * Which message actions a group can actually perform.
 *
 * The peer wire has `GroupMessage` and nothing else — no GroupEdit, no
 * GroupDelete. `useGroupChat` routed edit and delete to
 * `WorkspaceService.editGroupMessage` / `deleteGroupMessage`, which the
 * workspace server refuses for a group it does not own, so both menu items were
 * controls that could only produce a permission error.
 *
 * Reply is different and was worth keeping: the envelope is ours, so `reply_to`
 * now travels with the message rather than being silently dropped, which is
 * what pressing Reply used to do in a peer group.
 */
import { describe, it, expect } from 'vitest';
import { groupMessageActions } from '../group-message-actions';

describe('what a group can do to a message', () => {
  it('lets a peer group reply, and not revise', () => {
    // No GroupEdit or GroupDelete exists on the peer wire. Offering them shows
    // a control whose only outcome is "Permission denied".
    expect(groupMessageActions('7:42')).toEqual({ canReply: true, canRevise: false });
  });

  it('lets a node-backed channel do both', () => {
    expect(groupMessageActions('9f3c1e2a-0000-4000-8000-000000000001')).toEqual({
      canReply: true, canRevise: true,
    });
  });
});
