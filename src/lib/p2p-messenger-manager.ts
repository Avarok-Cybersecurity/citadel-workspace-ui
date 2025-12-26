import {
  P2PCommand,
  P2PCommandType,
  P2PMessagingLayerPayload,
  P2PMessageAckPayload,
  createMessagingLayerCommand,
  createMessageAckCommand,
  serializeP2PCommand,
  deserializeP2PCommand,
  isMessagingLayerPayload,
  isMessageAckPayload
} from '@/types/p2p-types';
import type { MessagingLayer } from '@/types/messaging-layer';
import {
  MessagingLayerType,
  createMessage,
  createTyping,
  createOnline,
  createOffline,
  createAway,
  createCustomState,
  createCheckState,
  createCheckStateResponse,
  isMessage,
  isTyping,
  isPresenceUpdate,
  isCheckState,
  isCheckStateResponse,
  TYPING_POLL_INTERVAL_MS,
  TYPING_DISPLAY_DURATION_MS
} from '@/types/messaging-layer';
import { websocketService } from './websocket-service';
import { eventEmitter } from './event-emitter';
import { p2pRegistrationService } from './p2p-registration-service';
import { p2pAutoConnectService } from './p2p-auto-connect-service';
import { connectionManager } from './connection-manager';
import { getSelectedUser } from './tab-context';
import { notificationService } from './notification-service';
import { BroadcastChannelService } from './broadcast-channel-service';
import type { InternalServiceResponse } from 'citadel-workspace-client-ts';

import type { MessageType } from '@/types/message-protocol';

export interface P2PMessage {
  id: string;
  content: string;
  senderCid: string;
  recipientCid: string;
  timestamp: number;
  index: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  replyTo?: string;
  mentions?: string[];
  attachments?: any[];
  // Message type support (text, markdown, live_document)
  message_type: MessageType;
  // Live document specific fields
  document_id?: string;
  document_title?: string;
}

/** Peer presence status derived from MessagingLayer presence variants */
export interface PeerPresence {
  status: MessagingLayerType.Online | MessagingLayerType.Offline | MessagingLayerType.Away | MessagingLayerType.CustomState;
  customText?: string;
  customColor?: string;
  lastUpdate: number;
}

export interface P2PConversation {
  peerCid: string;
  peerUsername?: string;  // Store the peer's username for display
  messages: P2PMessage[];
  lastMessageIndex: number;
  unreadCount: number;
  typing: boolean;
  lastTypingUpdate: number;
  presence: PeerPresence;
}

interface MessageCache {
  conversations: Map<string, P2PConversation>;
  messageQueue: P2PMessage[];
  maxQueueSize: number;
  maxMessagesPerConversation: number;
}

export class P2PMessengerManager {
  private static instance: P2PMessengerManager;
  private cache: MessageCache;
  private dbPrefix = 'p2p_messages';
  private connections: Map<string, boolean> = new Map(); // peerCid -> isConnected
  private messageListeners: ((message: P2PMessage) => void)[] = [];
  private messageStatusListeners: ((messageId: string, status: P2PMessage['status']) => void)[] = [];
  private typingListeners: ((peerCid: string, isTyping: boolean) => void)[] = [];
  private connectionListeners: ((peerCid: string, connected: boolean) => void)[] = [];
  private presenceListeners: ((peerCid: string, presence: PeerPresence) => void)[] = [];

  // Initialization state tracking for LocalDB load
  private initPromise: Promise<void> | null = null;
  private isReady = false;

  // Peer ready state tracking for CheckState/CheckStateResponse handshake
  private peerReadyState: Map<string, boolean> = new Map();  // peer CID -> is ready
  private pendingCheckStates: Map<string, { resolve: () => void; reject: (e: Error) => void }> = new Map();

  // CheckState timeout - reduced for better UX with background tabs
  // The intersession layer manager handles reliability, so CheckState is optional optimization
  private readonly CHECKSTATE_TIMEOUT = 3000;  // 3 seconds (was 10s)

  // Queue for pending CheckState responses when tab is hidden
  private pendingCheckStateResponses: string[] = [];

  // Typing polling state - managed per peer
  private typingPollingState: Map<string, {
    intervalId: NodeJS.Timeout | null;
    lastText: string;
    lastSentTyping: number;
  }> = new Map();

  // Our own presence status
  private ownPresence: PeerPresence = {
    status: MessagingLayerType.Online,
    lastUpdate: Date.now()
  };

  // Track active conversation to suppress notifications
  private activeConversationPeerCid: string | null = null;

  private constructor() {
    this.cache = {
      conversations: new Map(),
      messageQueue: [],
      maxQueueSize: 100,
      maxMessagesPerConversation: 100
    };

    this.setupEventListeners();
    this.setupVisibilityHandler();
    // Store the promise and emit event when ready
    this.initPromise = this.loadCachedMessages().then(() => {
      this.isReady = true;
      eventEmitter.emit('p2p:messages-loaded');
    });
  }

  public static getInstance(): P2PMessengerManager {
    if (!P2PMessengerManager.instance) {
      P2PMessengerManager.instance = new P2PMessengerManager();
    }
    return P2PMessengerManager.instance;
  }

