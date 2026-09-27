/**
 * The events the peer-group wire becomes (group-events.ts builds them; group-store binds them).
 * Split from group-events so the list of what can arrive reads on its own.
 */
export interface GroupEvent {
  name:
    | 'group:created'
    | 'group:invite-received'
    | 'group:member-joined'
    | 'group:member-left'
    | 'group:deleted'
    /**
     * A PEER-group message. The workspace protocol's group chat reaches the
     * store through workspace-response-handler; a peer group has no node
     * behind it and arrives here instead. Same event either way, so the
     * sidebar's badge, preview and recency sort work for both.
     */
    | 'group:message-received'
    /** A rename or role change from a member; never a chat bubble. See apply-group-control. */
    | 'group:control-received'
    /** A member's reaction on a message; never a chat bubble. See peer-group-reaction-inbound. */
    | 'group:reaction-received'
    /** A member's live-document update or sync request; never a chat bubble. See group-doc-keeper. */
    | 'group:live-doc-received'
    /**
     * The server's answer to `GroupListGroupsFor` — the only message that can
     * establish a group is GONE. Every other event is additive or arrives only
     * while you are online to see it, so without this a group deleted while
     * offline is in the sidebar forever. See reconcile-groups.ts.
     */
    | 'group:list-received'
    /** The groups this session is in, from the agent; see learn-joined-groups.ts. */
    | 'group:joined-list-received'
    /** The server removed the member a `GroupKick` named; see await-group-kicked.ts. */
    | 'group:kick-succeeded'
    /**
     * The server refused a group operation.
     *
     * `GroupCreateFailure` and its siblings carry a message and a request_id
     * and were mapped by nothing — no failure variant of any group operation
     * had a handler. The dialog resolves on DISPATCH and closes, so a refused
     * create looked exactly like a successful one that had not arrived yet:
     * the form cleared, the dialog shut, and the sidebar never gained the
     * group. Nothing was ever said.
     */
    | 'group:failed';
  payload: Record<string, unknown>;
}
