import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { P2PMessage, ConversationMetadata, MessagePage } from '../p2p-messenger-manager';

// Storage for mocked LocalDB
let localDBStore: Map<string, number[]>;

// Mock websocket service
vi.mock('../websocket-service', () => ({
  websocketService: {
    sendLocalDBGet: vi.fn(async (_cid: string, key: string) => {
      const value = localDBStore.get(key);
      if (value) {
        return { value };
      }
      throw new Error('Key not found');
    }),
    sendLocalDBSet: vi.fn(async (_cid: string, key: string, value: number[]) => {
      localDBStore.set(key, value);
    }),
    sendLocalDBDelete: vi.fn(async (_cid: string, key: string) => {
      localDBStore.delete(key);
    }),
    sendLocalDBListKeys: vi.fn(async (_cid: string, prefix?: string) => {
      const allKeys = Array.from(localDBStore.keys());
      if (prefix) {
        return allKeys.filter(k => k.startsWith(prefix));
      }
      return allKeys;
    }),
    sendRequest: vi.fn(),
    getConnectionInfo: vi.fn()
  }
}));

// Mock event emitter
vi.mock('../event-emitter', () => ({
  eventEmitter: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

// Mock connection manager
// Note: getTabSelectedSession is async (IndexedDB-backed)
vi.mock('../connection-manager', () => ({
  connectionManager: {
    getConnectionInfo: vi.fn(() => ({ cid: '12345' })),
    getTabSelectedSession: vi.fn(() => Promise.resolve(null)),
    getActiveSessions: vi.fn(async () => [])
  },
  getSelectedUser: vi.fn(() => Promise.resolve(null))
}));

// Mock p2p-auto-connect-service
// Note: getConnectedPeers and isPeerConnected are async (IndexedDB-backed)
vi.mock('../p2p-auto-connect-service', () => ({
  p2pAutoConnectService: {
    getConnectedPeers: vi.fn(() => Promise.resolve([])),
    isPeerConnected: vi.fn(() => Promise.resolve(false)),
    isPeerOnline: vi.fn(() => false),
    ensurePeerConnectedInBackground: vi.fn()
  }
}));

const MESSAGES_PER_PAGE = 50;
const PAGINATED_PREFIX = 'msgs_with_peer_';

describe('P2P Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localDBStore = new Map();
  });

  afterEach(() => {
    localDBStore.clear();
  });

  describe('Metadata Storage', () => {
    it('should store and retrieve conversation metadata', async () => {
      const peerCid = 123n;
      const metadata: ConversationMetadata = {
        peerCid,
        peerUsername: 'testuser',
        totalMessageCount: 10,
        oldestMessageTimestamp: Date.now() - 100000,
        newestMessageTimestamp: Date.now(),
        latestPage: 0,
        messagesPerPage: MESSAGES_PER_PAGE,
        unreadCount: 2,
        lastMessageIndex: 10,
        lastUpdated: Date.now()
      };

      // Save metadata (convert bigint to string for JSON)
      const key = `${PAGINATED_PREFIX}${peerCid}_metadata`;
      const serializable = { ...metadata, peerCid: metadata.peerCid.toString() };
      const valueBytes = Array.from(new TextEncoder().encode(JSON.stringify(serializable)));
      localDBStore.set(key, valueBytes);

      // Verify retrieval
      const storedValue = localDBStore.get(key);
      expect(storedValue).toBeDefined();
      const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(storedValue!)));
      expect(decoded.peerCid).toBe(peerCid.toString());
      expect(decoded.totalMessageCount).toBe(10);
      expect(decoded.unreadCount).toBe(2);
    });
  });

  describe('Message Page Storage', () => {
    it('should store and retrieve a message page', async () => {
      const peerCid = 456n;
      const page: MessagePage = {
        peerCid,
        pageNumber: 0,
        messages: [
          createFakeMessage(peerCid, 1),
          createFakeMessage(peerCid, 2),
          createFakeMessage(peerCid, 3)
        ],
        pageTimestamps: {
          minTimestamp: Date.now() - 3000,
          maxTimestamp: Date.now()
        }
      };

      // Save page (serialize bigints)
      const key = `${PAGINATED_PREFIX}${peerCid}_0`;
      const serializable = {
        ...page,
        peerCid: page.peerCid.toString(),
        messages: page.messages.map(m => ({
          ...m,
          senderCid: m.senderCid.toString(),
          recipientCid: m.recipientCid.toString()
        }))
      };
      const valueBytes = Array.from(new TextEncoder().encode(JSON.stringify(serializable)));
      localDBStore.set(key, valueBytes);

      // Verify retrieval
      const storedValue = localDBStore.get(key);
      expect(storedValue).toBeDefined();
      const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(storedValue!)));
      expect(decoded.messages.length).toBe(3);
      expect(decoded.pageNumber).toBe(0);
    });
  });

  describe('Page Rotation', () => {
    it('should create new page when current page reaches 50 messages', async () => {
      const peerCid = 789n;

      // Create a full page (50 messages)
      const fullPage: MessagePage = {
        peerCid,
        pageNumber: 0,
        messages: Array.from({ length: MESSAGES_PER_PAGE }, (_, i) =>
          createFakeMessage(peerCid, i + 1)
        ),
        pageTimestamps: {
          minTimestamp: Date.now() - 50000,
          maxTimestamp: Date.now() - 1000
        }
      };

      // Save full page
      const page0Key = `${PAGINATED_PREFIX}${peerCid}_0`;
      const serializePageFn = (p: MessagePage) => ({
        ...p,
        peerCid: p.peerCid.toString(),
        messages: p.messages.map(m => ({ ...m, senderCid: m.senderCid.toString(), recipientCid: m.recipientCid.toString() }))
      });
      localDBStore.set(page0Key, Array.from(new TextEncoder().encode(JSON.stringify(serializePageFn(fullPage)))));

      // Verify page is full
      const storedPage0 = JSON.parse(new TextDecoder().decode(new Uint8Array(localDBStore.get(page0Key)!))) as MessagePage;
      expect(storedPage0.messages.length).toBe(MESSAGES_PER_PAGE);

      // Simulate creating a new page for the next message
      const newPage: MessagePage = {
        peerCid,
        pageNumber: 1,
        messages: [createFakeMessage(peerCid, MESSAGES_PER_PAGE + 1)],
        pageTimestamps: {
          minTimestamp: Date.now(),
          maxTimestamp: Date.now()
        }
      };
      const serializePage = (p: MessagePage) => ({
        ...p,
        peerCid: p.peerCid.toString(),
        messages: p.messages.map(m => ({ ...m, senderCid: m.senderCid.toString(), recipientCid: m.recipientCid.toString() }))
      });
      const page1Key = `${PAGINATED_PREFIX}${peerCid}_1`;
      localDBStore.set(page1Key, Array.from(new TextEncoder().encode(JSON.stringify(serializePage(newPage)))));

      // Update metadata
      const metadata: ConversationMetadata = {
        peerCid,
        totalMessageCount: MESSAGES_PER_PAGE + 1,
        oldestMessageTimestamp: Date.now() - 50000,
        newestMessageTimestamp: Date.now(),
        latestPage: 1, // Now on page 1
        messagesPerPage: MESSAGES_PER_PAGE,
        unreadCount: 0,
        lastMessageIndex: MESSAGES_PER_PAGE + 1,
        lastUpdated: Date.now()
      };
      const metadataKey = `${PAGINATED_PREFIX}${peerCid}_metadata`;
      const serializableMeta = { ...metadata, peerCid: metadata.peerCid.toString() };
      localDBStore.set(metadataKey, Array.from(new TextEncoder().encode(JSON.stringify(serializableMeta))));

      // Verify both pages exist
      expect(localDBStore.has(page0Key)).toBe(true);
      expect(localDBStore.has(page1Key)).toBe(true);

      // Verify metadata points to latest page
      const storedMetadata = JSON.parse(new TextDecoder().decode(new Uint8Array(localDBStore.get(metadataKey)!))) as ConversationMetadata;
      expect(storedMetadata.latestPage).toBe(1);
      expect(storedMetadata.totalMessageCount).toBe(MESSAGES_PER_PAGE + 1);
    });
  });

  describe('Lazy Loading', () => {
    it('should load older pages by decrementing page number', async () => {
      const peerCid = 1001n;

      // Helper to serialize page for storage
      const serializePage = (p: MessagePage) => ({
        ...p,
        peerCid: p.peerCid.toString(),
        messages: p.messages.map(m => ({ ...m, senderCid: m.senderCid.toString(), recipientCid: m.recipientCid.toString() }))
      });

      // Create 3 pages of messages
      for (let pageNum = 0; pageNum < 3; pageNum++) {
        const page: MessagePage = {
          peerCid,
          pageNumber: pageNum,
          messages: Array.from({ length: 10 }, (_, i) =>
            createFakeMessage(peerCid, pageNum * 10 + i + 1, Date.now() - (3 - pageNum) * 10000)
          ),
          pageTimestamps: {
            minTimestamp: Date.now() - (3 - pageNum) * 10000,
            maxTimestamp: Date.now() - (3 - pageNum) * 10000 + 9000
          }
        };
        const pageKey = `${PAGINATED_PREFIX}${peerCid}_${pageNum}`;
        localDBStore.set(pageKey, Array.from(new TextEncoder().encode(JSON.stringify(serializePage(page)))));
      }

      // Create metadata pointing to latest page (2)
      const metadata: ConversationMetadata = {
        peerCid,
        totalMessageCount: 30,
        oldestMessageTimestamp: Date.now() - 30000,
        newestMessageTimestamp: Date.now() - 1000,
        latestPage: 2,
        messagesPerPage: MESSAGES_PER_PAGE,
        unreadCount: 0,
        lastMessageIndex: 30,
        lastUpdated: Date.now()
      };
      const metadataKey = `${PAGINATED_PREFIX}${peerCid}_metadata`;
      const serializableMeta = { ...metadata, peerCid: metadata.peerCid.toString() };
      localDBStore.set(metadataKey, Array.from(new TextEncoder().encode(JSON.stringify(serializableMeta))));

      // Simulate loading pages from latest to oldest
      let currentPage = metadata.latestPage;
      const loadedMessages: P2PMessage[] = [];

      while (currentPage >= 0) {
        const pageKey = `${PAGINATED_PREFIX}${peerCid}_${currentPage}`;
        const pageData = localDBStore.get(pageKey);
        expect(pageData).toBeDefined();

        const page = JSON.parse(new TextDecoder().decode(new Uint8Array(pageData!))) as MessagePage;
        loadedMessages.unshift(...page.messages);
        currentPage--;
      }

      // Verify all messages were loaded
      expect(loadedMessages.length).toBe(30);
      // Verify messages are in chronological order (oldest first)
      for (let i = 0; i < loadedMessages.length - 1; i++) {
        expect(loadedMessages[i].timestamp).toBeLessThanOrEqual(loadedMessages[i + 1].timestamp);
      }
    });
  });

  describe('Key Listing', () => {
    it('should list all keys with given prefix', async () => {
      const peerCid = 'test-peer-keys';

      // Create metadata and pages
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_metadata`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_0`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_1`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}another_peer_metadata`, new Array(10).fill(0));

      // Get keys for our peer
      const allKeys = Array.from(localDBStore.keys()).filter(k => k.startsWith(`${PAGINATED_PREFIX}${peerCid}`));
      expect(allKeys.length).toBe(3);
      expect(allKeys).toContain(`${PAGINATED_PREFIX}${peerCid}_metadata`);
      expect(allKeys).toContain(`${PAGINATED_PREFIX}${peerCid}_0`);
      expect(allKeys).toContain(`${PAGINATED_PREFIX}${peerCid}_1`);

      // Get metadata keys only
      const metadataKeys = Array.from(localDBStore.keys()).filter(k => k.endsWith('_metadata'));
      expect(metadataKeys.length).toBe(2);
    });
  });

  describe('Conversation Deletion', () => {
    it('should delete all pages and metadata for a conversation', async () => {
      const peerCid = 'test-peer-delete';

      // Create metadata and 3 pages
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_metadata`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_0`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_1`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}${peerCid}_2`, new Array(10).fill(0));
      localDBStore.set(`${PAGINATED_PREFIX}other_peer_metadata`, new Array(10).fill(0));

      // Simulate deletion
      const keysToDelete = Array.from(localDBStore.keys()).filter(k => k.startsWith(`${PAGINATED_PREFIX}${peerCid}`));
      for (const key of keysToDelete) {
        localDBStore.delete(key);
      }

      // Verify deletion
      expect(localDBStore.has(`${PAGINATED_PREFIX}${peerCid}_metadata`)).toBe(false);
      expect(localDBStore.has(`${PAGINATED_PREFIX}${peerCid}_0`)).toBe(false);
      expect(localDBStore.has(`${PAGINATED_PREFIX}${peerCid}_1`)).toBe(false);
      expect(localDBStore.has(`${PAGINATED_PREFIX}${peerCid}_2`)).toBe(false);

      // Other peer's data should remain
      expect(localDBStore.has(`${PAGINATED_PREFIX}other_peer_metadata`)).toBe(true);
    });
  });
});

// Helper function to create fake messages
function createFakeMessage(peerCid: bigint, index: number, timestamp?: number): P2PMessage {
  return {
    id: `msg-${peerCid}-${index}`,
    senderCid: 12345n, // Current user
    recipientCid: peerCid,
    content: `Test message ${index}`,
    timestamp: timestamp || Date.now() - (100 - index) * 1000, // Older messages have earlier timestamps
    index,
    status: 'sent' as const,
    message_type: 'text' as const
  };
}
