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

### P2P messaging is unavailable for 2s after login (needs a backend signal)

`lib/session-startup-sequence.ts` waits `SDK_TEARDOWN_SETTLE_MS` (2000ms) after a
login before starting P2P setup, so the previous session's channel drops can
propagate through the protocol layer first.

**Corrected 2026-08-26 — this is NOT 2s of login latency.** The sequence runs
from an `eventEmitter.on('session:activated', ...)` listener, which nobody
awaits, so the user reaches the workspace immediately. What the delay defers is
`wasmConnectionManager.start()`, one step further down: for the first ~2s after
a login, ILM is not up, so messages cannot be sent or received. That is still
worth removing, but it is "messaging is briefly unavailable", not "every login
is 2s slower", and it should be prioritised as the former.

It is a guess in both directions: too short on a loaded backend and it races
anyway, too long and every login pays the difference. It stands because the
alternative today is blind-changing P2P connection sequencing — historically the
flakiest area of this codebase — with no signal to verify against.

**The fix belongs in the internal service.** It knows exactly when the old
Connection's channels are released and should emit that as an event. Once it
does, replace the delay with `waitForEvent(...)` from `lib/utils/scheduling`, and
login proceeds the instant teardown completes.

### Group-call pair connection hangs intermittently on CI

`call-group.spec.ts` connects three pairs (A-B, A-C, B-C). Twice on CI the
combined test burned its whole 420s budget and failed at a different point each
time — once on `page.screenshot: Timeout 10000ms`, once waiting for a workspace
to load after a peer request was accepted. It has never failed locally.

The obvious reading is "a 2-core runner driving three browsers is too slow".
The measurements refute it: split into one test per pair, each pair connects in
**~46s on the same CI hardware**, so the three together are ~140s against a 420s
budget. Time was never the constraint — one step was hanging.

Both observed stalls were in the conversation-open step of `connectPair`, after
the request was accepted, which is where to look first.

The split shipped because it isolates the failure — a named pair inside 240s
instead of a seven-minute test reporting only "pairwise" — and the first run
after it passed. That is one data point and does NOT establish the hang is gone.
Treat a recurrence as the same defect, now better labelled.

### The shadcn sidebar's own colour classes generate no CSS

`components/ui/sidebar.tsx` styles itself with `bg-sidebar`,
`text-sidebar-foreground` and `text-sidebar-accent-foreground` — 41 references
across the file. None of those tokens exists: there is no `sidebar` entry in
`tailwind.config.ts` and no `--sidebar-*` custom property in `index.css`, so
Tailwind never emits the utilities.

Confirmed against the built stylesheet rather than inferred: `.text-foreground`
and `.bg-card` produce 2 and 3 rules, while `.bg-sidebar`,
`.text-sidebar-foreground` and `.text-sidebar-accent-foreground` produce **zero**.

It is not a visible defect. The primitive inherits `foreground` from the body,
and the app's own wrappers under `components/layout/sidebar/` supply the
surfaces, which is why every responsive and accessibility scan passes. It is a
trap: someone adjusting sidebar colours will edit those class names and see
nothing change.

Two ways out, and they are not equivalent — deciding needs a look at the
rendered sidebar, which is why neither was applied:

- define the `sidebar` token family, which makes the primitive theme itself and
  WILL change how the sidebar looks, or
- delete the dead classes, keeping today's appearance and removing the trap.

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
