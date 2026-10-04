/**
 * One notification per message.
 *
 * An agent that hosts the account raises its own native notice for a message
 * (kernel/notices). The browser raised an OS notification and a chime for the
 * same message, so a backgrounded window announced everything twice. The agent
 * owns what it hosts; the browser owns the rest.
 *
 * Stand-ins: the agent's capability answer (as a follower asks the leader), the
 * platform's `Notification` constructor, `document.hasFocus`, and the chime --
 * a speaker, which jsdom has none of.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const chimes: { count: number } = vi.hoisted(() => ({ count: 0 }));
vi.mock('../chime', () => ({ playNotificationChime: (): void => { chimes.count += 1; } }));

import { notificationOwner } from '../owner';
import { NotificationType } from '../types';
import { notificationService } from '../service';
import { registerCapabilityRoute, forgetCapabilities } from '@/lib/agent-conversations/capabilities';

const shown: string[] = [];

function agentHosts(agentIlm: boolean): void {
  forgetCapabilities();
  registerCapabilityRoute({ isLeader: () => false, askLeader: async () => ({ agentIlm, supervisesP2p: false }) });
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  shown.length = 0;
  chimes.count = 0;
  vi.stubGlobal('Notification', class { static permission: NotificationPermission = 'granted'; constructor(title: string) { shown.push(title); } });
  Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'serviceWorker'); forgetCapabilities(); });

describe('who owns a notification', () => {
  const p2p: { type: NotificationType; data: Record<string, unknown> } = { type: NotificationType.MESSAGE, data: { peerCid: '9' } };
  it('a hosted conversation\'s message is the agent\'s', () => {
    expect(notificationOwner(p2p, true)).toBe('agent');
  });
  it('without a hosting agent, the browser\'s', () => {
    expect(notificationOwner(p2p, false)).toBe('browser');
  });
  it('what the agent does not host stays the browser\'s', () => {
    expect(notificationOwner({ type: NotificationType.MESSAGE, data: { groupId: 'g' } }, true)).toBe('browser');
    expect(notificationOwner({ type: NotificationType.SYSTEM }, true)).toBe('browser');
  });
});

describe('a message for a window that is not in front', () => {
  it('raises no OS notification and no chime when the agent hosts the conversation', async () => {
    agentHosts(true);
    notificationService.addMessageNotification('Alice', 'hi', '9', 'owned-1', '5', { peerCid: '9' });
    await settle();
    expect(shown).toEqual([]);
    expect(chimes.count).toBe(0);
  });

  it('raises one, with its chime, when the browser runs messaging', async () => {
    agentHosts(false);
    notificationService.addMessageNotification('Alice', 'hi', '9', 'owned-2', '5', { peerCid: '9' });
    await vi.waitFor(() => expect(shown).toEqual(['Alice']));
    expect(chimes.count).toBe(1);
  });
});
