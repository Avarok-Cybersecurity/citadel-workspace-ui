/**
 * The property that matters here is SHARING: one list, visible to every
 * consumer. When each hook instance owned its own copy, the sidebar had the
 * group and the group page did not — opening a group bounced straight back to
 * the workspace with "Group not found". These tests pin the store-level rules
 * that fix carried: events apply exactly once no matter how many consumers
 * called start, creates dedup by id, and updates notify subscribers.
 */
import { describe, it, expect } from 'vitest';
import { eventEmitter } from '@/lib/event-emitter';
import {
  getGroups,
  subscribeToGroups,
  startGroupEventBindings,
} from '../group-store';

// Unique ids per test because the store is module-global by design.
let seq: number = 0;
function freshId(): string {
  seq += 1;
  return `7:${Date.now()}${seq}`;
}

function emitCreated(groupId: string): void {
  eventEmitter.emit('group:created', {
    groupId,
    name: 'test group',
    ownerId: '7',
    ownerUsername: 'alice',
  });
}

describe('group store', () => {
  it('applies a created event once and shares it with every reader', () => {
    startGroupEventBindings();
    const id: string = freshId();
    let notified: number = 0;
    const unsubscribe = subscribeToGroups(() => { notified += 1; });

    emitCreated(id);

    // The same getGroups every consumer uses — no per-instance copy to miss.
    const group = getGroups().find(g => g.id === id);
    expect(group).toBeDefined();
    expect(group?.members.map(m => m.username)).toEqual(['alice']);
    expect(notified).toBeGreaterThan(0);
    unsubscribe();
  });

  it('dedups a repeated create for the same id', () => {
    startGroupEventBindings();
    const id: string = freshId();

    emitCreated(id);
    emitCreated(id);

    expect(getGroups().filter(g => g.id === id)).toHaveLength(1);
  });

  it('binds events exactly once no matter how many consumers start it', () => {
    // Per-instance handlers over a shared list would apply every event N
    // times; the visible symptom is unread counts climbing by the number of
    // mounted components per message.
    startGroupEventBindings();
    startGroupEventBindings();
    const id: string = freshId();
    emitCreated(id);

    eventEmitter.emit('group:message-received', {
      groupId: id,
      senderId: '9',
      content: 'hello',
    });

    expect(getGroups().find(g => g.id === id)?.unreadCount).toBe(1);
  });

  it('adds a joined member once, keyed by cid', () => {
    startGroupEventBindings();
    const id: string = freshId();
    emitCreated(id);

    const joined = { groupId: id, memberCid: '9', memberUsername: 'bob' };
    eventEmitter.emit('group:member-joined', joined);
    eventEmitter.emit('group:member-joined', joined);

    const members = getGroups().find(g => g.id === id)?.members ?? [];
    expect(members.filter(m => m.cid === 9n)).toHaveLength(1);
    expect(members.find(m => m.cid === 9n)?.username).toBe('bob');
  });

  it('removes a member on member-left', () => {
    startGroupEventBindings();
    const id: string = freshId();
    emitCreated(id);
    eventEmitter.emit('group:member-joined', { groupId: id, memberCid: '9', memberUsername: 'bob' });

    eventEmitter.emit('group:member-left', { groupId: id, memberCid: '9' });

    const members = getGroups().find(g => g.id === id)?.members ?? [];
    expect(members.some(m => m.cid === 9n)).toBe(false);
  });
});
