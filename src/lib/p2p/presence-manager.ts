/**
 * Presence Manager
 *
 * Handles P2P presence status (online/offline/away) and typing indicators.
 */

import {
  MessagingLayerType,
  createTyping,
  createOnline,
  isPresenceUpdate,
  TYPING_POLL_INTERVAL_MS,
} from '@/types/messaging-layer';
import type { MessagingLayer } from '@/types/messaging-layer';
import type { PeerPresence } from './p2p-types';
import { debugLog } from '@/lib/debug-config';
import { getPrivacySettings } from '@/lib/privacy-settings';

export type PresenceListener = (peerCid: bigint, presence: PeerPresence) => void;
export type TypingListener = (peerCid: bigint, isTyping: boolean) => void;

export interface PresenceManagerConfig {
  /** Function to send a P2P command */
  sendCommand: (peerCid: bigint, layer: MessagingLayer) => Promise<void>;
  /** Function to get all connected peer CIDs */
  getConnectedPeers: () => bigint[];
}

export class PresenceManager {
  private presenceListeners: PresenceListener[] = [];
  private typingListeners: TypingListener[] = [];

  // Typing polling state - managed per peer
  private typingPollingState: Map<bigint, {
    intervalId: NodeJS.Timeout | null;
    lastText: string;
    lastSentTyping: number;
  }> = new Map();

  // Our own presence status
  private ownPresence: PeerPresence = {
    status: MessagingLayerType.Online,
    lastUpdate: Date.now()
  };

  private readonly config: PresenceManagerConfig;

  constructor(config: PresenceManagerConfig) {
    this.config = config;
  }

  /**
   * Get own presence status
   */
  public getOwnPresence(): PeerPresence {
    return this.ownPresence;
  }

  /**
   * Set own presence status (for internal tracking)
   */
  public setOwnPresence(presence: PeerPresence): void {
    this.ownPresence = presence;
  }

  /**
   * Send presence update to a specific peer
   */
  public async sendPresenceUpdate(recipientCid: bigint, presence: MessagingLayer): Promise<void> {
    // Gated here rather than in broadcastPresence so that BOTH the broadcast and
    // the single-peer path obey it — broadcastPresence loops through this one.
    if (!getPrivacySettings().showOnlineStatus) return;
    if (!isPresenceUpdate(presence)) {
      debugLog('PresenceManager', 'Invalid presence layer type');
      return;
    }

    await this.config.sendCommand(recipientCid, presence);
  }

  /**
   * Broadcast presence update to all connected peers
   */
  public async broadcastPresence(presence: MessagingLayer): Promise<void> {
    const connectedPeers: bigint[] = this.config.getConnectedPeers();

    for (const peerCid of connectedPeers) {
      await this.sendPresenceUpdate(peerCid, presence);
    }

    // Update own presence tracking
    if (presence.type === MessagingLayerType.CustomState) {
      this.ownPresence = {
        status: MessagingLayerType.CustomState,
        customText: presence.text,
        customColor: presence.indicator_icon_color,
        lastUpdate: Date.now()
      };
    } else if (
      presence.type === MessagingLayerType.Online ||
      presence.type === MessagingLayerType.Offline ||
      presence.type === MessagingLayerType.Away
    ) {
      this.ownPresence = {
        status: presence.type,
        lastUpdate: Date.now()
      };
    }
  }

  /**
   * Broadcast Online presence when P2P connection is established.
   */
  public async broadcastOnlineToNewPeer(peerCid: bigint): Promise<void> {
    try {
      await this.sendPresenceUpdate(peerCid, createOnline());
    } catch (error) {
      debugLog('PresenceManager', '[P2P] Failed to broadcast Online presence on connect:', error);
    }
  }

  /**
   * Notify presence listeners of a change
   */
  public notifyPresenceChange(peerCid: bigint, presence: PeerPresence): void {
    this.presenceListeners.forEach(listener => listener(peerCid, presence));
  }

  /**
   * Notify typing listeners of a change
   */
  public notifyTypingChange(peerCid: bigint, isTyping: boolean): void {
    this.typingListeners.forEach(listener => listener(peerCid, isTyping));
  }

  /**
   * Start typing polling for a peer conversation.
   * Call this when the user focuses on the input field.
   * The polling will check every TYPING_POLL_INTERVAL_MS if text changed.
   */
  public startTypingPolling(recipientCid: bigint, getCurrentText: () => string): void {
    // Stop any existing polling for this peer
    this.stopTypingPolling(recipientCid);

    const state: { intervalId: NodeJS.Timeout | null; lastText: string; lastSentTyping: number; } = {
      intervalId: null as NodeJS.Timeout | null,
      lastText: getCurrentText(),
      lastSentTyping: 0
    };

    state.intervalId = setInterval(() => {
      const currentText: string = getCurrentText();
      const textChanged: boolean = currentText !== state.lastText;
      state.lastText = currentText;

      // Only send typing indicator if text actually changed and is non-empty
      if (textChanged && currentText.length > 0) {
        void this.sendTypingIndicator(recipientCid);
        state.lastSentTyping = Date.now();
      }
    }, TYPING_POLL_INTERVAL_MS);

    this.typingPollingState.set(recipientCid, state);
  }

  /**
   * Stop typing polling for a peer conversation.
   * Call this when the user blurs the input field or sends a message.
   */
  public stopTypingPolling(recipientCid: bigint): void {
    const state: { intervalId: NodeJS.Timeout | null; lastText: string; lastSentTyping: number; } | undefined = this.typingPollingState.get(recipientCid);
    if (state?.intervalId) {
      clearInterval(state.intervalId);
    }
    this.typingPollingState.delete(recipientCid);
  }

  /**
   * Send a one-shot typing indicator to a peer.
   *
   * Public so callers that already manage their own typing state (e.g.
   * MessagingService.sendTypingIndicator, triggered by input focus/blur
   * effects in a message composer) can fire an indicator without
   * setting up the full polling machinery.
   */
  public async sendTypingIndicator(recipientCid: bigint): Promise<void> {
    // "Show typing indicators: off" now means the peer is not told. It used to
    // mean nothing at all: the setting was written to localStorage and read by
    // no one.
    if (!getPrivacySettings().showTypingIndicators) return;
    try {
      const layer: MessagingLayer = createTyping();
      await this.config.sendCommand(recipientCid, layer);
    } catch (error) {
      debugLog('PresenceManager', 'Failed to send typing indicator:', error);
    }
  }

  // Event listener registration
  public onPresenceChange(listener: PresenceListener): () => void {
    this.presenceListeners.push(listener);
    return () => {
      this.presenceListeners = this.presenceListeners.filter(l => l !== listener);
    };
  }

  public onTyping(listener: TypingListener): () => void {
    this.typingListeners.push(listener);
    return () => {
      this.typingListeners = this.typingListeners.filter(l => l !== listener);
    };
  }
}
