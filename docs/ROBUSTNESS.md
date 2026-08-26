# Robustness audit — findings, fixes, and what is still open

Five parallel read-only audits (tests, P2P/ILM, frontend error handling, Rust
backend, deploy/upgrade/PWA), 2026-08-26. Every claim below was re-verified
against source before being recorded — several entries in the old
KNOWN_ISSUES table turned out to describe code that no longer existed, so a
report is not evidence.

## Fixed

| Fix | What it prevented |
|---|---|
| SW registered outside React (`main.tsx`) | A build that threw during render unmounted the update path, so the fix could never be delivered. Users stuck until they cleared site data. |
| Update offer re-raised on tab return (`PwaUpdatePrompt.tsx`) | `needRefresh` was cleared on show and `waiting` never re-fires, so dismissing the toast once stranded the user on that build permanently. |
| Rollback recovery screen (`main.tsx`) | An IndexedDB `VersionError` — the expected state during a rollback — reached no UI: diagnostics-gated log, rethrown into an async effect React cannot catch. Silent spinning loader on the one lever you use during an incident. |
| `SINK_CHANNEL` re-settable (wasm-client `lib.rs`) | `restart()` tore the client down and then failed on `OnceCell::set`, permanently. Reconnection was dead code that made things worse. |
| `AddMember` guarded; removal demotes role | Two more paths to a workspace with no administrator, reachable from the ordinary UI. Promotion requires an admin, so both were unrecoverable. |
| Typed `WorkspaceError` routed to a live channel | `workspace:error` had zero subscribers since it was written — every permission-denied vanished while the UI showed success. |
| RE-VFS pending-op drain (`revfs-service.ts`) | The queue was write-only: `removePendingOp` had no callers, `retryCount` never incremented. Peers diverged silently while Sync reported success. |
| `group-helpers.ts` chat bypass removed | `return true` when chat was absent — and "absent" was measured by probing the UI under test, so the likeliest regression greened three CI jobs. |

## Open — ranked

### 1. ~~The internal service authorizes nothing~~ · FIXED, with one exemption

Shipped: a request may only act on a session its connection owns. Four
iterations to get there, and the record is worth keeping — the first version
passed 19 specs while refusing 48 requests, because the client retries and
absorbs refusals. A green suite proved nothing.

**Remaining question, deliberately scoped rather than hidden:** `LocalDBGetKV`
is exempt. Naming the variant in the refusal log showed every one of those 48
was that read — ILM's messenger backend reads key/value state under a
peer-scoped session, and gating it broke messaging outright. Either ILM should
key those reads by the local session, or the gate needs to learn which
peer-scoped reads are legitimate. Until then a read is allowed and every
destructive and impersonating operation is gated.

Residual: three refusals per two-browser P2P run (ListAllPeers,
ListRegisteredPeers, PeerConnect) — the client acting on sessions GetSessions
reported but that belong to another browser. Correct to refuse; does not arise
in the ordinary one-browser topology.

### 1b. Origin allowlist · open, needs a deployment decision
Every handler reads `cid` from the request and never checks it against the
connection that sent it; `deregister.rs:32` removes whatever session is named.
Production binds loopback, but **WebSocket is exempt from CORS**, so any page a
user visits can reach `ws://127.0.0.1:12345`. Dev binds `[::]`.
`InternalServiceRequest::session_cid()` is already landed as the prerequisite —
32 of 38 variants, the 6 without being exactly those that legitimately precede
or span a session. Remaining work: reject when `session_cid()` is `Some(cid)`
and the connection does not own it.

An Origin allowlist would also close the drive-by vector, but the UI can be
served from a remote domain while the agent runs locally, so it risks breaking
that topology. That is a deployment decision, not purely a code one.

### 2. Backup and restore do not exist · high
No script, no documented procedure, no restore path. There is **no server-side
key escrow by design**, so a lost `agent_data` volume is an unrecoverable
identity rather than an inconvenience. `docs/UPGRADING.md` says only "data
volumes are never touched", which is the whole durability contract today.

