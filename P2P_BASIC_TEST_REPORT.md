# P2P Basic Test Report

**Date:** 2026-01-01
**Timestamp:** 1767299778
**Test Duration:** ~5 minutes

## Accounts Created

| User | Username | Full Name | CID | Role |
|------|----------|-----------|-----|------|
| User 1 | p2ptest1_1767299778 | P2P Test User One | 14782882929968937300 | Admin |
| User 2 | p2ptest2_1767299778 | P2P Test User Two | 16909526114541488659 | Member |

## Test Configuration

- **UI URL:** http://localhost:5173/
- **Server Location:** 127.0.0.1:12349
- **Workspace Password:** SUPER_SECRET_ADMIN_PASSWORD_CHANGE_ME
- **User Password:** test12345

## Test Results

| Step | Test | Status | Notes |
|------|------|--------|-------|
| 1 | Account Creation (User 1) | PASS | Workspace initialized successfully as admin |
| 2 | Account Creation (User 2) | PASS | Joined existing workspace (no init modal - correct) |
| 3 | P2P Peer Discovery | PASS | User 2 appeared in peer list |
| 4 | P2P Registration | PASS | Connection request sent and accepted |
| 5 | Deterministic Initiator Selection | PASS | Higher CID correctly identified as initiator |
| 6 | Message User1 -> User2 | PASS | "Hello from user1!" delivered in 58ms |
| 7 | Message User2 -> User1 | PASS | "Hello back from user2!" delivered in 45ms |
| 8 | Paginated Message Persistence | PASS | Messages persisted via LocalDB with proper metadata |
| 9 | UI Freezes/Retry Loops | PASS | None observed |

## Overall Result: PASS

All core P2P messaging functionality is working correctly, including the new paginated message persistence implementation.

## Message Persistence Verification

Console logs confirm paginated message storage is working:
```
[P2PChat] Found paginated metadata: {totalMessages: 1, latestPage: 0, peerUsername: undefined}
[P2PChat] Adding new message, total will be: 2
[P2P] handleMessageAck conversation 14782882: 2 messages, IDs: [1387ad4e, bcfc2845]
```

Backend logs confirm LocalDB operations:
```
LocalDBGetKVSuccess { cid: 16909526114541488659, key: "inbound_messages-16909526114541488659" }
LocalDBSetKVSuccess - Messages successfully persisted
```

## Message Delivery Timeline

| Time | Direction | Message | Delivery Time |
|------|-----------|---------|---------------|
| 03:45 PM | User1 -> User2 | "Hello from user1!" | 58ms |
| 03:46 PM | User2 -> User1 | "Hello back from user2!" | 45ms |

Both messages were successfully delivered with full acknowledgment chain:
- `sent` -> `delivered` -> `read`

## Screenshots Captured

| Screenshot | Description |
|------------|-------------|
| 01-user1-workspace.png | User 1 workspace after admin initialization |
| 02-user2-workspace.png | User 2 workspace after joining |
| 03-user1-sends-invite.png | User 1 sending P2P registration invite |
| 04-user2-accepts.png | User 2 accepting P2P registration |
| 05-message-sent-user1.png | User 1 sent first message |
| 06-message-received-user2.png | User 2 received the message |
| 07-message-sent-user2.png | User 2 sent reply message |
| 08-bidirectional-complete.png | Both messages visible in User 1's chat |

## P2P Registration Flow

1. User 1 opened Peer Discovery modal from OFFICE MEMBERS section
2. User 2 (p2ptest2_1767299778) appeared in available peers
3. User 1 clicked "Connect" to initiate P2P registration
4. User 2 received notification badge showing "(2)" in tab title
5. User 2 clicked pending request badge and accepted
6. P2P connection established bilaterally
7. Both users appeared in each other's DIRECT MESSAGES section

## Console Warnings/Errors

### Warnings
| Type | Count | Message | Impact |
|------|-------|---------|--------|
| Warning | Frequent | `[InstanceInboundRouter] No instance owns CID 0, message may be lost` | Low - Internal routing message |
| Warning | Periodic | `[P2P] ListRegisteredPeers attempt 1/2 timed out, retrying...` | Low - Peer list refresh timeout |
| Warning | Rare | `[ILM-BLOCKED] CID X -> peer Y blocked (awaiting ACK)` | Low - Flow control working |
| Warning | Once | React Router Future Flag Warnings (v7 migration) | Low - Framework upgrade notice |
| Warning | Once | `using deprecated parameters for the initialization function` | Low - WASM client deprecation |
| Warning | Once | `PeerRegistrationStore: Failed to load from LocalDB` | Low - Expected on first login |

### Errors
| Type | Message | Impact |
|------|---------|--------|
| Error | `Error checking and registering peers: ListRegisteredPeers request timed out` | Low - Non-critical, messages still work |

### Backend Logs
- Both sessions successfully tracked in `server_connection_map`
- LocalDB KV operations working correctly for message persistence
- Peer connections properly established between both users
- `GetSessionsResponse` confirms 2 active sessions with bidirectional peer connections

## UX/UI Issues Discovered

| Severity | Issue | Details |
|----------|-------|---------|
| Low | High frequency polling | `getPeersForSession` called 1300+ times during test (~8 calls/second) |
| Medium | ListRegisteredPeers timeouts | Periodic timeout warnings when checking registered peers |
| Low | CID 0 routing warnings | Frequent "No instance owns CID 0" messages clutter console |
| Low | React Router deprecation | Future flag warnings for v7 migration |

## Protocol Flow Verified

1. **P2P Registration:** PeerRegister request -> PeerRegisterNotification -> Accept -> PeerConnect established
2. **Connection Management:** Sessions properly tracked in server_connection_map
3. **Message Delivery:** P2P command with MessagingLayerCommand type
4. **Message Acknowledgment:** sent -> delivered -> read status chain
5. **Bidirectional Communication:** Both directions working correctly
6. **Message Persistence:** Paginated storage via LocalDB working

## Technical Observations

### Architecture Confirmation
- Single WebSocket per browser (not per tab)
- Leader tab coordinates message distribution via BroadcastChannel
- Multiple sessions share one WebSocket connection
- Sessions persist in server_connection_map

### Message Protocol Stack
Messages use triple-nested protocol structure:
```
InternalServiceRequest::Message {
  peer_cid: target_peer,
  message: WorkspaceProtocol::Message {
    contents: MessageProtocol::TextMessage { text: "..." }
  }
}
```

### Paginated Message Storage
New implementation successfully stores:
- Message metadata with totalMessages count
- Per-conversation message pages
- Bidirectional tracking (inbound/outbound messages)

## Recommendations

1. **Reduce Polling Frequency:** Consider throttling `getPeersForSession` calls to reduce CPU/network overhead
2. **ListRegisteredPeers Timeout:** Increase timeout or investigate root cause of periodic timeouts
3. **CID 0 Warnings:** Consider suppressing or handling CID 0 routing messages more gracefully
4. **Paginated Loading:** Test message loading when conversation exceeds page size

## Conclusion

The P2P messaging system is fully functional:
- Account creation and workspace joining work correctly
- P2P peer discovery and registration complete successfully
- Deterministic initiator selection algorithm is working as designed
- Bidirectional messaging delivers messages in both directions
- **NEW: Paginated message persistence is working correctly**
- Message acknowledgments (delivered/read) working correctly
- No UI freezes observed

**Test Status: PASS**
