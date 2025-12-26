# Citadel Workspace Error Log

## Date: 2025-01-08

### Issue: Tab Isolation for Selected User State

#### Problem Description
When multiple tabs are open with different users registered (User One in tab 1, User Two in tab 2), both tabs show the same user in the header instead of maintaining independent selected user states per tab.

#### Root Cause
The tabs were sharing the selected user state instead of maintaining tab-specific selections, even though the leader/follower pattern for WebSocket connections was working correctly.

#### Solution Implemented

1. **ConnectionManager Updates**:
   - Modified `autoReconnect()` to check for tab-specific selected user via `getSelectedUser()`
   - Updated `switchAccount()` to set tab-specific selected user and only disconnect/reconnect if the tab is the leader
   - Added debug logging to track messages received for non-selected users

2. **WorkspaceSwitcher Updates**:
   - Added import for `getSelectedUser` from tab-context
   - Modified `loadStoredWorkspaces()` to determine current workspace based on tab-specific selected user
   - Added fallback to active connection if no tab-specific selection exists

3. **Debug Logging Added**:
   - Messages received for non-selected users are now logged with: 
     `ConnectionManager: DEBUG - Message received for CID X but tab has CID Y selected`

#### Errors Encountered

1. **Ratchet Errors in internal-service**:
   ```
   ERROR citadel: Attempted to get ratchet v1 for cid=8229326626256322917, but does not exist!
   WARN citadel: Unable to get proper StackedRatchet [PGP]
   ```
   - These errors are related to encryption key management when connections are disconnected/reconnected
   - Non-critical for functionality but indicate connection state issues

2. **Ephemeral Storage Issue**:
   - Sessions are stored in LocalDB but lost when services restart
   - Both `server` and `internal-service` use in-memory backends for testing
   - This is by design for the development environment

#### Testing Results

- Successfully registered User One in tab 1
- Successfully registered User Two in tab 2
- Tab 2 incorrectly showed "User One" in header after User Two registration (before fix)
- After implementing fix, tabs should maintain independent selected user states

#### Files Modified

- `/Users/nologik/avarok/citadel-workspace/citadel-workspaces/src/lib/connection-manager.ts`
- `/Users/nologik/avarok/citadel-workspace/citadel-workspaces/src/components/layout/sidebar/WorkspaceSwitcher.tsx`

#### Human Review Notes

- @human-review: Debug logging added in ConnectionManager line 151-158 for tracking messages to non-selected users
- @human-review: Tab-specific user selection logic in switchAccount() lines 1095-1121 may need additional testing with multiple simultaneous connections

#### Next Steps

1. Test the fix with fresh user registrations
2. Verify that switching between users in the WorkspaceSwitcher properly updates tab-specific selection
3. Consider implementing persistent storage for LocalDB in development environment if needed