### 3. Install docs for the paths people actually use · high
`docker-compose.local.yml` (the end-user path) and
`docker-compose.production.yml` (the operator path) appear in **zero** markdown
files. A first-time reader follows README, stands up the *dev* stack, and loses
every account on first reload because dev is contractually ephemeral.
`docs/UPGRADING.md` is linked from neither README nor `docs/README.md`.

### 4. A failed deploy leaves a mixed-version stack · high
`deploy.sh` swaps the server first and health-waits. On failure it exits 1 with
the server on the new image (crash-looping) and the other two on the old — the
topology its ordering exists to prevent. Nothing reverts, nothing records the
outgoing tag, and the error names no rollback command.

### 5. Struct shape is not coupled to the schema version · medium
`citadel_workspace.nodes` is a single blob and `citadel-workspace-types` has
zero tests. One field added without `#[serde(default)]` makes the whole tree
unreadable on a persistent backend. The code comment already says so; nothing
enforces it. A golden-fixture round-trip test would.

### 6. Graceful shutdown is built and inert · medium
`on_stop` broadcasts `ServerShutdown` with a drain window, has a protocol
variant, TS bindings and a unit test. There is **no SIGTERM handler**, so it
never runs; and `server:shutdown` has no subscriber, so it would do nothing if
it did. Every upgrade drops live sessions abruptly.

### 7. Healthchecks prove a port is open · medium
`nc -z` cannot see the failure class this repo has already hit — a tmpfs
permission mismatch that passes the port probe and fails on first write. And
Docker restart policies react to process exit, not health, so an
unhealthy-but-running container is never remediated and never alerted on.

### 8. Test suites that cannot fail · medium-high
Beyond the fixed `group-helpers` bypass: `multi-tab-sync.spec.ts` has four
assertions that pass in both the success and failure states; `file-transfer.test.ts`
returns `gotResponse: true` from its own catch; `workspace-init.test.ts` excludes
the very field it exists to check; `tree-custom-types.test.ts` leaves 12 of 18
fields ungated. Each has file:line evidence in the audit transcripts.

## Round two — four audits, 2026-08-26

Call/media, accessibility, build integrity and observability. Ground the first
five audits never covered.

### 9. Call state can rest in `connecting` and `ringing-in` forever · high
The ring timer is armed only in `start()` and cancelled on the *first*
transition out of `ringing-out`; the heartbeat watchdog refuses to arm until
`active`. Its comment says earlier states "have their own guardians", which is
false for two of the three: `ringing-in` never had one, and `connecting` loses
its only one at the instant it is entered.

So a caller whose tab is killed leaves the callee ringing indefinitely, ring
tone looping, with no timer anywhere in the system that can end it. **Fixed the
first layer** (accept() fan-out containment, d0b5249); the timeout itself is
open. Fix: arm a per-status deadline inside `apply()` for every non-terminal
state, not only `ringing-out`.

