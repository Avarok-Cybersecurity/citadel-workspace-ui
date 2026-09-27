/**
 * The real storage and sending for this session's group-document keeper (group-doc-keeper).
 *
 * One keeper per account: two accounts in one browser must not share each other's documents,
 * in memory or on disk, so both are keyed by the session's CID, as group-persistence is. The
 * copy is kept in IndexedDB, whose structured clone stores the bytes as they are.
 */
import { dbGet, dbPut } from '@/lib/storage-utils';
import { eventEmitter } from '@/lib/event-emitter';
import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { groupSendTransport } from '@/lib/group-conversations/group-send-transport';
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import { GroupDocKeeper, type KeeperStorage } from './group-doc-keeper';
import { encodeGroupLiveDoc, type GroupLiveDocBody } from './group-doc-codec';
import type { GroupLiveDocEvent } from './peer-group-live-doc-inbound';

const keepers: Map<bigint, GroupDocKeeper> = new Map();

function storageFor(self: bigint): KeeperStorage {
  const key = (groupId: string, docId: string): string => `group-live-doc:${self.toString()}:${groupId}:${docId}`;
  return {
    load: (groupId: string, docId: string): Promise<Uint8Array | undefined> => dbGet<Uint8Array>('keyValue', key(groupId, docId)),
    save: (groupId: string, docId: string, state: Uint8Array): Promise<void> => dbPut('keyValue', key(groupId, docId), state),
  };
}

async function send(groupId: string, body: GroupLiveDocBody): Promise<void> {
  // Lazily, as group-reactions does: group-requests reaches the socket stack.
  const { sendPeerGroupBody } = await import('@/lib/group-conversations/group-requests');
  await sendPeerGroupBody(groupId, (senderCid: bigint, messageId: string): Uint8Array => encodeGroupLiveDoc({
    group_id: groupId, message_id: messageId, sender_cid: senderCid, timestamp: Date.now(), live_doc: body,
  }));
}

/** This session's keeper; throws before there is a session, which has no documents to keep. */
export function sessionDocKeeper(): GroupDocKeeper {
  const self: bigint | null = instanceManager.cid;
  if (self === null) throw new Error('Not connected: a group document needs a session');
  let keeper: GroupDocKeeper | undefined = keepers.get(self);
  if (!keeper) {
    keeper = new GroupDocKeeper(storageFor(self), send, (_groupId: string, _docId: string, reason: string): void => {
      toast({ title: 'A live document needs attention', description: reason, variant: 'destructive' });
    });
    keepers.set(self, keeper);
  }
  return keeper;
}

/** Hands every member's live-document traffic to this session's keeper. */
export function bindGroupLiveDocs(): () => void {
  const onReceived = (data: GroupLiveDocEvent): void => {
    if (groupSendTransport(data.groupId) !== 'peer') return;
    try {
      sessionDocKeeper().receive(data.groupId, data.body).catch((error: unknown): void => {
        debugLog('GroupLiveDocs', 'Applying a live-document change failed', error);
      });
    } catch (error) {
      debugLog('GroupLiveDocs', 'A live-document change arrived with no session', error);
    }
  };
  eventEmitter.on('group:live-doc-received', onReceived);
  return (): void => { eventEmitter.off('group:live-doc-received', onReceived); };
}
