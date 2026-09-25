/**
 * The sender's bubble reports each member's delivery from the transfer
 * service's own record, so an accept or decline learnt after the share still
 * shows, and the summary adds up to the members it was sent to.
 */
import { describe, it, expect } from 'vitest';
import type { FileTransfer } from '@/lib/file-transfer/types';
import type { FileTransferState } from '@/types/messaging-layer';
import type { MemberDelivery } from '@/types/group-file-share';
import { summariseDeliveries, MISSING_RECORD_REASON, type DeliverySummary } from '../group-file-delivery-state';

function record(id: string, state: FileTransferState, errorMessage?: string): FileTransfer {
  return {
    id, fileName: 'a.txt', fileSize: 1, fileType: 'text/plain', mode: 'p2p', state, progress: 0,
    senderCid: '1', recipientCid: '2', createdAt: 0, updatedAt: 0, isIncoming: false, errorMessage,
  };
}

const offered = (cid: bigint, username: string, transferId: string): MemberDelivery => ({ kind: 'offered', cid, username, transferId });

describe('a shared file\'s delivery state', () => {
  const records: Map<string, FileTransfer> = new Map<string, FileTransfer>([
    ['t-pending', record('t-pending', 'pending')],
    ['t-accepted', record('t-accepted', 'transferring')],
    ['t-done', record('t-done', 'complete')],
    ['t-declined', record('t-declined', 'declined', 'busy right now')],
    ['t-error', record('t-error', 'error', 'peer disconnected')],
    ['t-expired', record('t-expired', 'expired')],
  ]);
  const deliveries: MemberDelivery[] = [
    offered(2n, 'ada', 't-pending'),
    offered(3n, 'bob', 't-accepted'),
    offered(4n, 'cy', 't-done'),
    offered(5n, 'dee', 't-declined'),
    offered(6n, 'eve', 't-error'),
    offered(7n, 'fay', 't-expired'),
    offered(8n, 'gus', 't-gone'),
    { kind: 'skipped', cid: 9n, username: 'hal', reason: 'offline' },
    { kind: 'failed', cid: 10n, username: 'ivy', reason: 'agent refused the send' },
  ];
  const summary: DeliverySummary = summariseDeliveries(deliveries, (id: string): FileTransfer | undefined => records.get(id));

  it('reads each offered member from the record, with the reason', () => {
    expect(summary.rows.map((r): string => `${r.username}:${r.status}:${r.reason ?? ''}`)).toEqual([
      'ada:sent:', 'bob:accepted:', 'cy:received:', 'dee:declined:busy right now', 'eve:failed:peer disconnected',
      'fay:failed:the offer expired unanswered', `gus:failed:${MISSING_RECORD_REASON}`,
      'hal:not-delivered:offline', 'ivy:failed:agent refused the send',
    ]);
  });

  it('counts every member exactly once and says so', () => {
    expect(summary.total).toBe(9);
    expect(Object.values(summary.counts).reduce((a: number, b: number): number => a + b, 0)).toBe(9);
    expect(summary.text).toBe(
      'Sent to 9 members: 1 received, 1 accepted, 1 awaiting an answer, 1 declined, 4 failed, 1 not delivered',
    );
  });

  it('follows the record when it changes', () => {
    records.set('t-pending', record('t-pending', 'declined'));
    const after: DeliverySummary = summariseDeliveries(deliveries.slice(0, 1), (id: string): FileTransfer | undefined => records.get(id));
    expect(after.rows[0].status).toBe('declined');
    expect(after.text).toBe('Sent to 1 member: 1 declined');
  });

  it('says so when there was nobody else to send to', () => {
    expect(summariseDeliveries([], (): undefined => undefined).text).toBe('No other members to send to');
  });
});