### 10. `captureFailure` is produced, typed, threaded — and read by nothing · high
Six carefully-classified capture failures ("Allow it in your browser's address
bar, then try again", "already in use by another application") reach a context
field with zero consumers. Deny camera permission and the Call button does
nothing at all: no toast, no panel, no disabled state. `CallStage` already has
an `ErrorPanel` to render it in.

The same shape as the storage-key and members-list findings — see
[[controls-that-operate-on-nothing]]. Third instance this month.

### 11. `CallSession.start()` has no re-entrancy guard · high
`ensureSession()` hands the same instance to every caller, and `start()` awaits
`getUserMedia` — a permission prompt that can be open for seconds — before
anything guards a second entry. Two clicks orphan a whole MediaStream and its
CapturePump: **the camera LED stays on after the call ends and after teardown**.
No button is disabled while a start is in flight.

### 12. `end()` awaits unbounded sends before releasing the camera · high
`SIGNAL_QUEUE_MAX_WAIT_MS` bounds what the *next* send waits for, not the
caller's own promise, and the per-peer `.catch` covers rejection rather than
stalling. One stalled send means Leave does nothing visible and the camera stays
lit. Invert it: close sessions and apply `ended` first, then fan the CallEnd out
best-effort.

### 13. Group rosters are attacker-controlled and uncapped · medium
`handleInvite` builds participants from `signal.group.members` with no length
cap and no check against room membership. `canAddParticipant` exists and is
consulted only by the UI. A peer can name 10,000 CIDs and have us render 10,000
tiles and originate 10,000 P2P sends to third parties of their choosing.

### 14. Audio silently unavailable on Firefox and Safari · high
`probeMediaCapabilities` checks getUserMedia, WebCodecs and Opus encode — never
`MediaStreamTrackProcessor`, which Firefox and Safari do not ship. The probe
returns supported, buttons enable, the call connects, tiles render, the duration
ticks, and not one audio frame is ever captured. The only trace is a debugLog.
`capture-pump.ts:6` warns about exactly this failure mode one branch above where
it reappears.

### 15. Nothing identifies a build, and no id joins a user to a log · critical
`version: "0.0.0"`, no `define:` block, no `org.opencontainers.image.revision`
on any of the three Dockerfiles, no About panel. For a PWA with a service-worker
precache, "which build are you on" is unanswerable in principle. The internal
service mints a per-WebSocket `conn_id` that appears in nearly every session log
line and is never sent to the client — the perfect join key, kept server-side.

### 16. 1049 debugLog against 11 errorLog · critical
`debugLog` is a no-op outside DEV. Per subsystem, production-visible logging:
multi-instance 104/**0**, p2p 92/**0**, p2p-auto-connect 78/**0**, connection
73/**0**, file-transfer 31/**0**, call 12/**0**. That is 423 statements across
the seven subsystems users actually complain about, none of which emit in
production. The router even has a purpose-built lost-message detector
(`router-diagnostics.ts:26`) that is a no-op where it matters.

### 17. A health check running ten times a minute, reporting to nobody · high
`healthCheckService` polls every 10s and emits `service-health`. Grep finds two
hits, both emitters. The app knows it is unhealthy and tells no one. Meanwhile
`OfflineBanner` watches `navigator.onLine`, which cannot see a dead WebSocket, a
stalled ILM, or a wedged leader tab — and `WorkspaceApp` suppresses the retry
modal while it reads offline.

### 18. The WASM client's log facade is half-wired · high
`messenger/mod.rs` does `use citadel_logging as log`, so its `log::` macros are
tracing macros — and no WASM build installs a tracing subscriber. 26 of 30
diagnostics there are discarded, including `[MSG-ROUTE] FAILED to send to ISM
channel` and `QUEUED - No ILM registered for CID`. The Cargo.toml already
documents the fix; it was never applied to the source. Three `use` lines.

### 19. Rust logs have no timestamps · high
`citadel_logging` calls `.without_time()`, and ANSI is on with no `NO_COLOR`
anywhere. "It broke at 14:32" is untraceable outside Docker's json envelope,
which records ingestion time and survives only as long as the container.

### 20. Images build with the lockfile deliberately stripped · critical
`.dockerignore` excludes `Cargo.lock` by design, and all 13 Citadel-Protocol
deps track `branch = "master"` with no `rev`. CI tests the pinned revision; the
published image resolves master HEAD at build time. The three publish jobs run
in parallel and resolve independently, so a server and an internal-service in
one run can ship different `citadel_crypt` — the two ends of the same
double-ratchet — under identical revision labels.

`verify-image-revisions.sh` is careful, well-reasoned work that is proven to
discriminate by its own CI fixtures. It cannot see this: the label it inspects
is `github.sha`, which is identical across the mismatched pair.

### 21. Nothing is signed, attested, or digest-pinned · high
Repo-wide grep for cosign/attest/provenance/sbom returns two hits, both the
English word in a comment. `provenance: true` and `sbom: true` are one-line
opt-ins on the build-push action already in use. Production pulls by mutable
tag, and `cloudflared:latest` — which terminates all inbound traffic — is
explicitly exempt from the revision gate.

## Round three — data integrity and dead ends, 2026-08-26

### 22. Live document edits are never persisted, and the header says "Last saved" · critical
`liveDocumentStore`'s only production caller is `createDocument`.
`updateDocumentState`, `loadDocument` and `loadIntoYDoc` have zero callers
outside their own directory. `useCollaborativeEditor` starts a fresh empty
`Y.Doc` on every mount and loads nothing; `P2PChat` renders `LiveDocumentView`
with no `onSave`, and `LiveDocumentView` calls `setLastSaved(new Date())`
**outside** the `if (onSave)` guard. So the debounced autosave fires, does
nothing, and stamps a timestamp. Everything typed exists only in RAM and in the
P2P stream. This is not a swallowed exception — there is no write to fail.

### 23. Peer registration writes bigints as strings and never revives them · high
`persistence.ts` persists with `safeJSONStringify`, whose own doc says "Use
this ONLY for logging purposes, not for storage", and reads back with a bare
`JSON.parse` — no reviver. Every downstream comparison is `===`, and
`"123" === 123n` is false. After any reload: incoming requests are filtered out
of the UI and the badge, outgoing ones can never be deduped or removed so the
list grows forever and re-sends, and strings reach `claimSession` and a CBOR
`PeerRegister`. The validity filter passes them because non-empty strings are
truthy. The correct round-trip is 40 lines away in `message-page-operations`.

### 24. `citadel_sessions` is one global key rewritten wholesale from stale snapshots · high
Read once at init into per-tab memory, then rewritten in full from that
snapshot at seven sites, with no re-read and no lock. Two tabs each hold
independent arrays: the second write erases the first tab's stored session —
username, plaintext password, server, cid. `activeSessionIndex` lives in the
same blob. Separately, every tab init calls `clearSessionCids()` and persists,
so opening a second tab destroys the first's ability to reclaim its orphaned
session.

### 25. Logout leaves the next user the previous user's data · high
`handleLogout` removes one session row. Surviving: the entire plaintext message
history for every peer, both peer-request arrays, all live docs, every RE-VFS
tree (`removeEntry` appears nowhere in src), recent servers. Worse than
residue: `peer-registration-store/state.ts` returns the **unfiltered** pending
list when there is no current CID — which is exactly the logged-out state — so
the next user sees the previous user's incoming peer requests and badge count.

### 26. Mass conversation deletion when the peer list comes back empty · high
`cleanupStaleConversations(validPeerCids)` deletes the persisted pages of every
cached conversation not in the set. `ListRegisteredPeers` is documented in the
same file as timing out intermittently under concurrent P2P activity, and
`startupComplete` initialises to `true`, so a plain reload is not covered. An
empty set deletes everything, logged only at debugLog. One guard fixes it:
refuse to delete on an empty set.

### 27. Browser storage quota is not handled anywhere · medium
Zero occurrences of `QuotaExceededError`, `navigator.storage.estimate`, or
`navigator.storage.persist` in src. Because `persist()` is never requested,
IndexedDB and OPFS stay best-effort and the browser may evict everything with
no notice. The quota UI that exists measures the *server's* VFS quota.
`citadel:file-transfers` in localStorage is written from 14 call sites and
never read except to re-serialise itself — unbounded, against a ~5MB cap, and
when it fills, the silent casualties are the other localStorage writers.

### 28. RE-VFS: the pending-op queue is never rehydrated, and 23 persist sites discard the result · high
`load-pending-ops` has an intent, a router handler and a storage implementation
— and nothing dispatches it. After a reload `retryPendingOps` returns 0 and the
UI toasts "Tree synced with peer"; the next failed op then overwrites
`pending_ops.json` with the truncated in-memory list, destroying the abandoned
op. Separately, `revfs-io` carefully returns `{success:false}` and all 23 call
sites `await` it bare, so under quota exhaustion the UI repaints and disk is
unchanged.

`mergeTrees` **is** union-only as documented — do not "fix" that. But conflict
resolution is last-write-wins on unsynchronised `Date.now()` with no Lamport
counter, so a peer with a slow clock loses every edit silently.

### 29. WorkspaceInitializationModal can seal shut · critical
Both Cancel and Initialize are `disabled={isSubmitting}`, the overlay is
hand-rolled `fixed inset-0` so there is no Escape or backdrop, and the awaits
are ordered so the unbounded `sendWorkspaceRequest` precedes the promise the
10s timer guards — so on a hang the `finally` never runs and `isSubmitting`
stays true. Fixed in this round for the two guarded-dismissal dialogs and the
sign-out blocker; this one still needs the same treatment.

### 30. AlertDialogContent renders no close X at all · medium
`ui/dialog.tsx` includes a built-in X; `ui/alert-dialog.tsx` is Portal >
Overlay + Content with none. Radix AlertDialog also does not close on
outside-click by design. So wherever Cancel is `disabled` — three confirm
dialogs — Escape is the only exit.

## Round four — multi-tab concurrency, 2026-08-26

The architecture is "one WebSocket per browser, leader tab and followers over
BroadcastChannel". There are **no tests for leader election at all**.

### 31. Duplicating a tab produces two instances with the same identity · critical
Both `instanceId` and `tabId` live only in `sessionStorage`, which the HTML spec
copies into a tab created from an existing one — "Duplicate tab", `window.open`,
middle-click. `instance-channel` then drops every message whose sender id equals
its own, so the twins discard each other's heartbeats, each concludes no leader
exists, and both claim it **permanently**: the split-brain resolution runs only
on messages that were filtered out one line earlier. `isMessageForUs` also
matches both, so forwarded messages process twice, and both write the same
`tab-<id>-selected-user` key — switching account in one silently changes the
other. One user gesture reaches an unrecoverable state. Fix: mint identity per
page load and detect collision via an announce from your own id.

### 32. A 5s leader timeout against a 60s throttled heartbeat · high
`HEARTBEAT_MS 2000` / `LEADER_TIMEOUT_MS 5000` is two missed beats of slack, on
a plain `setInterval`, with no `visibilitychange` handling in the election at
all. Chrome throttles hidden tabs to roughly one timer callback per minute after
~5 minutes. So working in one tab for five minutes while another holds
leadership guarantees a false takeover — and each one used to strand a socket
(finding 33). The mitigation exists elsewhere: `checkstate-manager` queues while
hidden. Fix: `navigator.locks` is the real answer (crash-safe single leader for
free); at minimum force a heartbeat on becoming visible and resign deliberately
after a long hide.

### 33. Demoted leaders never closed their socket · critical — FIXED (7f55689)
### 34. The follower retry mechanism had no subscriber · high — FIXED (7f55689)

### 35. P2P history is stored per-peer under CID 0, and the write lock is per-tab · high
Keys are `msgs_with_peer_{CID}_…` at namespace `0n`, and `loadAllMetadata` lists
all of them regardless of who is signed in — no `conversations.clear()` exists
anywhere. So user2's tab shows user1's history for a shared peer, and a
logout/login inherits the previous user's conversations. `withPeerLock` is a
module-level Map, i.e. per tab: in the project's own sanctioned two-tab test
setup, an append in tab 1 can be overwritten by tab 2 between its load and save.
The lock's own header quotes the exact failure it was written for; it was never
extended past the tab boundary.

### 36. Six features call the raw client and are inert on every follower tab · high
A follower has no client at all. The correct branch-on-leader-then-proxy pattern
exists twice in the same directory (`workspace-operations`,
`messenger-operations`). These never got it: group create/invite/leave/kick/list
all throw; `listKnownServers` returns empty; peer-registration persistence logs
"no client" and **resolves successfully**, so accepted requests reappear after a
reload; `resendPeerRegister` throws. Fix: route through
`websocketService.sendRequest`, which already proxies — and a lint rule banning
`sendDirectToInternalService` outside `lib/websocket*/` would catch the next one.

### 37. Leaked listeners on the timeout path · medium
Five request helpers register a `websocket-message` handler and clear it on
success and failure but not on timeout — and the timeout path is the common one
on a follower tab, where the response may never arrive. Each leaked handler then
runs on every subsequent message for the life of the tab. The canonical version
is `websocket/request-response.ts`: one `cleanup()` closure called from all four
exits, including a throw from the send itself.

### 38. The "emit with NO listeners" detector cannot see the case it was written for
It fires only when the listener count is zero — a few ms at boot. The real
failure is the P2P handler being absent while ~8 other services are subscribed,
which keeps the count non-zero. The module's own header says exactly this.

## Round five — visual quality, 2026-08-26

The shape here matches the functional audits exactly: things declared and never
connected. Four fixed (aa6e4df, d51460c); the rest recorded.

### 39. `bg-popover` and the whole `sidebar-*` family named tokens that did not exist · critical — FIXED
Tailwind emits nothing for an unknown colour: no warning, no CSS. Twenty Radix
popper surfaces rendered transparent, and SidebarMenuButton's hover/active/
selected rules produced nothing. Both had been patched site-by-site — 27 local
background overrides, six sidebar call sites adding their own hover — which is
what kept them alive. Guarded by `scripts/check-color-tokens-exist.mjs`.

### 40. index.css overrode `.animate-in`, deleting every Radix enter animation · high — FIXED
### 41. 421 hover states, two pressed states · high — FIXED
### 42. Seven CTAs including Send cancelled their own hover · high — FIXED

### 43. Eleven settings controls are wired to nothing · critical
Six privacy flags (`showOnlineStatus`, `showTypingIndicators`, `sendReadReceipts`,
`allowDirectMessages`, `showProfileToStrangers`, `notifyOnScreenshot`) and five
appearance ones appear ONLY in their own tab file. Nothing reads them. Two
additionally toggle `compact-mode` and `reduce-motion` classes with **zero
rules** in the 116KB stylesheet, and `fontSize` sets `documentElement.style
.fontSize`, which rescales every rem — so the "Font Size" slider zooms padding,
gaps and container widths rather than text.

In a privacy-positioned product, a Read Receipts switch that persists and does
nothing is a false statement, not a polish gap. **This is a product decision**:
wire them (read receipts and presence already exist at the protocol level, so
those two are a small gate) or mark them unavailable. Not taken unilaterally.

### 44. 40 modal surfaces, 6 backgrounds, 7 borders, 12 max-widths · high
Five widths inside a 90px band, and the auth cards use `bg-background` — a modal
painted the page colour — while every other modal is `bg-card`. Fix: one
`<Modal size>` wrapper.

### 45. Nine empty states, five icon treatments, four headline sizes · medium
Only `pages/Messages.tsx` has the treatment the product deserves. Two are Title
Case against seven sentence case. Fix: one `<EmptyState>` and nine replacements.

### 46. 35 of 39 truncating elements have no title attribute · medium-high
File names, tab titles, peer names, workspace names, caller names — all
user-controlled, all unrecoverable once truncated. Related: `P2PChatHeader`'s
inner div lacks `min-w-0`, so `truncate` never engages and the header overflows
instead.

### 47. There is no layout above 768px · high
`xl:` and `2xl:` appear **zero** times. 29 of 34 files that use `sm:` use no
other breakpoint. The 640–767px band gets the phone layout while the sidebar has
already switched to a fixed 16rem rail at 768, leaving ~512px of content at
phone density.

### 48. Terminology contradicts itself on the first screen · medium-high
`pages/Connect.tsx` says "Connect to Workspace" / "Select Workspace" and then
toasts "No Server Selected"; the signup steps are labelled "Server". The Connect
list also shows the raw `host:port` as the primary line with the human-readable
name beneath it.

### 49. Developer test instructions ship as user-facing copy · medium
`PeerDiscoveryModal`'s empty state reads "Open another tab and connect as a
different user to test P2P" — the first thing a real user sees when looking for
someone to talk to.

### 50. The signup step indicator is misaligned on all three steps · medium-high
The connector is centred on a column that includes the label, so it sits ~10px
below the circles it joins. Labels are always supplied, so it is visible on 100%
of signups. Fix: `self-start mt-4` on the connector.

**Recorded as already excellent:** `index.html` and the PWA manifest (complete
OG/Twitter/JSON-LD, `theme_color` exactly matching the computed dark
`--background`, maskable icons, shortcuts, wide screenshots); spacing discipline
(two arbitrary values in 242 files, both from stock shadcn); the
`--destructive` / `--destructive-emphasis` split; `.reveal-on-hover`; the
`forced-colors` block; and the call surface's state completeness.

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.
