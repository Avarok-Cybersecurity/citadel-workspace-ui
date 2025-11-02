# P2P Discovery UI Findings

## Date: 2025-01-06

## Summary
The P2P Discovery UI component exists and is functional, but has some issues with peer listing and registration that need to be addressed.

## What Works
✅ **UI Components Exist**: The PeerDiscoveryModal component is fully implemented at `/src/components/p2p/PeerDiscoveryModal.tsx`
✅ **Button Integration**: "Discover Peers" button is integrated in the TopBar component
✅ **User Registration**: Both users can successfully register (UserOne and UserTwo)
✅ **Tab Isolation**: Each tab maintains its own selected user state correctly
✅ **Connection Status**: Shows current user's CID and connection status
✅ **Modal Opens**: Modal successfully opens when button is clicked

## Issues Found

### 1. Peer List Not Displaying
- **Problem**: The peer list shows a loading spinner but never displays peers
- **Error**: `Failed to load registered peers: Error: Request timed out`
- **Location**: PeerDiscoveryModal.tsx:173
- **Impact**: Users cannot see each other in the peer list

### 2. Username Display Issue
- **Problem**: Modal shows incorrect username ("user2" instead of "UserOne" or "UserTwo")
- **Location**: PeerDiscoveryModal.tsx:36
- **Likely Cause**: Using wrong property or state for username display

### 3. ListRegisteredPeers Timeout
- **Problem**: ListRegisteredPeers request consistently times out
- **Error**: Console shows timeout after 10 seconds
- **Impact**: Cannot determine which peers are already registered/connected

### 4. Missing WASM Client Integration
- **Observation**: The modal sends messages directly via WebSocket instead of using WASM client methods
- **Expected**: Should use `client.list_all_peers()` method if available
- **Current**: Uses `websocketService.sendMessage()` directly

## Console Log Analysis

### Successful Messages
```
ListAllPeersResponse with peer data including:
- UserOne (CID: 8507015995574770295)
- UserTwo (CID: 17964320191479217368)
```

### Failed Messages
```
ERROR: Failed to load registered peers: Error: Request timed out
ERROR: Error checking and registering peers: Error: ListRegisteredPeers request timed out
```

## Root Causes

1. **Backend Issue**: The server/internal-service may not be properly handling ListRegisteredPeers requests
2. **Protocol Mismatch**: The request format might not match what the backend expects
3. **State Management**: The modal might not be correctly accessing the current user's state

## Recommendations

### Immediate Fixes
1. Fix username display in PeerDiscoveryModal to show correct current user
2. Debug why ListRegisteredPeers times out - check backend logs
3. Implement proper error handling to show peers even if registration status fails

### Future Improvements
1. Consider using WASM client methods if they become available
2. Add retry logic for failed requests
3. Show partial data (peers) even if registration status is unknown
4. Add manual refresh button that works

## Testing Notes

- Two users successfully registered in different tabs
- Both can open the Peer Discovery modal
- The backend is receiving and responding to ListAllPeers requests
- The issue appears to be primarily with ListRegisteredPeers and UI state management

## Next Steps

1. Fix the username display issue in PeerDiscoveryModal
2. Investigate backend handling of ListRegisteredPeers
3. Consider showing peer list even without registration status
4. Test P2P registration flow once peers are visible