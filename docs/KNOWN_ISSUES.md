# Known issues

Consolidated from the former `P2P_UX_ISSUES.md`, `LIVE_DOC_UX_ANALYSIS.md`,
`P2P_DISCOVERY_FINDINGS.md` and `ERROR_LOG.md`. Every entry below was
**re-verified against the current tree** — items already fixed upstream were dropped
rather than carried forward.

| # | Issue | Severity | Location | Status |
|---|-------|----------|----------|--------|
| 1 | Raw CIDs rendered as user identity | P1 | `p2p/P2PPeerList.tsx:36,178,181`, `p2p/PeerListItem.tsx:44`, `p2p/PeerDiscoveryModal.tsx:64`, `AccountManagementDialog.tsx:126` | Open |
| 2 | `ListRegisteredPeers` has no retry — rejects on first timeout | P2 | `lib/p2p-registration-service/discovery.ts:129` | Open |
| 3 | Leader/Follower badge leaks multi-tab internals to end users | P2 | `layout/sidebar/TopBar.tsx:167` | Open |
| 4 | Server-mode file transfer fabricates a success path, never uploads | P1 | `lib/file-transfer/io.ts:194,202,205` | Open |
| 5 | `MessageSendFailure` emitted alongside successful delivery | P2 | `lib/p2p/`, `citadel-internal-service` | Open — needs root-cause |
| 6 | WORKSPACE MEMBERS shows "No members yet" when members exist | P1 | `layout/sidebar/MembersSection.tsx:155` | Needs re-verification |
| 7 | YJS live-document sync loop (64MB of logs, browser hang) | P0 | `p2p/CollaborativeEditor.tsx` | Needs re-verification — predates the auth/session refactor |
| 8 | Peer Discovery lists stale test accounts with no filter | P3 | `p2p/PeerDiscoveryModal.tsx` | Open |
| 9 | No progress detail during workspace load | P3 | `ui/workspace-loader.tsx` | Open |

## Fixed upstream — do not re-report

| Issue | Fixed by |
|-------|----------|
| Duplicate messages on sender side | `addMessageToConversation()` now returns `Promise<boolean>`; listeners only fire when newly added (`lib/p2p/conversation-manager.ts:82`) |
| Direct navigation fails to claim session | `WorkspaceLoader` auto-claims an active session (`ui/workspace-loader.tsx:57`) |
| Live Doc creation required text in the message input | `P2PMessageInput.tsx:108` now allows empty input in live-doc mode |
| "Coming soon" placeholder settings tabs | `AppearanceSettingsTab` / `PrivacySettingsTab` are real, localStorage-backed |
| `Math.random()` mock presence in the user directory | Removed in the auth/session refactor |
| Simulated demo chat ("Kathy McCooper", Unsplash avatars) | Removed in the auth/session refactor |

## Accepted trade-offs

### Lighthouse "Best Practices" is 96, not 100

`inspector-issues` reports one `ContentSecurityPolicyIssue` — a `kEvalViolation`
from cbor-x, the CBOR codec used for the P2P wire format.

It is a **feature probe, not a failure**. cbor-x runs `new Function('')` inside a
`try/catch` at module load (`node_modules/cbor-x/decode.js:46`) to decide whether
it may compile inline object readers for speed. Our production CSP is
`script-src 'self' 'wasm-unsafe-eval'` with no `'unsafe-eval'`, so the probe
throws, cbor-x catches it and permanently disables that optimisation. Chrome logs
the blocked probe regardless of the catch, and Lighthouse counts the log.

Verified under the production CSP that the fallback path is correct, not merely
quiet: an encode/decode round trip preserves nested structures and, critically,
`bigint` values (CIDs are bigint end-to-end — see CLAUDE.md).

The only way to clear the last 4 points is to add `'unsafe-eval'` to `script-src`,
which would materially weaken XSS protection on a security product to satisfy a
cosmetic score. Not done deliberately. Revisit only if cbor-x gains a build that
skips the probe.

### Fixed 2s delay on every login (needs a backend signal)

`lib/session-startup-service.ts` waits `SDK_TEARDOWN_SETTLE_MS` (2000ms) after a
login before starting P2P setup, so the previous session's channel drops can
propagate through the protocol layer first.

It is a guess in both directions: too short on a loaded backend and it races
anyway, too long and every login pays the difference. It stands because the
alternative today is blind-changing P2P connection sequencing — historically the
flakiest area of this codebase — with no signal to verify against.

**The fix belongs in the internal service.** It knows exactly when the old
Connection's channels are released and should emit that as an event. Once it
does, replace the delay with `waitForEvent(...)` from `lib/utils/scheduling`, and
login proceeds the instant teardown completes.

### Continuous re-renders keep buttons from ever being "stable"

Playwright's actionability check waits for an element to stop moving before
clicking. On this app it can wait forever — observed as
`232 x waiting for element to be visible, enabled and stable` before a 120s test
timeout — because the UI re-renders continuously while BroadcastChannel leader
election settles.

Both test suites work around it by force-clicking (`click({ force: true })`), and
the legacy helpers say so explicitly: *"BroadcastChannel leader election can cause
continuous re-renders that keep the button 'not stable' indefinitely."*

The workaround is fine for tests, but the churn itself is a real cost: it burns
CPU and battery on every session, and it is why a click can feel unresponsive
just after load. The fix is on the app side — leader-election state changes should
not propagate into component render on every heartbeat. Worth profiling with the
React DevTools render highlighter before changing anything.
