/**
 * The messenger's two seams onto an agent that hosts the account: the event
 * stream it applies (conversation-events.ts) and the requests it makes
 * (agent-actions.ts). Bound once, by the messenger, to its own state.
 */
import type { ConversationEvent } from 'citadel-internal-service-wasm-client';
import { errorLog } from '@/lib/debug-config';
import { createConversationEventApplier, conversationEventOf, type ConversationEventDeps } from './conversation-events';
import type { AgentActionDeps } from './agent-actions';
import { chatAdvancedSettings } from '../p2p/chat-advanced-settings';
import { agentHostsConversations } from './capabilities';
import { pushAccountPreferences } from './push-preferences';
import { onPrivacySettingsSaved } from '../privacy-settings';

type Listen = (event: string, handler: (data: unknown) => void) => void;

export interface AgentConversationParts extends ConversationEventDeps {
  findMessage: AgentActionDeps['findMessage'];
  /** The peers this account has conversations with, for their retention periods. */
  peers: () => bigint[];
}

/** Apply every ConversationEvent this window receives; answer what agent actions need. */
export function bindAgentConversations(listen: Listen, parts: AgentConversationParts): AgentActionDeps {
  const apply: (event: ConversationEvent) => Promise<void> = createConversationEventApplier(parts);
  const watchers: Set<(event: ConversationEvent) => void> = new Set();

  // One at a time, in arrival order: applying awaits, and an Updated overtaking
  // the Appended it follows would update a message the window does not hold yet.
  let applied: Promise<void> = Promise.resolve();
  listen('websocket-message', (message: unknown): void => {
    const event: ConversationEvent | null = conversationEventOf(message);
    if (!event) return;
    applied = applied
      .then(() => apply(event))
      .catch((error: unknown): void => errorLog('AgentConversations', `could not apply a ${event.kind} event`, error))
      // Watchers after the window holds the change: a send's composer clears
      // once its bubble is on screen, not before.
      .then((): void => { for (const watch of [...watchers]) watch(event); });
  });

  // The agent acts on these with no window open, so it hears every change.
  const tell = async (): Promise<void> => {
    const own: bigint | null = await parts.ownCid();
    if (own !== null && (await agentHostsConversations())) await pushAccountPreferences(own, parts.peers);
  };
  const told = (): void => { tell().catch((error: unknown): void => errorLog('AgentConversations', 'could not tell the agent this account\'s settings', error)); };
  listen('p2p:messages-loaded', told);
  onPrivacySettingsSaved(told);

  return {
    ownCid: parts.ownCid,
    securityLevel: async (ownCid: bigint, peerCid: bigint) => (await chatAdvancedSettings.get(ownCid, peerCid)).securityLevel,
    findMessage: parts.findMessage,
    onEvent: (listener: (event: ConversationEvent) => void): (() => void) => {
      watchers.add(listener);
      return (): void => { watchers.delete(listener); };
    },
    now: (): number => Date.now(),
  };
}