  /**
   * Wait for the messenger to be ready (LocalDB messages loaded).
   * Call this before accessing conversations to ensure persistence is loaded.
   */
  public async waitForReady(): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) await this.initPromise;
  }

  /**
   * Sync connections from backend active sessions.
   * This handles the case where the page was reloaded and the connections map is empty,
   * but the backend still has active P2P connections.
   * Call this when opening a conversation to ensure presence status is accurate.
   */
  public async syncConnectionsFromBackend(): Promise<void> {
    try {
      const activeSessions = await connectionManager.getActiveSessions();
      const currentCid = this.getCurrentCid();

      if (!currentCid) {
        console.log('[P2P] syncConnectionsFromBackend: No current CID, skipping');
        return;
      }

      // Find the session matching our current CID
      const mySession = activeSessions.find(s => s.cid?.toString() === currentCid);
      if (!mySession) {
        console.log('[P2P] syncConnectionsFromBackend: No session found for current CID');
        return;
      }

      // Sync peer connections from backend
      if (mySession.peer_connections) {
        const peerCids = Object.keys(mySession.peer_connections);
        console.log(`[P2P] syncConnectionsFromBackend: Found ${peerCids.length} peer connections in backend`);

        for (const peerCid of peerCids) {
          // Update local connections map
          if (!this.connections.get(peerCid)) {
            this.connections.set(peerCid, true);
            console.log(`[P2P] syncConnectionsFromBackend: Synced connection for peer ${peerCid.slice(0, 8)}...`);
          }

          // Update presence to Online for connected peers
          this.updatePeerPresenceOnConnect(peerCid);
        }
      }

      // Also sync from p2pAutoConnectService which tracks connected peers
      const connectedPeers = p2pAutoConnectService.getConnectedPeers();
      for (const peerCid of connectedPeers) {
        if (!this.connections.get(peerCid)) {
          this.connections.set(peerCid, true);
          console.log(`[P2P] syncConnectionsFromBackend: Synced from auto-connect service ${peerCid.slice(0, 8)}...`);
        }
        this.updatePeerPresenceOnConnect(peerCid);
      }

    } catch (error) {
      console.warn('[P2P] syncConnectionsFromBackend: Failed to sync connections:', error);
    }
  }

  /**
   * Set or update the username for a peer.
   * Call this when we learn the peer's username (e.g., from registration events).
   */
  public setPeerUsername(peerCid: string, username: string): void {
    const conversation = this.cache.conversations.get(peerCid);
    if (conversation) {
      conversation.peerUsername = username;
      this.persistConversations();
    }
  }

  private getCurrentCid(): string | null {
    // Priority: 1) Tab context selectedCid (set during session switch),
    // 2) StoredSession.cid, 3) Global connection CID
    // This ensures P2P requests use the current tab's selected session CID
    const tabSelection = getSelectedUser();
    if (tabSelection?.selectedCid) {
      return tabSelection.selectedCid;
    }
    const tabSession = connectionManager.getTabSelectedSession();
    if (tabSession?.cid) {
      return tabSession.cid;
    }
    const connectionInfo = connectionManager.getConnectionInfo();
    return connectionInfo?.cid || null;
  }

  private setupEventListeners() {
    // Listen for P2P responses from the WebSocket service
    eventEmitter.on('websocket-message', this.handleWebSocketMessage.bind(this));

    // Listen for connection changes
    eventEmitter.on('p2p-connection-established', ({ peerCid }: { peerCid: string }) => {
      this.connections.set(peerCid, true);
      this.connectionListeners.forEach(listener => listener(peerCid, true));

      // Update peer's presence to Online when connection is established
      this.updatePeerPresenceOnConnect(peerCid);
    });

    eventEmitter.on('p2p-connection-lost', ({ peerCid }: { peerCid: string }) => {
      this.connections.set(peerCid, false);
      this.connectionListeners.forEach(listener => listener(peerCid, false));
      // Clear ready state when peer disconnects - next message will trigger new CheckState handshake
      this.clearPeerReadyState(peerCid);

      // Update peer's presence to Offline when connection is lost
      this.updatePeerPresenceOnDisconnect(peerCid);
    });

    // Listen for peer registration events to store usernames
    eventEmitter.on('p2p:peer-registered', ({ peer }: { peer: { cid: string; username: string } }) => {
      if (peer.cid && peer.username) {
        this.setPeerUsername(peer.cid, peer.username);
      }
    });
  }

  /**
   * Setup visibility handler to prioritize CheckState responses when tab becomes visible.
   * Browsers throttle JavaScript in background tabs, so we queue responses and flush on visibility.
   */
  private setupVisibilityHandler(): void {
    if (typeof document === 'undefined') return;  // SSR safety

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[P2P] Tab visible - flushing pending CheckState responses');
        this.flushPendingCheckStateResponses();
      }
    });
  }

  /**
   * Flush any pending CheckState responses that were queued while tab was hidden.
   */
  private flushPendingCheckStateResponses(): void {
    if (this.pendingCheckStateResponses.length === 0) return;

    console.log(`[P2P] Flushing ${this.pendingCheckStateResponses.length} pending CheckState responses`);
    for (const peerCid of this.pendingCheckStateResponses) {
      this.sendCheckStateResponse(peerCid).catch(error => {
        console.debug('[P2P] Failed to send queued CheckStateResponse:', error);
      });
    }
    this.pendingCheckStateResponses = [];
  }

  private async handleWebSocketMessage(response: InternalServiceResponse) {
    // Handle P2P message responses via MessageNotification
    // MessageNotification is sent by the backend when a peer sends us a message
    if ('MessageNotification' in response) {
      const notification = (response as any).MessageNotification;
      const { message: rawMessage, peer_cid, cid } = notification;

      // Check if this is a P2P message (peer_cid is non-zero and different from our CID)
      const currentCid = this.getCurrentCid();
      const peerCidStr = peer_cid?.toString();
      const notificationCidStr = cid?.toString();

      console.log('[P2P] handleWebSocketMessage checking MessageNotification:', {
        peer_cid: peerCidStr,
        notification_cid: notificationCidStr,
        currentCid,
        isP2P: peerCidStr && peerCidStr !== '0'
      });

      // Skip if no peer_cid or peer_cid is 0 (from server)
      if (!peerCidStr || peerCidStr === '0') {
        console.log('[P2P] Skipping: no peer_cid or peer_cid is 0');
        return;
      }

      // Self-message check: Skip if sender is the same as recipient
      if (peerCidStr === notificationCidStr) {
        console.log('[P2P] Skipping: peer_cid equals notification_cid (self-message)');
        return;
      }

      try {
        // STEP 1: Parse the raw message first
        // This must happen before session checks so we can broadcast for Yjs sync
        let messageStr: string;
        if (Array.isArray(rawMessage)) {
          const contentBytes = new Uint8Array(rawMessage);
          messageStr = new TextDecoder().decode(contentBytes);
        } else if (typeof rawMessage === 'string') {
          messageStr = rawMessage;
        } else {
          console.error('Unexpected message format:', typeof rawMessage);
          return;
        }

        console.log('P2P message content:', messageStr);

        // STEP 2: Broadcast raw message for Yjs sync BEFORE session check
        // All tabs need to receive Yjs updates regardless of which session they own
        const rawMessageData = { peerCid: peerCidStr, message: messageStr };
        eventEmitter.emit('p2p:raw-message', rawMessageData);

        // Broadcast to follower tabs so their YjsP2PProvider instances can receive updates
        BroadcastChannelService.getInstance().broadcastP2PRawMessage(rawMessageData);

        // STEP 3: Check if this message is for THIS tab's session
        // For P2P messages in multi-tab environment:
        // - peer_cid is the SENDER's CID
        // - notification.cid is the RECIPIENT's CID (the session that received the message)
        // - currentCid is THIS tab's session CID (via getSelectedUser/tabContext)
        //
        // CRITICAL: In multi-tab scenarios with shared WebSocket:
        // - Leader tab receives ALL MessageNotifications for all sessions
        // - Each tab's P2PMessengerManager MUST only process messages for its own session
        // - Without this check, leader processes messages meant for other sessions,
        //   adding them to wrong conversations and breaking the UI
        if (currentCid && notificationCidStr && notificationCidStr !== currentCid) {
          console.log('[P2P] Skipping chat processing: notification is for different session', {
            notification_cid: notificationCidStr,
            currentCid,
            peer_cid: peerCidStr
          });
          return;
        }

        console.log('P2P MessageNotification received from peer:', peerCidStr, 'for session:', notificationCidStr);

        // STEP 4: Verify sender is registered
        const isAlreadyConnected = this.isConnected(peerCidStr);
        const isAlreadyRegistered = p2pRegistrationService.isPeerRegistered(peerCidStr);

        if (!isAlreadyRegistered && !isAlreadyConnected) {
          console.error(`[P2P] Received message from unregistered peer ${peerCidStr} - protocol violation`);
          // Still process the message but log the violation
        }

        // STEP 5: Process the P2P command for chat messages
        const command = deserializeP2PCommand(messageStr);
        await this.handleP2PCommand(command, peerCidStr, notificationCidStr);
      } catch (error) {
        console.error('Failed to deserialize P2P command:', error);
      }
      return;
    }

    // Legacy handler for PeerMessage (in case backend format changes)
    if ('PeerMessage' in response) {
      const { peer_cid, message } = (response as any).PeerMessage;
      try {
        const command = deserializeP2PCommand(message);
        await this.handleP2PCommand(command, peer_cid?.toString());
      } catch (error) {
        console.error('Failed to deserialize P2P command:', error);
      }
    }
  }

  private async handleP2PCommand(command: P2PCommand, peerCid: string, recipientCid?: string) {
    // Note: Session filtering is already performed in handleWebSocketMessage():
    // - Self-echo check at line 334 (peer_cid !== notification.cid)
    // - Session ownership check at line 374 (notification.cid === currentCid)
    // This ensures only the correct tab processes each message

    switch (command.type) {
      case P2PCommandType.MessagingLayerCommand:
        if (isMessagingLayerPayload(command.payload)) {
          await this.handleMessagingLayerCommand(command.payload, peerCid, recipientCid);
        }
        break;

      case P2PCommandType.MessageAck:
        if (isMessageAckPayload(command.payload)) {
          await this.handleMessageAck(command.payload);
        }
        break;
    }
  }

  private async handleMessagingLayerCommand(payload: P2PMessagingLayerPayload, peerCid: string, recipientCid?: string) {
    const { layer } = payload;

    switch (layer.type) {
      case MessagingLayerType.Message:
        await this.handleIncomingMessage(payload, peerCid, recipientCid);
        break;

      case MessagingLayerType.Typing:
        this.handleTypingIndicator(peerCid);
        break;

      case MessagingLayerType.Online:
      case MessagingLayerType.Offline:
      case MessagingLayerType.Away:
        this.handlePresenceUpdate(peerCid, {
          status: layer.type,
          lastUpdate: Date.now()
        });
        break;

      case MessagingLayerType.CustomState:
        this.handlePresenceUpdate(peerCid, {
          status: MessagingLayerType.CustomState,
          customText: layer.text,
          customColor: layer.indicator_icon_color,
          lastUpdate: Date.now()
        });
        break;

      case MessagingLayerType.CheckState:
        // Peer is asking if we're ready - respond immediately and queue for flush on visibility
        console.log('[P2P] Received CheckState from peer:', peerCid, '- responding Ready');
        // Queue for flush when tab becomes visible (handles browser throttling in background tabs)
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          this.pendingCheckStateResponses.push(peerCid);
          console.log(`[P2P] Tab hidden - queued CheckState response for ${peerCid}`);
        }
        // Always try to respond immediately (best effort - may be throttled in background)
        await this.sendCheckStateResponse(peerCid);
        break;

      case MessagingLayerType.CheckStateResponse:
        // Peer confirmed they're ready - update state and resolve pending promise
        console.log('[P2P] Received CheckStateResponse from peer:', peerCid);
        this.peerReadyState.set(peerCid, true);
        const pending = this.pendingCheckStates.get(peerCid);
        if (pending) {
          pending.resolve();
          this.pendingCheckStates.delete(peerCid);
        }
        break;
    }
  }

  /**
   * Send CheckStateResponse to a peer - always responds Ready
   */
  private async sendCheckStateResponse(peerCid: string) {
    const currentCid = this.getCurrentCid();
    if (!currentCid) return;

    const response = createCheckStateResponse();
    const conversation = this.getOrCreateConversation(peerCid);
    const command = createMessagingLayerCommand(
      response,
      currentCid,
      peerCid,
      conversation.lastMessageIndex  // index doesn't matter for control messages
    );

    try {
      await this.sendP2PCommand(peerCid, command);
      console.log('[P2P] Sent CheckStateResponse to peer:', peerCid);
    } catch (error) {
      console.error('[P2P] Failed to send CheckStateResponse:', error);
    }
  }

  private async handleIncomingMessage(payload: P2PMessagingLayerPayload, peerCid: string, recipientCid?: string) {
    // layer is guaranteed to be Message type when called from handleMessagingLayerCommand
    const layer = payload.layer;
    if (!isMessage(layer)) return;

    const message: P2PMessage = {
      id: payload.message_id,
      content: layer.contents,
      senderCid: payload.sender_cid,
      recipientCid: payload.recipient_cid,
      timestamp: layer.timestamp,
      index: payload.index,
      status: 'delivered',
      replyTo: payload.reply_to,
      mentions: payload.mentions,
      attachments: payload.attachments,
      // Message type support - default to 'text' for backward compatibility
      message_type: payload.message_type || 'text',
      document_id: payload.document_id,
      document_title: payload.document_title
    };

    // Add to conversation - returns false if this is a duplicate message
    const wasAdded = await this.addMessageToConversation(peerCid, message);

    // Only notify listeners if message was newly added (prevents duplicate notifications)
    // This handles the case where optimistic update already added the message in sendMessage()
    if (wasAdded) {
      console.log('[P2P] Notifying listeners of new message:', message.id);
      this.messageListeners.forEach(listener => listener(message));

      // Emit event for UI updates
      eventEmitter.emit('p2p:message-received', {
        peerCid,
        messageId: message.id,
        text: message.content,
        timestamp: message.timestamp,
      });

      // Show notification if chat not open
      if (this.shouldShowNotification(peerCid)) {
        const conversation = this.cache.conversations.get(peerCid);
        const peerUsername = conversation?.peerUsername || `Peer ${peerCid.slice(0, 8)}`;

        notificationService.addMessageNotification(
          `New message from ${peerUsername}`,
          message.content.substring(0, 100), // Preview first 100 chars
          peerCid,        // senderId - the peer who sent the message
          message.id,     // messageId
          recipientCid,   // recipientCid - the session receiving this message
          { peerCid, onOpen: () => eventEmitter.emit('p2p:open-conversation', { peerCid }) }
        );
      }

      // Send delivery acknowledgment only for newly added messages (fire-and-forget)
      // ACKs are ancillary - downgrade to debug to avoid spurious error logs
      this.sendMessageAck(message.id, 'delivered', peerCid, recipientCid).catch(error => {
        console.debug('[P2P] Delivery ACK send failed (non-blocking, expected occasionally):', error);
      });
    } else {
      console.log('[P2P] Skipping duplicate message notification:', message.id);
    }
  }

  private async handleMessageAck(payload: P2PMessageAckPayload) {
    // Update message status in all conversations
    let statusUpdated = false;
    let newStatus: P2PMessage['status'] = 'sent';

    this.cache.conversations.forEach(conversation => {
      const message = conversation.messages.find(m => m.id === payload.message_id);
      if (message) {
        newStatus = payload.ack_type === 'failed' ? 'failed' : payload.ack_type;
        message.status = newStatus;
        if (payload.error) {
          message.error = payload.error;
        }
        statusUpdated = true;
      }
    });

    // Persist the update
    await this.persistConversations();

    // Notify listeners about status change
    if (statusUpdated) {
      this.messageStatusListeners.forEach(listener => listener(payload.message_id, newStatus));
    }
  }

  /**
   * Handle incoming typing indicator from peer.
   * Typing indicator is displayed for TYPING_DISPLAY_DURATION_MS then clears.
   */
  private handleTypingIndicator(peerCid: string) {
    const timestamp = Date.now();
    const conversation = this.getOrCreateConversation(peerCid);
    conversation.typing = true;
    conversation.lastTypingUpdate = timestamp;

    // Notify listeners
    this.typingListeners.forEach(listener => listener(peerCid, true));

    // Clear typing indicator after display duration
    setTimeout(() => {
      const conv = this.cache.conversations.get(peerCid);
      if (conv && conv.lastTypingUpdate === timestamp) {
        conv.typing = false;
        this.typingListeners.forEach(listener => listener(peerCid, false));
      }
    }, TYPING_DISPLAY_DURATION_MS);
  }

  /**
   * Handle incoming presence update from peer
   */
  private handlePresenceUpdate(peerCid: string, presence: PeerPresence) {
    const conversation = this.getOrCreateConversation(peerCid);
    conversation.presence = presence;

    // Notify listeners
    this.presenceListeners.forEach(listener => listener(peerCid, presence));
  }

  public async sendMessage(
    recipientCid: string,
    content: string,
    options?: {
      replyTo?: string;
      mentions?: string[];
      attachments?: any[];
      messageType?: MessageType;
      documentId?: string;
      documentTitle?: string;
    }
  ): Promise<P2PMessage> {
    // CRITICAL DEBUG: Log entry to sendMessage
    console.log(`[P2P] *** sendMessage ENTRY *** recipientCid=${recipientCid?.slice(0, 8)}..., content="${content.slice(0, 20)}..."`);

    const { replyTo, mentions, attachments, messageType = 'text', documentId, documentTitle } = options || {};

    // Check if peer is registered OR already P2P connected
    // Skip registration if already connected - connection implies registration was successful
    const isAlreadyConnected = this.isConnected(recipientCid);
    const isAlreadyRegistered = p2pRegistrationService.isPeerRegistered(recipientCid);

    if (!isAlreadyRegistered && !isAlreadyConnected) {
      console.log(`Peer ${recipientCid} not registered and not connected, registering now...`);
      try {
        // Use connectAfterRegister: false to avoid timeout issues
        // We'll establish the P2P connection explicitly via openP2PConnection
        await p2pRegistrationService.registerPeer(recipientCid, {
          connectAfterRegister: false
        });
        console.log(`Successfully registered peer ${recipientCid}`);
      } catch (error) {
        console.error(`Failed to register peer ${recipientCid}:`, error);
        throw new Error(`Failed to register peer for P2P communication: ${error}`);
      }
    } else {
      console.log(`Peer ${recipientCid} already ${isAlreadyConnected ? 'connected' : 'registered'}, skipping registration`);
    }

    // Ensure P2P connection is being established in background (non-blocking)
    // This starts PeerConnect if not already connected, without blocking message sending
    p2pAutoConnectService.ensurePeerConnectedInBackground(recipientCid);

    // Try to ensure peer is ready (non-blocking - proceed regardless of CheckState result)
    // The intersession layer manager in WASM handles message reliability
    const peerReady = await this.tryEnsurePeerReady(recipientCid);
    if (!peerReady) {
      console.log(`[P2P] Sending to ${recipientCid} without CheckState confirmation (transport handles delivery)`);
    }

    const conversation = this.getOrCreateConversation(recipientCid);
    const index = conversation.lastMessageIndex + 1;

    // Get current CID from connection
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const timestamp = Date.now();
    const messageId = crypto.randomUUID();

    // Create MessagingLayer Message variant
    const layer = createMessage(content, timestamp);

    const command = createMessagingLayerCommand(
      layer,
      currentCid,
      recipientCid,
      index,
      { messageId, replyTo, mentions, attachments, messageType, documentId, documentTitle }
    );

    const message: P2PMessage = {
      id: messageId,
      content,
      senderCid: currentCid,
      recipientCid,
      timestamp,
      index,
      status: 'pending',
      replyTo,
      mentions,
      attachments,
      message_type: messageType,
      document_id: documentId,
      document_title: documentTitle
    };

    // Add to conversation optimistically
    await this.addMessageToConversation(recipientCid, message);

    // Notify listeners so UI updates immediately
    this.messageListeners.forEach(listener => listener(message));

    // Send via P2P connection
    console.log(`[P2P] Sending message ${messageId} to ${recipientCid.slice(0, 8)}... (content: "${content.slice(0, 30)}${content.length > 30 ? '...' : ''}")`);
    const sendStartTime = Date.now();
    try {
      await this.sendP2PCommand(recipientCid, command);
      message.status = 'sent';
      console.log(`[P2P] Message ${messageId} sent successfully in ${Date.now() - sendStartTime}ms`);
    } catch (error) {
      message.status = 'failed';
      message.error = error instanceof Error ? error.message : 'Failed to send';
      console.error(`[P2P] Message ${messageId} FAILED after ${Date.now() - sendStartTime}ms:`, error);
      throw error;
    }

    return message;
  }

  /**
   * Retry sending a failed message.
   * Looks up the message by ID, resets status to pending, and re-sends.
   */
  public async resendMessage(peerCid: string, messageId: string): Promise<void> {
    const conversation = this.cache.conversations.get(peerCid);
    if (!conversation) {
      throw new Error(`Conversation with ${peerCid} not found`);
    }

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in conversation`);
    }

    if (message.status !== 'failed') {
      console.log(`[P2P] Message ${messageId} is not in failed state (${message.status}), skipping resend`);
      return;
    }

    console.log(`[P2P] Resending message ${messageId} to ${peerCid}`);

    // Reset status to pending
    message.status = 'pending';
    message.error = undefined;

    // Notify listeners of status change
    this.messageStatusListeners.forEach(listener => listener(messageId, 'pending'));

    // Ensure P2P connection is being established in background (non-blocking)
    p2pAutoConnectService.ensurePeerConnectedInBackground(peerCid);

    // Try to ensure peer is ready (non-blocking)
    const peerReady = await this.tryEnsurePeerReady(peerCid);
    if (!peerReady) {
      console.log(`[P2P] Resending to ${peerCid} without CheckState confirmation`);
    }

    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      message.status = 'failed';
      message.error = 'Not connected to server';
      this.messageStatusListeners.forEach(listener => listener(messageId, 'failed'));
      throw new Error('Not connected to server');
    }

    // Recreate the MessagingLayer command
    const layer = createMessage(message.content, message.timestamp);
    const command = createMessagingLayerCommand(
      layer,
      currentCid,
      peerCid,
      message.index,
      {
        messageId: message.id,
        replyTo: message.replyTo,
        mentions: message.mentions,
        attachments: message.attachments,
        messageType: message.message_type,
        documentId: message.document_id,
        documentTitle: message.document_title
      }
    );

    try {
      await this.sendP2PCommand(peerCid, command);
      message.status = 'sent';
      this.messageStatusListeners.forEach(listener => listener(messageId, 'sent'));
      console.log(`[P2P] Successfully resent message ${messageId}`);
    } catch (error) {
      message.status = 'failed';
      message.error = error instanceof Error ? error.message : 'Failed to send';
      this.messageStatusListeners.forEach(listener => listener(messageId, 'failed'));
      throw error;
    }

    // Persist the updated status
    await this.persistConversations();
  }

  /**
   * Start typing polling for a peer conversation.
   * Call this when the user focuses on the input field.
   * The polling will check every TYPING_POLL_INTERVAL_MS if text changed.
   */
  public startTypingPolling(recipientCid: string, getCurrentText: () => string) {
    // Stop any existing polling for this peer
    this.stopTypingPolling(recipientCid);

    const state = {
      intervalId: null as NodeJS.Timeout | null,
      lastText: getCurrentText(),
      lastSentTyping: 0
    };

    state.intervalId = setInterval(() => {
      const currentText = getCurrentText();
      const textChanged = currentText !== state.lastText;
      state.lastText = currentText;

      // Only send typing indicator if text actually changed and is non-empty
      if (textChanged && currentText.length > 0) {
        this.sendTypingIndicatorInternal(recipientCid);
        state.lastSentTyping = Date.now();
      }
    }, TYPING_POLL_INTERVAL_MS);

    this.typingPollingState.set(recipientCid, state);
  }

  /**
   * Stop typing polling for a peer conversation.
   * Call this when the user blurs the input field or sends a message.
   */
  public stopTypingPolling(recipientCid: string) {
    const state = this.typingPollingState.get(recipientCid);
    if (state?.intervalId) {
      clearInterval(state.intervalId);
    }
    this.typingPollingState.delete(recipientCid);
  }

  /**
   * Internal method to send a typing indicator
   */
  private async sendTypingIndicatorInternal(recipientCid: string) {
    const currentCid = this.getCurrentCid();
    if (!currentCid) return;

    const layer = createTyping();
    const conversation = this.getOrCreateConversation(recipientCid);
    const command = createMessagingLayerCommand(
      layer,
      currentCid,
      recipientCid,
      conversation.lastMessageIndex
    );

    try {
      await this.sendP2PCommand(recipientCid, command);
    } catch (error) {
      console.error('Failed to send typing indicator:', error);
    }
  }

  /**
   * Send presence update to a specific peer
   */
  public async sendPresenceUpdate(recipientCid: string, presence: MessagingLayer) {
    if (!isPresenceUpdate(presence)) {
      console.error('Invalid presence layer type');
      return;
    }

    const currentCid = this.getCurrentCid();
    if (!currentCid) return;

    const conversation = this.getOrCreateConversation(recipientCid);
    const command = createMessagingLayerCommand(
      presence,
      currentCid,
      recipientCid,
      conversation.lastMessageIndex
    );

    await this.sendP2PCommand(recipientCid, command);
  }

  /**
   * Broadcast presence update to all connected peers
   */
  public async broadcastPresence(presence: MessagingLayer) {
    const connectedPeers = Array.from(this.connections.entries())
      .filter(([_, connected]) => connected)
      .map(([peerCid]) => peerCid);

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
   * Get own presence status
   */
  public getOwnPresence(): PeerPresence {
    return this.ownPresence;
  }

  /**
   * Update peer's presence to Online when P2P connection is established.
   * Also broadcasts our own Online presence to the peer.
   */
  private updatePeerPresenceOnConnect(peerCid: string): void {
    const conversation = this.cache.conversations.get(peerCid);
    if (conversation) {
      const newPresence = {
        status: MessagingLayerType.Online as const,
        lastUpdate: Date.now()
      };
      conversation.presence = newPresence;
      console.log(`[P2P] Updated presence to Online for peer: ${peerCid.slice(0, 8)}...`);

      // Notify presence listeners so UI can update
      this.presenceListeners.forEach(listener => listener(peerCid, newPresence));

      // Emit presence update event so UI can refresh (for external listeners)
      eventEmitter.emit('p2p:presence-updated', {
        peerCid,
        presence: newPresence
      });
    }

    // Broadcast our own Online presence to the peer
    this.sendPresenceUpdate(peerCid, createOnline()).catch(error => {
      console.debug('[P2P] Failed to broadcast Online presence on connect:', error);
    });
  }

  /**
   * Update peer's presence to Offline when P2P connection is lost.
   */
  private updatePeerPresenceOnDisconnect(peerCid: string): void {
    const conversation = this.cache.conversations.get(peerCid);
    if (conversation) {
      const newPresence = {
        status: MessagingLayerType.Offline as const,
        lastUpdate: Date.now()
      };
      conversation.presence = newPresence;
      console.log(`[P2P] Updated presence to Offline for peer: ${peerCid.slice(0, 8)}...`);

      // Notify presence listeners so UI can update
      this.presenceListeners.forEach(listener => listener(peerCid, newPresence));

      // Emit presence update event so UI can refresh (for external listeners)
      eventEmitter.emit('p2p:presence-updated', {
        peerCid,
        presence: newPresence
      });
    }
  }

  /**
   * Ensure peer is ready for messaging by sending CheckState and waiting for response.
   * Must be called before sending any message to a peer.
   *
   * @param peerCid - The peer's CID to verify
   * @param timeout - Max time to wait (default 10 seconds)
   * @throws Error if peer doesn't respond within timeout
   */
  public async ensurePeerReady(peerCid: string, timeout = 10000): Promise<void> {
    // If already confirmed ready, skip handshake
    if (this.peerReadyState.get(peerCid)) {
      console.log('[P2P] Peer already marked as ready:', peerCid);
      return;
    }

    console.log('[P2P] Initiating CheckState handshake with peer:', peerCid);

    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    // Create CheckState command
    const checkState = createCheckState();
    const conversation = this.getOrCreateConversation(peerCid);
    const command = createMessagingLayerCommand(
      checkState,
      currentCid,
      peerCid,
      conversation.lastMessageIndex
    );

    // Create promise that resolves when CheckStateResponse received
    const readyPromise = new Promise<void>((resolve, reject) => {
      this.pendingCheckStates.set(peerCid, { resolve, reject });

      // Timeout handling
      setTimeout(() => {
        if (this.pendingCheckStates.has(peerCid)) {
          this.pendingCheckStates.delete(peerCid);
          reject(new Error(`Peer ${peerCid} did not respond to CheckState within ${timeout}ms`));
        }
      }, timeout);
    });

    // Send the CheckState request
    try {
      await this.sendP2PCommand(peerCid, command);
      console.log('[P2P] Sent CheckState to peer:', peerCid);
    } catch (error) {
      // Clean up pending state on send failure
      this.pendingCheckStates.delete(peerCid);
      throw error;
    }

    // Wait for response
    await readyPromise;
    console.log('[P2P] Peer confirmed ready:', peerCid);
  }

  /**
   * Try to ensure peer is ready, but don't fail if CheckState times out.
   * Returns true if peer confirmed ready, false if timeout (proceed anyway).
   * The intersession layer manager in WASM handles reliability, so CheckState is optional.
   */
  private async tryEnsurePeerReady(peerCid: string): Promise<boolean> {
    try {
      await this.ensurePeerReady(peerCid, this.CHECKSTATE_TIMEOUT);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('did not respond to CheckState')) {
        console.log(`[P2P] CheckState timeout for ${peerCid}, proceeding with send anyway (transport layer handles reliability)`);
        return false;
      }
      throw error;  // Re-throw other errors
    }
  }

  /**
   * Clear ready state for a peer (e.g., when they disconnect)
   */
  public clearPeerReadyState(peerCid: string) {
    this.peerReadyState.delete(peerCid);
    const pending = this.pendingCheckStates.get(peerCid);
    if (pending) {
      pending.reject(new Error('Peer disconnected'));
      this.pendingCheckStates.delete(peerCid);
    }
  }

  /**
   * Check if a peer is marked as ready (has passed CheckState handshake)
   */
  public isPeerReady(peerCid: string): boolean {
    return this.peerReadyState.get(peerCid) || false;
  }

  public async markMessagesAsRead(peerCid: string, messageIds?: string[]) {
    const conversation = this.cache.conversations.get(peerCid);
    if (!conversation) return;

    // If no specific messageIds provided, mark all unread messages as read
    const messagesToMark = messageIds
      ? conversation.messages.filter(m => messageIds.includes(m.id))
      : conversation.messages.filter(m => m.senderCid === peerCid && m.status === 'delivered');

    // Send read acknowledgments for each message
    for (const message of messagesToMark) {
      if (message.status === 'delivered') {
        message.status = 'read';
        await this.sendMessageAck(message.id, 'read', peerCid);
      }
    }

    // Update unread count
    conversation.unreadCount = conversation.messages.filter(
      m => m.senderCid === peerCid && m.status === 'delivered'
    ).length;

    // Persist changes
    await this.persistConversations();

    // Emit update event
    eventEmitter.emit('conversation-updated', { peerCid, conversation });
  }

  private async sendMessageAck(messageId: string, ackType: "delivered" | "read" | "failed", peerCid: string, senderCid?: string) {
    const command = createMessageAckCommand(messageId, ackType);
    await this.sendP2PCommand(peerCid, command, senderCid);
  }

  private async sendP2PCommand(peerCid: string, command: P2PCommand, senderCid?: string) {
    const currentCid = senderCid || this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }

    const serialized = serializeP2PCommand(command);

    // Debug: Log the command type being sent
    const commandType = Object.keys(command)[0] || 'unknown';
    console.log(`[P2P] *** sendP2PCommand *** ${commandType} from ${currentCid.slice(0, 8)}... to ${peerCid.slice(0, 8)}... (${serialized.length} bytes)`);

    // Use direct P2P message routing via internal service
    // This bypasses ISM (which has WASM time issues) and routes via InternalServiceRequest::Message
    console.log(`[P2P] *** Calling websocketService.sendP2PMessage(${currentCid.slice(0, 8)}..., ${peerCid.slice(0, 8)}..., ...)`);
    await websocketService.sendP2PMessage(currentCid, peerCid, serialized);
    console.log(`[P2P] *** websocketService.sendP2PMessage completed successfully ***`);
  }

  private getOrCreateConversation(peerCid: string, peerUsername?: string): P2PConversation {
    let conversation = this.cache.conversations.get(peerCid);
    if (!conversation) {
      // Check multiple sources for connection status to determine initial presence
      // This handles the timing race where connections map may not be updated yet
      const isConnectedLocal = this.connections.get(peerCid) === true;
      const isConnectedAutoConnect = p2pAutoConnectService.isPeerConnected(peerCid);
      const isOnlineRegistration = p2pAutoConnectService.isPeerOnline(peerCid);
      const isOnline = isConnectedLocal || isConnectedAutoConnect || isOnlineRegistration;

      console.log(`[P2P] getOrCreateConversation for ${peerCid.slice(0, 8)}...: ` +
        `local=${isConnectedLocal}, autoConnect=${isConnectedAutoConnect}, registration=${isOnlineRegistration} → ${isOnline ? 'Online' : 'Offline'}`);

      conversation = {
        peerCid,
        peerUsername,
        messages: [],
        lastMessageIndex: 0,
        unreadCount: 0,
        typing: false,
        lastTypingUpdate: 0,
        presence: {
          status: isOnline ? MessagingLayerType.Online : MessagingLayerType.Offline,
          lastUpdate: isOnline ? Date.now() : 0
        }
      };
      this.cache.conversations.set(peerCid, conversation);
    } else if (peerUsername && !conversation.peerUsername) {
      // Update username if we learn it later
      conversation.peerUsername = peerUsername;
    }
    return conversation;
  }

  /**
   * Add a message to a conversation. Returns true if message was newly added,
   * false if it was a duplicate (already existed).
   */
  private async addMessageToConversation(peerCid: string, message: P2PMessage): Promise<boolean> {
    const conversation = this.getOrCreateConversation(peerCid);

    // Check for duplicate - return false if message already exists
    if (conversation.messages.find(m => m.id === message.id)) {
      console.log('[P2P] Duplicate message detected, skipping add:', message.id);
      return false;
    }

    // Add message
    conversation.messages.push(message);
    conversation.lastMessageIndex = Math.max(conversation.lastMessageIndex, message.index);

    // Sort messages by timestamp for chronological order
    conversation.messages.sort((a, b) => a.timestamp - b.timestamp);

    // Trim to max size
    if (conversation.messages.length > this.cache.maxMessagesPerConversation) {
      const overflow = conversation.messages.splice(0,
        conversation.messages.length - this.cache.maxMessagesPerConversation);

      // Move overflow to long-term storage
      await this.moveToLongTermStorage(peerCid, overflow);
    }

    // Update queue
    this.updateMessageQueue(message);

    // Persist changes
    await this.persistConversations();

    return true;  // Message was newly added
  }

  private updateMessageQueue(message: P2PMessage) {
    this.cache.messageQueue.push(message);

    if (this.cache.messageQueue.length > this.cache.maxQueueSize) {
      const overflow = this.cache.messageQueue.splice(0,
        this.cache.messageQueue.length - this.cache.maxQueueSize);

      // Move to long-term storage asynchronously
      this.moveQueueToLongTermStorage(overflow);
    }
  }

  private async moveToLongTermStorage(peerCid: string, messages: P2PMessage[]) {
    // Use LocalDB to store messages
    for (const message of messages) {
      const key = `${this.dbPrefix}_${peerCid}_${message.id}`;
      const valueStr = JSON.stringify(message);
      // Convert to byte array - backend expects Vec<u8>
      const valueBytes = Array.from(new TextEncoder().encode(valueStr));

      const request = {
        LocalDBSetKV: {
          request_id: crypto.randomUUID(),
          cid: 0, // Use 0 for local operations
          peer_cid: null,
          key,
          value: valueBytes
        }
      };

      await websocketService.sendRequest(request);
    }
  }

  private async moveQueueToLongTermStorage(messages: P2PMessage[]) {
    // Group by conversation
    const byConversation = new Map<string, P2PMessage[]>();
    messages.forEach(msg => {
      const peerCid = msg.senderCid === msg.recipientCid ? msg.recipientCid :
        (msg.senderCid === this.getCurrentCid() ? msg.recipientCid : msg.senderCid);

      if (!byConversation.has(peerCid)) {
        byConversation.set(peerCid, []);
      }
      byConversation.get(peerCid)!.push(msg);
    });

    // Store each conversation's messages
    for (const [peerCid, msgs] of byConversation) {
      await this.moveToLongTermStorage(peerCid, msgs);
    }
  }

  private async persistConversations() {
    // Save current conversations to LocalDB
    const conversations = Array.from(this.cache.conversations.entries()).map(([peerCid, conv]) => ({
      peerCid,
      peerUsername: conv.peerUsername,  // Persist username for display
      messages: conv.messages,
      lastMessageIndex: conv.lastMessageIndex,
      unreadCount: conv.unreadCount
    }));

    const valueStr = JSON.stringify(conversations);
    // Convert to byte array - backend expects Vec<u8>
    const valueBytes = Array.from(new TextEncoder().encode(valueStr));

    // Use sendLocalDBSet for proper request/response handling
    await websocketService.sendLocalDBSet('0', `${this.dbPrefix}_conversations`, valueBytes);
  }

  private async loadCachedMessages() {
    try {
      // Use sendLocalDBGet which properly handles request/response with event listener
      const response = await websocketService.sendLocalDBGet('0', `${this.dbPrefix}_conversations`);

      if (response && response.value) {
        const rawValue = response.value;

        // Handle byte array response - backend returns Vec<u8>
        let valueStr: string;
        if (Array.isArray(rawValue)) {
          valueStr = new TextDecoder().decode(new Uint8Array(rawValue));
        } else if (typeof rawValue === 'string') {
          valueStr = rawValue;
        } else {
          console.error('Unexpected value type in LocalDBGetKVSuccess:', typeof rawValue);
          return;
        }

        const conversations = JSON.parse(valueStr);
        conversations.forEach((conv: any) => {
          this.cache.conversations.set(conv.peerCid, {
            ...conv,
            typing: false,
            lastTypingUpdate: 0,
            presence: conv.presence || {
              status: MessagingLayerType.Offline,
              lastUpdate: 0
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to load cached messages:', error);
    }
  }

  // Public API methods
  public getConversation(peerCid: string): P2PConversation | undefined {
    return this.cache.conversations.get(peerCid);
  }

  public getAllConversations(): P2PConversation[] {
    return Array.from(this.cache.conversations.values());
  }

  /**
   * Remove conversations for peers that are no longer registered on the server.
   * Call this after syncing with server to clean up stale cached data from previous sessions.
   * This prevents "Peer XXXXXX" entries from cluttering the DIRECT MESSAGES sidebar.
   *
   * @param validPeerCids - Set of CIDs for peers currently registered on the server
   * @returns Number of stale conversations removed
   */
  public cleanupStaleConversations(validPeerCids: Set<string>): number {
    const staleCids: string[] = [];

    for (const [peerCid] of this.cache.conversations.entries()) {
      if (!validPeerCids.has(peerCid)) {
        staleCids.push(peerCid);
      }
    }

    for (const cid of staleCids) {
      console.log(`[P2P] Removing stale conversation for peer: ${cid.slice(0, 8)}...`);
      this.cache.conversations.delete(cid);
    }

    if (staleCids.length > 0) {
      console.log(`[P2P] Cleaned up ${staleCids.length} stale conversation(s)`);
      this.persistConversations();
      eventEmitter.emit('p2p:conversations-cleaned');
    }

    return staleCids.length;
  }

  public getRecentMessages(limit: number = 50): P2PMessage[] {
    return this.cache.messageQueue.slice(-limit);
  }

  public isConnected(peerCid: string): boolean {
    return this.connections.get(peerCid) || false;
  }

  public markAsRead(peerCid: string) {
    const conversation = this.cache.conversations.get(peerCid);
    if (conversation) {
      conversation.unreadCount = 0;

      // Send read receipts for unread messages
      conversation.messages
        .filter(m => m.status === 'delivered' && m.senderCid === peerCid)
        .forEach(m => this.sendMessageAck(m.id, 'read', peerCid));
    }
  }

  // Event listeners
  public onMessage(listener: (message: P2PMessage) => void) {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  public onMessageStatusChange(listener: (messageId: string, status: P2PMessage['status']) => void) {
    this.messageStatusListeners.push(listener);
    return () => {
      this.messageStatusListeners = this.messageStatusListeners.filter(l => l !== listener);
    };
  }

  public onTyping(listener: (peerCid: string, isTyping: boolean) => void) {
    this.typingListeners.push(listener);
    return () => {
      this.typingListeners = this.typingListeners.filter(l => l !== listener);
    };
  }

  public onConnectionChange(listener: (peerCid: string, connected: boolean) => void) {
    this.connectionListeners.push(listener);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }

  public onPresenceChange(listener: (peerCid: string, presence: PeerPresence) => void) {
    this.presenceListeners.push(listener);
    return () => {
      this.presenceListeners = this.presenceListeners.filter(l => l !== listener);
    };
  }

  // Auto-registration support
  public async autoRegisterPeer(peerCid: string): Promise<void> {
    const currentCid = this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected to server');
    }
    await this.autoRegisterPeerWithCid(peerCid, currentCid);
  }

  /**
   * Auto-register with a peer using a specific CID.
   * This is used when we receive a message and need to register back,
   * ensuring we use the correct CID (from the notification) in multi-tab scenarios.
   */
  public async autoRegisterPeerWithCid(peerCid: string, ownCid: string | null | undefined): Promise<void> {
    if (!ownCid) {
      throw new Error('No CID provided for registration');
    }

    console.log(`[P2P] Auto-registering with peer ${peerCid} using CID ${ownCid}`);

    const request = {
      PeerRegister: {
        request_id: crypto.randomUUID(),
        cid: ownCid, // Use the provided CID (from notification recipient)
        peer_cid: peerCid, // The peer we're registering with
        session_security_settings: {
          security_level: 'Standard',
          secrecy_mode: 'BestEffort',
          crypto_params: {
            encryption_algorithm: 'AES_GCM_256',
            kem_algorithm: 'Kyber',
            sig_algorithm: 'None'
          },
          header_obfuscator_settings: 'Disabled'
        },
        connect_after_register: false, // Frontend handles connection via p2pAutoConnectService.poll()
        peer_session_password: null
      }
    };

    await websocketService.sendMessage(request);

    // Add the peer to local registration state immediately
    // This allows the UI to update before the server response
    const peer = {
      cid: peerCid,
      username: `User ${peerCid.slice(0, 8)}`,
      fullName: `User ${peerCid.slice(0, 8)}`,
      isOnline: true,
      isRegistered: true
    };

    // Emit event so UI updates immediately
    eventEmitter.emit('p2p:peer-registered', { peer });

    console.log(`[P2P] Auto-registration request sent for peer ${peerCid}`);
  }

  /**
   * Check if notification should be shown for incoming message
   */
  private shouldShowNotification(peerCid: string): boolean {
    // Don't notify if chat is currently open with this peer
    if (this.activeConversationPeerCid === peerCid) {
      return false;
    }
    return true;
  }

  /**
   * Set active conversation peer (call when user opens chat)
   */
  public setActiveConversation(peerCid: string | null): void {
    this.activeConversationPeerCid = peerCid;
  }
}
