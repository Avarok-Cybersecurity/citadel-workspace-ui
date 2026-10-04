/**
 * "Seen" means the person looked. A window that is visible but not focused
 * (another app in front) is not looking: marking read there told the sender
 * "Seen" for messages nobody had read.
 *
 * Drives the real useP2PMessages, the real P2PMessengerManager and the real
 * agent request path. The only stand-ins are the fake agent (the request
 * sender, which also answers, and the agent's declaration that it hosts the
 * account) and `document.hasFocus`, the browser fact under test. Each test
 * asserts on what reaches the agent: a ConversationMarkRead.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { InternalServiceRequest, InternalServiceResponse } from 'citadel-workspace-client-ts';
import { renderHook, act } from '@testing-library/react';
import { P2PMessengerManager, type P2PMessage } from '@/lib/p2p';
import { registerConversationSender } from '@/lib/agent-conversations/requests';
import { registerCapabilityRoute, forgetCapabilities, declareOnLeaderSocket, watchGreeting, type DeclaringClient, type Greeting } from '@/lib/agent-conversations/capabilities';
import { eventEmitter } from '@/lib/event-emitter';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import { instanceManager } from '@/lib/multi-instance';
import { useP2PMessages } from '../useP2PMessages';

const PEER: bigint = 77n;
const OWN: bigint = 5n;

let focused: boolean;
let sent: Array<Record<string, unknown>>;

function fakeAgentSocket(): DeclaringClient {
  let match: ((m: InternalServiceResponse) => unknown) | null = null;
  let settle: ((v: unknown) => void) | null = null;
  return {
    async sendDirectToInternalService(request: InternalServiceRequest): Promise<void> {
      const id: unknown = (request as { ConnectionManagement: { request_id: string } }).ConnectionManagement.request_id;
      settle?.(match?.({ AgentCapabilities: { request_id: id, agent_ilm: true } } as unknown as InternalServiceResponse));
    },
    nextResponse<T>(extract: (m: InternalServiceResponse) => T | undefined): Promise<T> {
      match = extract;
      return new Promise<T>((resolve) => { settle = resolve as (v: unknown) => void; });
    },
  };
}

async function agentHostsAccount(): Promise<void> {
  const greeting: Greeting = watchGreeting();
  greeting.observe({ ServiceConnectionAccepted: { cid: 0n, request_id: null, agent_ilm: true } } as never);
  await declareOnLeaderSocket(fakeAgentSocket(), greeting);
}

const onUnreadMessage: () => void = (): void => {};

function mount(tab: string): ReturnType<typeof renderHook> {
  const activeTabIdRef: { current: string } = { current: tab };
  return renderHook(() => useP2PMessages({
    peerCid: PEER, activeTabIdRef, scrollRef: { current: null }, onUnreadMessage,
  }), { wrapper: ConfirmDialogProvider });
}

const markReads = (): unknown[] => sent.filter((r) => 'ConversationMarkRead' in r);

beforeEach(async () => {
  forgetCapabilities();
  registerCapabilityRoute({ isLeader: () => true, askLeader: async () => true });
  await agentHostsAccount();
  instanceManager.setCid(OWN);
  sent = [];
  focused = false;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  registerConversationSender(async (request: Record<string, unknown>): Promise<void> => {
    sent.push(request);
    const [variant, body] = Object.entries(request)[0] as [string, { request_id: string }];
    if (variant === 'ConversationMarkRead') {
      queueMicrotask(() => eventEmitter.emit('websocket-message', { ConversationUpdated: { request_id: body.request_id, message: null } }));
    }
  });
  vi.spyOn(P2PMessengerManager.getInstance(), 'waitForReady').mockResolvedValue(undefined as never);
});

afterEach(() => vi.restoreAllMocks());

const settle = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe('marking a conversation read', () => {
  it('does nothing in a window that is visible but not focused', async () => {
    mount('messages');
    await settle();
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(markReads()).toHaveLength(0);
  });

  it('happens when the window gains focus', async () => {
    mount('messages');
    await settle();
    expect(markReads()).toHaveLength(0);
    focused = true;
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(markReads()).toHaveLength(1);
  });

  it('does not happen on gaining focus while another tab (a document) is showing', async () => {
    mount('doc-1');
    await settle();
    focused = true;
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(markReads()).toHaveLength(0);
  });

  it('happens on open when the window is in front', async () => {
    focused = true;
    mount('messages');
    await settle();
    expect(markReads()).toHaveLength(1);
  });

  describe('on a message arriving', () => {
    /** Mounts, and returns a function that delivers a message from the peer through the real listener. */
    async function mountAndReceive(tab: string): Promise<() => Promise<void>> {
      const messenger: P2PMessengerManager = P2PMessengerManager.getInstance();
      let deliver: ((m: P2PMessage) => void) | null = null;
      const real: P2PMessengerManager['onMessage'] = messenger.onMessage.bind(messenger);
      vi.spyOn(messenger, 'onMessage').mockImplementation((cb) => { deliver = cb; return real(cb); });
      mount(tab);
      await settle();
      sent = [];
      return async (): Promise<void> => {
        act(() => { deliver?.({ id: 'm1', senderCid: PEER, recipientCid: OWN, timestamp: 1 } as unknown as P2PMessage); });
        await settle();
      };
    }

    it('is not read by a window that is visible but not focused', async () => {
      const arrive: () => Promise<void> = await mountAndReceive('messages');
      await arrive();
      expect(markReads()).toHaveLength(0);
    });

    it('is read when the window is in front on the Messages tab', async () => {
      focused = true;
      const arrive: () => Promise<void> = await mountAndReceive('messages');
      await arrive();
      expect(markReads()).toHaveLength(1);
    });

    it('is not read when the window is in front but another tab is showing', async () => {
      focused = true;
      const arrive: () => Promise<void> = await mountAndReceive('doc-1');
      await arrive();
      expect(markReads()).toHaveLength(0);
    });
  });
});
