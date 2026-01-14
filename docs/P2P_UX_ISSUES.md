# P2P UX Issues Documentation

This document catalogs user experience issues discovered during P2P messaging testing on Nov 29, 2024, along with proposed fixes.

---

## Table of Contents

1. [Duplicate Messages on Sender Side](#issue-1-duplicate-messages-on-sender-side) (Critical)
2. [Confusing Peer Status Display](#issue-2-confusing-peer-status-display) (Medium)
3. [Redundant "Register peer" Button](#issue-3-redundant-register-peer-button) (Low)
4. [MessageSendFailure Alongside Successful Delivery](#issue-4-messagessendfailure-alongside-successful-delivery) (Medium)
5. [Manage Accounts Shows Empty](#issue-5-manage-accounts-shows-empty) (Low)
6. [Direct Navigation Fails to Claim Session](#issue-6-direct-navigation-fails-to-claim-session) (Critical)
7. [ListRegisteredPeers Request Timeout](#issue-7-listregisteredpeers-request-timeout) (Medium)
8. [Auto-Accept Setting Key Not Found](#issue-8-auto-accept-setting-key-not-found) (Low)

---

## Issue 1: Duplicate Messages on Sender Side

**Severity**: Critical (Functional Bug)

**Symptom**: When a user sends a P2P message, it appears twice in their chat UI.

**Console Error**: `Warning: Encountered two children with the same key`

### Root Cause

- `sendMessage()` adds message optimistically and notifies listeners
- BroadcastChannel echoes message back to leader tab
- `handleIncomingMessage()` processes the echo and notifies listeners again
- Result: Two listener notifications for the same message

### Location

`citadel-workspaces/src/lib/p2p-messenger-manager.ts`

### Proposed Fix

1. Modify `addMessageToConversation()` to return `boolean` (true if newly added)
2. In `handleIncomingMessage()`, only notify listeners if `wasAdded === true`
3. Keep optimistic update in `sendMessage()` unchanged

### Code Changes

```typescript
// p2p-messenger-manager.ts - addMessageToConversation
private async addMessageToConversation(peerCid: string, message: P2PMessage): Promise<boolean> {
  const conversation = this.getOrCreateConversation(peerCid);
  if (!conversation.messages.find(m => m.id === message.id)) {
    conversation.messages.push(message);
    // ... existing logic ...
    return true;  // Newly added
  }
  return false;  // Duplicate
}

// p2p-messenger-manager.ts - handleIncomingMessage
const wasAdded = await this.addMessageToConversation(peerCid, message);
if (wasAdded) {
  this.messageListeners.forEach(listener => listener(message));
}
```

---

## Issue 2: Confusing Peer Status Display

**Severity**: Medium (UX Confusion)

**Symptom**: Chat header shows "Offline (P2P connected)" - contradictory status.

### User Impact

Users see "Offline" despite having an active P2P connection, causing confusion about whether messaging will work.

### Location

`citadel-workspaces/src/components/p2p/P2PChat.tsx` or `P2PChatPanel.tsx`

### Proposed Fix

Priority-based status display:
1. If P2P connected → Show "Online" (green indicator)
2. Else if registered but not connected → Show "Registered" (blue indicator)
3. Else → Show "Offline" (gray indicator)

### Code Changes

```typescript
// Determine status based on actual connection state
const getStatusDisplay = (peer: PeerInfo) => {
  if (peer.isP2PConnected) {
    return { text: "Online", color: "text-green-400", indicator: "bg-green-500" };
  }
  if (peer.isRegistered) {
    return { text: "Registered", color: "text-blue-400", indicator: "bg-blue-500" };
  }
  return { text: "Offline", color: "text-gray-400", indicator: "bg-gray-500" };
};
```

---

## Issue 3: Redundant "Register peer" Button

**Severity**: Low (UI Polish)

**Symptom**: "Register peer" button remains visible in chat header even after peer is already registered and P2P connected.

### User Impact

Confusing - suggests action is needed when connection is already established.

### Location

`citadel-workspaces/src/components/p2p/P2PChat.tsx` or `P2PChatPanel.tsx`

### Proposed Fix

Conditionally render based on registration/connection status:
- If P2P connected: Hide button entirely OR show "Connected" badge
- If registered but not connected: Show "Connect" button
- If not registered: Show "Register peer" button

### Code Changes

```typescript
// In chat header component
{!peer.isRegistered && (
  <Button onClick={handleRegister}>
    <UserPlus className="h-4 w-4 mr-1" />
    Register peer
  </Button>
)}
{peer.isRegistered && !peer.isP2PConnected && (
  <Button onClick={handleConnect}>
    <Link className="h-4 w-4 mr-1" />
    Connect
  </Button>
)}
{peer.isP2PConnected && (
  <Badge className="bg-green-500/20 text-green-400">
    <Check className="h-3 w-3 mr-1" />
    Connected
  </Badge>
)}
```

---

## Issue 4: MessageSendFailure Alongside Successful Delivery

**Severity**: Medium (Needs Investigation)

**Symptom**: Console shows `MessageSendFailure` error but message still gets delivered and appears in recipient's chat.

### User Impact

Potentially confusing if error is surfaced to UI; may cause retry logic issues.

### Location

- `citadel-workspaces/src/lib/p2p-messenger-manager.ts`
- Possibly backend: `citadel-internal-service`

### Investigation Needed

1. Identify what triggers `MessageSendFailure`
2. Determine if this is a race condition (failure for old request, success for retry)
3. Check if ACK handling is conflicting with message routing

### Proposed Fix

Defer until root cause identified. Likely scenarios:
- Backend sends failure before message is actually delivered (timing issue)
- Multiple send attempts creating duplicate failure responses
- Request ID mismatch between request and response

---

## Issue 5: Manage Accounts Shows Empty

**Severity**: Low (UX Polish)

**Symptom**: "Manage Accounts" modal shows "No saved accounts found" even though OrphanSessionsNavbar shows active sessions.

### User Impact

Confusion about where accounts are stored and how to manage them.

### Location

- `citadel-workspaces/src/components/ManageAccountsModal.tsx`
- `citadel-workspaces/src/lib/connection-manager.ts`

### Root Cause

- OrphanSessionsNavbar uses `getActiveSessions()` from internal service (in-memory backend state)
- ManageAccountsModal uses `getStoredSessions()` from localStorage
- During testing, sessions are created in memory but not persisted to localStorage

### Proposed Fix

1. Ensure sessions are saved to localStorage on successful login
2. OR modify ManageAccountsModal to merge active sessions with stored sessions
3. Add "Active Sessions" section to modal showing in-memory sessions

### Code Changes

```typescript
// ManageAccountsModal.tsx
const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
const [storedSessions, setStoredSessions] = useState<StoredSession[]>([]);

useEffect(() => {
  const load = async () => {
    const active = await connectionManager.getActiveSessions();
    const stored = connectionManager.getStoredSessions();
    setActiveSessions(active);
    setStoredSessions(stored.sessions);
  };
  load();
}, []);

// In render - show both sections
{activeSessions.length > 0 && (
  <Section title="Active Sessions">
    {activeSessions.map(session => <SessionCard key={session.cid} session={session} />)}
  </Section>
)}
{storedSessions.length > 0 && (
  <Section title="Saved Accounts">
    {storedSessions.map(session => <AccountCard key={session.username} session={session} />)}
  </Section>
)}
```

---

## Issue 6: Direct Navigation Fails to Claim Session

**Severity**: Critical (Functional Bug)

**Symptom**: When navigating directly to a protected route (e.g., `/office`), the workspace stays stuck on "Loading workspace..." even though active sessions exist.

### Root Cause

`WorkspaceLoader` only waits for workspace state to load, but doesn't:
1. Check for available active sessions
2. Auto-claim or select a session when one exists
3. Set up the connection context needed for workspace loading

The session claiming logic only exists in `OrphanSessionsNavbar.handleNavigate()`, which:
- Calls `websocketService.claimSession()`
- Sets tab context with `setSelectedUser()`
- Sets connection ID with `WorkspaceService.setConnectionId()`
- Starts WASM connection manager
- Triggers workspace loading

When navigating directly to a URL, this flow is bypassed entirely.

### User Impact

- Users must manually click on OrphanSessionsNavbar to load their workspace
- Direct URL navigation (bookmarks, page refresh) fails silently
- Console shows `cid: 0` errors indicating no session is claimed

### Location

`citadel-workspaces/src/components/ui/workspace-loader.tsx`

### Proposed Fix

Modify `WorkspaceLoader` to auto-claim an available session:
1. On mount, check for active sessions via `ConnectionManager.getActiveSessions()`
2. If active sessions exist but no connection, auto-select and claim the first one
3. Perform the same setup as `OrphanSessionsNavbar.handleNavigate()`
4. Only then wait for workspace loading

### Code Changes

```typescript
// workspace-loader.tsx - Add session auto-claim logic
useEffect(() => {
  const autoClaimSession = async () => {
    const connectionService = ConnectionService.getInstance();
    const currentConnection = connectionService.getConnectionStatus();

    // If already connected, no action needed
    if (currentConnection?.isConnected) {
      setHasConnection(true);
      return;
    }

    // Check for active sessions
    const connectionManager = ConnectionManager.getInstance();
    await connectionManager.waitForReady();
    const activeSessions = await connectionManager.getActiveSessions();

    if (activeSessions.length > 0) {
      const session = activeSessions[0];

      // Claim the session (same logic as OrphanSessionsNavbar)
      try {
        await websocketService.claimSession(session.cid, true);
      } catch (error: any) {
        if (!error?.message?.includes('not orphaned')) {
          throw error;
        }
      }

      // Set up context
      setSelectedUser({
        selectedUsername: session.username,
        selectedServerAddress: session.server_address,
        selectedCid: session.cid
      });

      WorkspaceService.setConnectionId(session.cid);
      await wasmConnectionManager.start(session.cid);

      // Trigger workspace loading
      WorkspaceService.loadWorkspace();
      WorkspaceService.listOffices();

      setHasConnection(true);
    }
  };

  autoClaimSession();
}, []);
```

---

## Implementation Priority

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Duplicate Messages | Low | High (Functional bug) |
| 2 | Direct Navigation Session Claim | Medium | Critical (UX blocker) |
| 3 | Peer Status Display | Low | Medium (UX clarity) |
| 4 | Register Button | Low | Low (UI polish) |
| 5 | MessageSendFailure | Medium | Medium (Needs investigation) |
| 6 | Manage Accounts | Medium | Low (Edge case) |

---

## Critical Files to Modify

| File | Issues Addressed |
|------|------------------|
| `src/lib/p2p-messenger-manager.ts` | #1 (Duplicate Messages) |
| `src/components/p2p/P2PChat.tsx` | #2 (Status), #3 (Register Button) |
| `src/components/p2p/P2PChatPanel.tsx` | #2 (Status), #3 (Register Button) |
| `src/components/AccountManagementDialog.tsx` | #5 (Manage Accounts) |
| `src/components/ui/workspace-loader.tsx` | #6 (Direct Navigation) |

---

## Testing Checklist After Fixes

- [ ] Send message from user1 to user2 - appears once in sender's chat
- [ ] Receive message - appears once in recipient's chat
- [ ] No React key warnings in console
- [ ] Peer status shows "Online" when P2P connected
- [ ] "Register peer" button hidden when already connected
- [ ] Manage Accounts shows active sessions
- [ ] **Direct navigation to /office works when sessions exist**
- [ ] **Page refresh maintains connection to correct session**

---

---

## Issue 7: ListRegisteredPeers Request Timeout

**Severity**: Medium (Reliability Issue)

**Symptom**: Console shows `Error: ListRegisteredPeers request timed out` intermittently during P2P operations.

### Observed Behavior

During testing on Dec 10, 2024, multiple timeout errors were observed:
```
Error: ListRegisteredPeers request timed out
```

The timeouts occurred during:
- Initial peer discovery after P2P registration
- Background polling for peer list updates
- Concurrent P2P operations

### User Impact

- Peer list may not update promptly after registration
- DIRECT MESSAGES sidebar may show stale data
- Users may not see newly registered peers immediately

### Location

- `citadel-workspaces/src/lib/p2p-registration-service.ts` (request sending)
- `citadel-internal-service` (backend handling)

### Investigation Needed

1. Check if timeout value (currently ~5s) is sufficient for backend processing
2. Investigate if concurrent requests are blocking each other
3. Verify backend doesn't have bottlenecks in peer list retrieval
4. Check if request queuing is causing delays

### Proposed Fix

1. Increase timeout for ListRegisteredPeers (10s instead of 5s)
2. Add retry logic with exponential backoff
3. Cache peer list locally and update incrementally
4. Consider WebSocket push notifications for peer list changes instead of polling

### Code Changes

```typescript
// p2p-registration-service.ts
private async listRegisteredPeers(): Promise<RegisteredPeer[]> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const timeout = 10000 * (i + 1); // 10s, 20s, 30s
      return await this.sendRequest('ListRegisteredPeers', {}, timeout);
    } catch (error) {
      lastError = error as Error;
      if (!error.message?.includes('timed out')) {
        throw error; // Non-timeout errors should propagate immediately
      }
      console.warn(`[P2P] ListRegisteredPeers attempt ${i + 1} timed out, retrying...`);
    }
  }

  throw lastError;
}
```

---

## Issue 8: Auto-Accept Setting Key Not Found

**Severity**: Low (First-Time Setup)

**Symptom**: Console warning: `[P2P] Failed to get auto-accept setting: Error: Key not found`

### Observed Behavior

On first P2P registration attempt, the auto-accept setting lookup fails because the key hasn't been set yet.

### User Impact

Minimal - the system defaults to a sensible behavior. However, the console warning may cause confusion during debugging.

### Location

- `citadel-workspaces/src/lib/p2p-auto-connect-service.ts` (or similar)
- LocalDB settings retrieval

### Root Cause

The LocalDB `get()` method throws an error when a key doesn't exist, rather than returning `undefined` or a default value.

### Proposed Fix

1. Initialize default settings on app startup
2. OR modify the getter to catch the error and return a default value

### Code Changes

```typescript
// p2p-auto-connect-service.ts
async getAutoAcceptSetting(): Promise<boolean> {
  try {
    const setting = await this.localDb.get('p2p:auto_accept');
    return setting === 'true';
  } catch (error) {
    // Default to false if setting doesn't exist
    if (error.message?.includes('Key not found')) {
      console.debug('[P2P] Auto-accept setting not found, defaulting to false');
      return false;
    }
    throw error;
  }
}
```

---

## Dec 10, 2024 Testing Session Results

### Test Configuration
- **Test Users**: p2ptest1 (CID: 7040934265064422768), p2ptest2 (CID: 11792220362710786214)
- **Setup**: Tab 0 = p2ptest1, Tab 1 = p2ptest2
- **Browser**: Single browser, multi-tab via Playwright MCP

### Verified Working ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Message Positioning | ✅ PASS | Sender messages on RIGHT (purple), Receiver on LEFT (gray) |
| Peer Online Status | ✅ PASS | Green indicator with "Online" text for connected peers |
| Bidirectional Messaging | ✅ PASS | Messages flow correctly in both directions |
| Self-Echo Filter | ✅ PASS | Console shows `[P2P] Ignoring self-echo message` |
| Message Acknowledgments | ✅ PASS | Both "delivered" and "read" ACKs working |
| DIRECT MESSAGES Sidebar | ✅ PASS | Populates automatically after P2P registration |
| P2P Registration Flow | ✅ PASS | Invitation sent and accepted successfully |
| Auto-Connect After Registration | ✅ PASS | P2P connection established automatically |

### Issues Observed ⚠️

| Issue | Severity | Occurrences | Notes |
|-------|----------|-------------|-------|
| ListRegisteredPeers Timeout | Medium | Multiple | See Issue #7 |
| MessageSendFailure (false positive) | Medium | 1-2 | See Issue #4 |
| Auto-Accept Key Not Found | Low | 1 | See Issue #8 |

### Screenshots Captured

1. `p2p-sender-view-tab0.png` - Sender's message on RIGHT (purple bubble)
2. `p2p-receiver-view-tab1.png` - Received message on LEFT (gray bubble)
3. `p2p-bidirectional-tab0.png` - Both messages visible in Tab 0
4. `p2p-bidirectional-tab1.png` - Both messages visible in Tab 1

---

## Updated Implementation Priority

| Priority | Issue | Effort | Impact | Status |
|----------|-------|--------|--------|--------|
| 1 | Duplicate Messages (#1) | Low | High | Pending |
| 2 | Direct Navigation Session Claim (#6) | Medium | Critical | Pending |
| 3 | ListRegisteredPeers Timeout (#7) | Low | Medium | **NEW** |
| 4 | Peer Status Display (#2) | Low | Medium | Pending |
| 5 | Register Button (#3) | Low | Low | Pending |
| 6 | MessageSendFailure (#4) | Medium | Medium | Pending |
| 7 | Auto-Accept Key Not Found (#8) | Low | Low | **NEW** |
| 8 | Manage Accounts (#5) | Medium | Low | Pending |

---

## Test Environment

- **Date**: Nov 29, 2024 (initial), Dec 10, 2024 (updated)
- **Setup**: One-tab-per-user (Tab 0 = user1, Tab 1 = user2)
- **Architecture**: Single browser, multiple tabs sharing WebSocket connection
- **Test Flow**: Account creation → Peer discovery → Peer registration → Bidirectional messaging
