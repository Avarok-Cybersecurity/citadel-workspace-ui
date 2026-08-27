# Robustness audit — findings, fixes, and what is still open

Five parallel read-only audits (tests, P2P/ILM, frontend error handling, Rust
backend, deploy/upgrade/PWA), 2026-08-26. Every claim below was re-verified
against source before being recorded — several entries in the old
KNOWN_ISSUES table turned out to describe code that no longer existed, so a
report is not evidence.

**That standard applies to this file too, and it was not being met.** Findings
were recorded and then fixed in the same session without the entry being
amended, so ten entries — three of them critical — sat under "Open" while the
code was already correct. One of them, #1b, described building an authorization
gate that #1 four lines above says is shipped. Corrected 2026-08-26 by checking
every claimed-open entry against the tree. A work queue that misstates its own
state costs more than no queue.

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

> **Corrected 2026-08-26.** The "remaining work" this entry described — reject
> when `session_cid()` is `Some(cid)` and the connection does not own it — is
> SHIPPED, at `kernel/requests/mod.rs`, and finding #1 four lines above says so.
> Only the Origin allowlist itself is still open, and it remains a deployment
> decision rather than a code change.
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

### 2. Backup and restore do not exist · ~~high~~ FIXED
No script, no documented procedure, no restore path. There is **no server-side
key escrow by design**, so a lost `agent_data` volume is an unrecoverable
identity rather than an inconvenience. `docs/UPGRADING.md` says only "data
volumes are never touched", which is the whole durability contract today.

### 3. Install docs for the paths people actually use · ~~high~~ FIXED
`docker-compose.local.yml` (the end-user path) and
`docker-compose.production.yml` (the operator path) appear in **zero** markdown
files. A first-time reader follows README, stands up the *dev* stack, and loses
every account on first reload because dev is contractually ephemeral.
`docs/UPGRADING.md` is linked from neither README nor `docs/README.md`.

### 4. A failed deploy leaves a mixed-version stack · ~~high~~ MOSTLY FIXED
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

### 9. Call state can rest in `connecting` and `ringing-in` forever · ~~high~~ FIXED (89927b7)
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

### 10. `captureFailure` is produced, typed, threaded — and read by nothing · ~~high~~ FIXED (32718da)
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

### 18. The WASM client's log facade is half-wired · ~~high~~ FIXED (7f797c1)
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

### 22. Live document edits are never persisted, and the header says "Last saved" · ~~critical~~ FIXED (f1662ec)
`liveDocumentStore`'s only production caller is `createDocument`.
`updateDocumentState`, `loadDocument` and `loadIntoYDoc` have zero callers
outside their own directory. `useCollaborativeEditor` starts a fresh empty
`Y.Doc` on every mount and loads nothing; `P2PChat` renders `LiveDocumentView`
with no `onSave`, and `LiveDocumentView` calls `setLastSaved(new Date())`
**outside** the `if (onSave)` guard. So the debounced autosave fires, does
nothing, and stamps a timestamp. Everything typed exists only in RAM and in the
P2P stream. This is not a swallowed exception — there is no write to fail.

### 23. Peer registration writes bigints as strings and never revives them · ~~high~~ FIXED (f1662ec)
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

### 26. Mass conversation deletion when the peer list comes back empty · ~~high~~ FIXED (f1662ec)
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

`mergeTrees` **is** union-only as implemented — do not "fix" that. Note the
JSDoc above it is the thing that lies: it describes deletion propagation the
body does not do, and the body says so in its own note. Fix the comment, not
the code. But conflict
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

## Round six — deployment lifecycle and test honesty, 2026-08-26

### 51. The backup script could report success having archived nothing · critical — FIXED (8798e31)
### 52. A deploy could ship the previous commit and print "Deploy complete!" · high — FIXED (ffc360a)
### 53. The master password was rewritten on every boot · high — FIXED

### 54. `ClaimSession` has no authorization check, and its test asserts a cross-account claim succeeds · **security decision**
`connection_management.rs` checks that the session exists, that it is orphaned
if asked, and that the SDK still holds it. It never checks that the claiming
connection is entitled to it — a grep of the handler for auth/owner/username/
permission returns nothing. `tests/orphan_sessions.rs` then registers a
**different account** (`second.user` / `password456`), claims the first
account's session, and asserts `"Successfully claimed session"`.

This may be intended: the internal service is a localhost agent that
deliberately multiplexes many users over one connection, and ClaimSession is
how a reconnecting browser reattaches to its own orphans. But as written, any
process that can reach `ws://localhost:12345` can enumerate sessions with
GetSessions and claim any of them, gaining full access to that user's
end-to-end-encrypted messaging. The test records the permissive behaviour as
correct, so no future change can tighten it without a failing test.

**Not changed unilaterally** — it is a trust-model decision about what a
localhost connection is entitled to.

### 55. `assert!(result.is_ok())` is a tautology across the server kernel · critical
`async_process_command.rs` has **zero** `return Err` and 46
`Ok(WorkspaceProtocolResponse::Error(...))` — every failure, including every
permission denial, is wrapped in `Ok`. So `is_ok()` is true for all inputs, and
14 assertions are exactly that, several of them the only assertion in their
file. A regression denying every AddMember/RemoveMember/UpdateMemberRole keeps
them all green. `workspace_crud_test.rs` matches the response variant properly
— that is the shape to copy.

### 56. No test anywhere asserts a workspace command is REFUSED · critical
`execute_command` hardcodes `TEST_ADMIN_USER_ID` across ~120 call sites, so
every test runs as workspace owner. Three tests *named* for denial assert
success instead. `ensure_not_last_admin` — the admin-lockout fix — has three
production call sites and **no test** references it, which is the claim that
matters. (Corrected: the original wording said it was referenced nowhere at
all, which is false.) A `check_entity_permission` that
returned `Ok(true)` unconditionally would pass the entire suite.

### 57. The internal-service tests do not re-run when the parent bumps its pointer · medium
*(Corrected after checking: the audit reported these tests as never running.
They do — `citadel-internal-service` runs `cargo nextest run` on its own PRs.
The parent's `rust-tests` matrix covers only the three root crates, and its
internal-service steps are fmt and clippy only.)*

The real gap is narrower and still worth closing: a parent-side change to
`citadel-workspace-types`, which the internal service depends on, is never
tested against the internal service's suite. The submodule's CI validated it
against the types as they were when that commit was made. Fix: a `cargo nextest
run` job with `working-directory: citadel-internal-service` in the parent, or
at minimum on changes touching the shared crates.

### 58. Orphan mode is written and never read · high
Four write/remove sites, zero read-for-decision sites, and `ext.rs` says so
outright: "The orphan_sessions map is no longer used for cleanup decisions."
Its test asserts a string the handler copies from the request field, not from
stored state — delete the insert and the test still passes. The repo runs
`check-storage-keys.mjs` in CI for exactly this class in TypeScript; there is
no Rust equivalent, and here the polarity is reversed.

### 59. CLAUDE.md documents a `Drop for Connection` that does not exist · high
The "Session Management Fixes Implemented" section claims an RAII cleanup at
`mod.rs:145-182`. The only `impl Drop` in the crate are in file/upload.rs and
media/mod.rs. Documented, absent, and nothing would notice.

### 60. The P2P routing test discards the routing fields · high
`service.rs` destructures `cid` (shadowing the outer binding, never compared)
and `peer_cid: _cid_b`, asserting only the payload bytes. A bug swapping the
two would misroute every P2P message in a multi-tab browser — the exact defect
`instance-inbound-router.ts` exists to handle — and pass.
`connector/tests/messenger.rs` checks all three fields correctly.

### 61. File-transfer byte verification runs in a spawned task · high
The real comparison lives inside a kernel handler under `tokio::task::spawn`, so
a panic there aborts only that task. One of four tests installs a global panic
hook to work around it; the standard C2S transfer test asserts only that the
*sender* saw TransferComplete. The `server_success: AtomicBool` that exists for
this is never stored or loaded. Separately, the REVFS encryption assertion is
`assert_ne!(plaintext, stored)` — satisfied by an empty file, all zeros, or a
truncated blob, and never asserts the round trip decrypts.

### 62. Deployment items not yet fixed
`build:` alongside `image:` on server and internal-service contradicts
INSTALL.md's "nothing is built" and breaks the documented first install (the
`ui` service has the fix and a comment explaining it). A transient container
exit pre-empts `restart: unless-stopped` and takes the one deploy path that
prints neither the mixed-version warning nor the rollback hint. The rollback
history file records only the literal string `latest`. No pre-flight disk,
port or config check. `smoke-ui-ws.sh` starts its own throwaway containers, so
the documented post-deploy verification never touches the running stack.

## Round seven — performance and perceived speed, 2026-08-26

There is **not one `React.memo` and not one virtualised list** in the app.

### 63. The workspace context re-rendered 20 subtrees on every network reply · critical — FIXED (d5309d1)

### 64. ~2.5 seconds of dead clock before the WebSocket is created · critical
A cold single-tab boot awaits `waitForLeaderElection`, and leadership is first
claimable at `HEARTBEAT_INTERVAL_MS + 500` = 2500ms — so the timer expires
before `new WorkspaceClient()` and `client.init()` (WASM instantiate + connect)
even begin. Deterministic arithmetic from the constants, not a measurement. A
tab that has received no heartbeat and no announce reply could claim leadership
on the first tick. Costs zero bytes. Largest single TTI item.

### 65. Message lists are unbounded and unvirtualised · high
50 messages page in and **never out** — `prependMessages` has no cap, no
eviction and no slice, and re-sorts the whole array on every incoming message.
Scrolling back N pages leaves 50·N mounted for the tab's life. Estimated ~75k
DOM elements at 5,000 messages, with zero memoised rows. Note the asymmetry:
the messenger cache IS capped at 100 per conversation; the React array that
actually renders is not capped at all.

### 66. `groupMessagesByDate` runs outside useMemo · high
`formatDate` allocates 3 Date objects and 2-3 `toDateString()` calls per
message, on every render — including every keystroke in the composer. At 5,000
loaded messages that is ~15,000 Date allocations per character typed. No
`Intl.DateTimeFormat` instance is cached anywhere in the repo.

### 67. ~96 timer wake-ups per minute at idle, ~85 of them in a hidden tab · high
Ten pollers; only `wasm-connection-manager` is visibility-aware (5s visible /
30s hidden, via a real `visibilitychange` listener) — it is the model the other
nine should copy. ~17 of those are internal-service round trips. The file
manager adds 30/min while open because `getPeers()` returns a fresh array every
call and `setRegisteredPeers` therefore never bails out. The health check
contributes 6/min emitting an event with zero listeners.

### 68. Unbounded retained buffers · high
`receivedFiles: Map<string, Blob>` is never evicted — deliberately, per its own
comment ("user may still want to download") — so every file ever received stays
resident. `progressCallbacks` is omitted from cleanup entirely. The live
document store loads **every document body** (a full Yjs state as a plain
`number[]`, JSON-parsed) just to list titles, and pins them forever: ~16MB
retained to render a list of names. `notification-service` constructs a `new
AudioContext()` per notification and never closes it — browsers cap these at
about six, after which construction throws into an empty catch and notification
sounds silently stop working.

### 69. N+1 round trips on the message store · high
`updateMessageInPages` scans backwards one awaited IPC round trip **per page**
until it finds the id — up to 100 sequential round trips to ack or edit an old
message in a large conversation, and every ack takes this path. Loading the
conversation list is one round trip per conversation, serialised.

### 70. A side effect during the render phase · high
`NotificationItem` calls `notificationService.markAsRead` inside render, which
mutates a service and fires its subscribers — re-rendering the list that
invoked it. Unsafe under concurrent React, and self-triggering. Correctness bug
as much as a performance one.

**Recorded as already excellent:** the `prependMessages` referential-equality
bailout; `CallProvider`'s `sameQualities` guard with its comment "or every tick
re-renders the call surface"; `PermissionsContext`'s fully memoised value; the
conversation-manager's hard caps; `main.tsx` keeping dev-only services behind
`import.meta.env.DEV` with dynamic imports; and stable domain-id keys across
nine list surfaces.

## Round eight — error handling and failure propagation, 2026-08-26

The structural finding: **four correct implementations of the mechanisms this
codebase needs, all with zero production callers.** `use-async-data.ts`
(loading/error/race-safe fetch) — 0 consumers, replaced by ~40 hand-rolled
try/catch with no error state. `retry-utils.ts` (capped, jittered, rethrows) —
0 consumers, replaced by five hand-rolled copies, none with jitter, two without
caps. `WorkspaceService.sendRequest` (correlation + 15s timeout) — reachable
only from the Playwright harness, labelled "for testing". And `debugLog` is a
no-op in production, ending **128 of 271** catch blocks.

### 71. The reconnect toast reported success over a dead socket · critical — FIXED (6ce1685)
My own regression. Recorded because the shape recurs: an idempotence guard is
only as safe as the least careful teardown path that feeds it.

### 72. The workspace protocol is fire-and-forget with no timeout · critical
29 of 31 operations return `Promise<void>`. `setLoading` accepts a `requestId`
and ignores it; `trackRequest` is now an explicit no-op. So a node, member,
permission or group operation that never gets a reply produces a permanent
spinner or a false empty state, and the server drops refused requests with a
`warn!` the client never sees. The correct implementation — correlation plus a
15s timeout — exists as `WorkspaceService.sendRequest` and is used only by
tests, so **the suite structurally cannot observe the failure mode users hit**.

### 73. A wrong password renders as "Something went wrong: Invalid password" · ~~high~~ FIXED (c7eb84b)
`error-messages.ts` tests `errorMessage.includes('invalid password')` in
lowercase, with no `toLowerCase()` anywhere in the file. The SDK emits
`"Invalid password"` with a capital I, and `.includes()` is case-sensitive — so
the branch never matches. The mapping layer built for the product's
highest-frequency error never fires for it. `getUserFriendlyErrorMessage` is
used in four files; every other error surface bypasses it.

### 74. A failed P2P send is persisted as `pending` · high
`message-sender` correctly sets `status = 'failed'` and rethrows — in memory
only. After a reload the message reads `pending`, so the retry button and the
error text (both gated on `'failed'`) are gone, and `resendMessage` refuses to
act. Permanent silent divergence, with the fix — `updateMessageInPages` — 60
lines below in the same file.

### 75. P2P message content is broadcast to every localhost client on a stale UUID · high
`peer/connect.rs` falls back to broadcasting when the target TCP uuid is not
found. The comment condemning exactly this sits in the sibling file:
"a previous version broadcast to every live TCP entry as a workaround for
stale-UUID delivery, but that leaked P2P message content to any other session
multiplexed through the same internal-service process." Fixed there, still live
here.

### 76. `resolveReady()` has no reject path · high
`readyPromise` captures only `resolve`, so failure is structurally
unrepresentable: `waitForReady()` returns normally after a failed init to three
callers. On the landing page that becomes `getActiveSessions() → []`, rendered
as "no sessions to resume" — so the user logs in fresh and orphans their live
session. The same defect exists independently in `p2p-messenger-manager`. The
correct ready-gate, with a reject path and a timeout naming the peer, is
`checkstate-manager`.

### 77. Uncapped retry that reports nothing · high
`reconnect-logic` increments an attempt counter used only to compute delay —
there is no maximum. It settles at a 5-minute interval and retries forever,
including for non-retryable failures like a changed password. `attempt.lastError`
is written and never read. The same file documents fixing this exact class of
bug on the SUCCESS path; the failure path was never touched.

### 78. A one-way circuit breaker · medium
`wasm-connection-manager` latches open after 5 failures — 25 seconds of backend
unavailability — for the life of the page. `resetCircuitBreaker` has zero
callers. The send path bypasses the breaker, so messaging survives; the
background keep-alive does not, degrading idle inbound delivery and ACKs.

### 79. The error boundary's retry button is unreachable · medium
`error-boundary` returns `this.props.fallback` before the default UI, and the
"Try Again" button exists only in that default UI. Both mounts pass a fallback.
Reload is the only recovery from a render error.

### 80. A metadata PARSE failure shows the initialize-workspace modal · medium
`useWorkspaceEventSetup` maps a parse error to `isInitialized = false`, which
becomes `needsWorkspaceInitialization: true`. Given that workspace metadata is
shared, re-running initialisation against an already-initialised workspace is
not benign.

## Round nine — the installed mobile PWA, 2026-08-26

Six one-line-ish defects fixed (aa68b7f). Two findings are product decisions.

### 81. Pull-to-refresh reloaded the app · high — FIXED
### 82. The keyboard covered the composer · high — FIXED
### 83. The offline banner covered the whole top bar · high — FIXED
### 84. `new Notification()` threw on Android inside the message path · high — FIXED
### 85. Neither background image survived offline · medium — FIXED
### 86. The offline banner promised delivery it could not make · high — copy FIXED, outbox open
There is no outbox: a send while offline throws, the message is marked failed,
and the only recovery is a per-message retry button in a bubble the user has
likely scrolled past. ILM's reliability layer does not cover this — it handles
"peer offline", and when the DEVICE is offline the throw happens before ILM
sees the message. The drain loop is the only missing piece: `resendMessage`
already exists, preserves `message.index`, and guards on `status !== 'failed'`.
Wire it to `window.online` plus WebSocket re-establish, then restore the
original copy. **Do not restore the copy without the drain.**

### 87. The installed phone PWA cannot reach an agent in any shipped topology · **product decision**
The app derives its socket from the page host, and nginx serves `/ws` only when
the Host is loopback AND `WS_PROXY_ENABLED=1` — which the Dockerfile defaults
off and the production compose sets to `0`, with the header comment stating
"THE UI SERVED HERE CANNOT REACH AN AGENT, BY DESIGN." The app already knows:
`agent-download.ts` returns no downloads for a phone UA, and the failure modal
says "this device cannot host one."

So install from the home screen, tap Login, and get a dialog explaining the
device cannot host the thing it needs — with no path forward. Meanwhile the
manifest ships narrow-form-factor screenshots and phone shortcuts advertising
that install.

Either build a remote-agent pairing path with real authentication on the agent
socket, or stop framing the phone as the primary surface. The honest interim is
to detect a non-loopback host on a touch device on the LANDING page, before the
user installs and tries. **Not taken unilaterally.**

### 88. No reconnect on resume · high
Zero `visibilitychange` handlers touch the socket, and there is no `pagehide`,
`freeze`, `resume` or `pageshow` handler anywhere. iOS closes WebSockets on
background, so returning to the app after minutes leaves recovery to a 60s
poller with backoff — whose own timer was throttled while suspended. P2P is
worse: it recovers only after C2S does. The fix is ~6 lines: on
`visibilitychange → visible` and on `online`, call the already-public
`serverAutoConnectService.triggerReconnect()`.

### 89. Nothing notifies a backgrounded phone · high, partly structural
The JS is suspended when backgrounded, so `document.hidden` notifications can
only fire in the narrow window before suspension. There is no Web Push: no
`PushManager`, no `push` listener in the built sw.js, no `setAppBadge`. For a
messenger this is the defining mobile gap, and it is entangled with 87 — push
needs something server-side to push from, and the agent is local by design.

### 90. iOS gets no install affordance · high
`InstallAppButton` returns null unless `beforeinstallprompt` fired, and Safari
does not implement it — so on iPhone the button renders nothing in both places
it is mounted. The detection for an existing iOS install is already written
(`navigator.standalone`); only the "tap Share, then Add to Home Screen" hint is
missing.

### 91. The WASM binary is not precached, and ships twice · medium
`globIgnores` excludes `*.wasm`, so the only path into the cache is a
StaleWhileRevalidate route that populates on first successful fetch — and the
landing page deliberately does not force init. Install from the landing page,
go offline, launch, tap Login: the shell loads and the fetch has never
happened. Also, dist ships two copies of the 2.44MB binary; only one is
fetched.

### 92. No socket liveness check · medium
`INTERVAL.HEARTBEAT_MS` is documented as the WebSocket keep-alive and is used
by three things, none of which is a heartbeat. `isConnected()` returns
`isInitialized && client !== null` — a flag, not a round trip — so the health
check reports healthy for ten seconds at a time on the strength of not having
been told otherwise. Carrier NAT reaps idle TCP at 30-120s; the classic symptom
is a chat that looks connected and silently stops receiving.

**Recorded as already excellent:** zero `100vh` in the tree against 28 uses of
`dvh`/`svh`, including dialogs and every auth card; the deliberate choice of
`apple-mobile-web-app-status-bar-style: default` over `black-translucent` with
the reason written down, so nothing is clipped on a notched device; dev
services and the whole P2P graph behind dynamic imports to keep them off the
entry chunk; Radix long-press context menus with `WebkitTouchCallout: none`;
`FileDropZone` putting click, keyboard and drop handlers on one element; and
elapsed time measured from `Date.now()` deltas everywhere rather than counted
in ticks, so a suspended tab resumes with correct arithmetic.

## Round ten — the wire contract, 2026-08-26

### 93. The sender-CID fix was never carried to its sibling handler · high — FIXED (b979c32)
Second occurrence, so the follow-up is `scripts/check-sender-identity.mjs`
rather than a third repair.

### 94. `Batched` passed a request_id where the connection uuid belongs · high — FIXED (d8ad091)

### 95. There is exactly one version field in the whole system · high
`MEDIA_WIRE_VERSION` is written on one message and read at one site, inside
`handleInvite` only — no other call signal carries it, media frames carry none,
and the comparison is exact equality, so a rolling upgrade of the call feature
is a hard cut in both directions. Everything else on every wire —
InternalServiceRequest/Response, WorkspaceProtocolPayload, P2PCommand,
RevfsOperation, WireWrapper, ILM Payload — has **no version field at all**.

### 96. No `#[serde(other)]` on any protocol enum, and the skew is already committed · high
Zero hits for `serde(other)`, `deny_unknown_fields` or `untagged` across all
four Rust trees. So every unknown variant kills the **whole message**, not the
field: a new `Permission` variant makes an old client lose the user's entire
permission list; a new response variant makes the WASM client drop the frame
with no correlation, so the caller's promise never resolves.

And it is not hypothetical. `diff -rq` shows the generated `bindings/` and the
hand-copied `client-ts/src/types/generated/` already differ: the client is
missing `Permission::Themes`, `DomainPermissions.themes` and the whole
`UpdateWorkspaceTheme` variant. `bindings/` is dated August; the copy is dated
February. `sync-wasm-clients.sh` has a copy step for
`citadel-internal-service-types` and **none** for `citadel-workspace-types`.

Compounding it, `toWasmWorkspaceRequest` is `request as unknown as
WorkspaceProtocolRequest` — one cast that launders every mismatch past tsc.
`UserRole` has five TS definitions, three of them lowercase and therefore
undeserialisable; `PermissionTS` invents five variants that exist in no casing
in Rust.

### 97. A peer-controlled number reaches `new Uint8Array(n)` · high
The Yjs payload type guard checks that `type` is a string starting `yjs_` and
nothing else. `data` and `awareness` then go straight to `new Uint8Array(...)`,
so `{type:"yjs_sync", data: 4294967295}` requests a 4GB allocation, and the
RangeError is swallowed by the event emitter. The same guard lets malformed
bytes into three unguarded `Y.applyUpdate`/`applyAwarenessUpdate` calls, which
leave a half-applied document and a stuck syncState with the Merkle root
silently diverged.

### 98. ILM `Payload::Poll` is missing the destination check its two siblings have · high
`Message` checks `destination_id != local_id`; `Ack` checks `to_id != local_id`;
`Poll` destructures `to_id` away with `..` and checks nothing. A Poll with
`last_received_from_peer: None` then wipes `last_sent` and `last_acked` for
whatever `from_id` it names — so any registered peer can reset delivery
tracking for a **third** peer, causing resends and duplicate delivery.

### 99. A peer-chosen `message_id` becomes a persisted high-water mark · high
`update_ack` is correctly monotonic but unbounded, and the value is persisted.
An `Ack` with `u64::MAX` is stored, and the next boot computes `last_acked + 1`
— panic in debug before ILM initialises, wrap to 0 in release, colliding with
every dedup key. Reachable through the unchecked Poll path too.

### 100. Duplicate chunks complete a transfer and report success · high
Reassembly fires on a chunk COUNT, and `addReceivedChunk` is an unconditional
push. Three copies of chunk 0 with `total_chunks: 3` passes every check, sorts
by index, and produces a corrupt file marked complete at 100%.

### 101. `transfer_id` is an unnamespaced map key · medium-high
`setTransfer` overwrites unconditionally, so a peer reusing an id can clobber
one of my in-flight **outgoing** transfers — and the record is persisted before
any accept decision, so unaccepted offers grow storage without bound.

### 102. A `__bigint__` reviver poisons a peer's RE-VFS tree permanently · medium
The serializer only tags real bigints, so a peer-supplied plain object
`{"__bigint__":"x"}` is written verbatim; on the next load the reviver calls
`BigInt("x")` inside `JSON.parse`, which throws through an unguarded `loadTree`
into a floating `void` call. The tree for that peer never loads again.

### 103. Unbounded state a peer can grow, with the TTL sweeper one directory away · medium
`pending_inbound_messages` (keyed on a peer-chosen destination),
`handler_map` (one entry per unaccepted file offer, forever),
`peer_username_cache` (never removed anywhere in the crate), `Connection::groups`
(insert and get only, not even on GroupLeave), and `receivedChunks`. The right
pattern — `startPendingRequestCleanup` with a TTL — exists in
`instance-inbound-router` and none of them got it.

### 104. The WebSocket path has no message-size cap · medium
The TCP path sets `max_frame_length(64 MiB)` deliberately. A grep for
`max_message_size`/`WebSocketConfig` across the internal service returns zero
hits, and the CBOR decode on peer bytes takes no options and checks no length.

### 105. Group messages are ungated and fan out to every connected client · **design decision**
`SendGroupMessage`, `GetGroupMessages` and `GetThreadMessages` perform no
membership check, while the adjacent `EditGroupMessage` and
`DeleteGroupMessage` arms both verify sender-or-admin. And `broadcast` carries
only `exclude_cid` — no recipient predicate — so a group notification reaches
every connected client.

Verified before reporting: there is **no server-side group membership model at
all** — no `get_group`, no group struct with members. Groups are ad-hoc P2P
conversations, so the server cannot filter what it does not know. This is a
design gap, not a missing line, and the fix is a decision about whether the
server should track group membership. **Not taken unilaterally.**

### 106. Broadcast lag is logged and never signalled · medium
The channel holds 100. A slower client gets `RecvError::Lagged(n)`, which warns
and continues — silently losing group messages, node content updates and
deletions with no sequence number and no resync, so the client cannot even
detect the gap. Needs an unlucky client, not a hostile one.

**Recorded as already excellent:** the per-CID token-bucket limiter with its
reasoning about why per-connection buckets let one user multiply their limit;
`GroupMessage` built entirely from server-side truth with the only clamped
wire-supplied count in the system; the `#[serde(default)] themes` field whose
nine-line comment names the exact skew failure and argues the safe default
direction; the media subsystem's generation capture-and-recheck with four tests
naming the races and per-frame ownership re-checks; and RE-VFS naming OPFS
directories by tree key alone so peer-controlled paths never reach a
`getDirectoryHandle` argument.

## Round eleven — session and identity, 2026-08-26

### 107. A server-initiated disconnect left a zombie app · critical — FIXED (c473cef)

### 108. Every stored CID is erased on every page load · critical
`connection/service.ts` calls `clearSessionCids()` at init and **persists it**.
This contradicts the CID-permanence invariant the architecture rests on, stated
in a banner comment in the same module family, and the field's own doc ("Store
the CID for claiming orphaned sessions"). Downstream, all following from it:
`isOrphaned` is always true after a reload so the non-orphan branch is
unreachable; `postAuthSetup`, `session:activated` and `loadUserRegistration`
never run because the CID lookup never matches; and the workspace switcher
shows no session as active and throws "Session CID not available" on switch.
Fires on literally every reload.

### 109. Multi-account data bleeds across accounts · critical
The LocalDB `cid` argument IS the namespace, and almost every call site passes
`0n`. Exactly one — `p2p-registration-service/connection.ts` — passes the real
`currentCid`. So: chat history is keyed by the PEER's CID with nothing about
which of my accounts is talking, and the sidebar lists the whole namespace, so
every account sees every other account's conversations. Incoming peer requests
sent to account A appear as pending for B, **and B can accept them**.
Notifications render A's previews under B with A's handlers attached. Privacy
settings are one global key.

Sharpest case: the permissions cache is keyed by `domainId` only and is not
cleared on account switch, and the cache grants everything for Admin/Owner — so
**an admin switching to a member account keeps the admin UI**.

### 110. "Remember Credentials" is a switch wired to nothing · high
`storeCredentials` has no read site that gates persistence — the login handler
stores unconditionally. The user turns it off, believes nothing is stored, and
the password is written in plaintext. An inverted-safety control is worse than
an absent one. The same handler also passes `undefined` where the session's
security settings belong and stores `getDefaultSecuritySettings()` instead, so
security level, secrecy mode, encryption algorithm, KEM and signature choice
are all silently discarded on the login path. `useJoinRegistration` threads them
correctly — one path got it.

### 111. Auto-reconnect fires once per tab, then never again · high
`handleConnectionSuccess` reads `username` off `ConnectSuccess`, which carries
only `{cid, request_id}` — so the whole body is dead, `cancelRetry` never runs,
the entry sticks in `reconnectAttempts`, and the reconnect loop skips that
session for the life of the tab. An `as` cast on an untyped `getVariant` result
hid it. The same dead body means `clearUserDisconnected` never runs — and it
has zero callers anywhere — so **signing out bans that account from
auto-reconnect permanently, persisted across browser restarts, with no UI to
undo it**. The file documents fixing this exact "happy path disabled the
recovery path" bug one layer down.

### 112. Unauthenticated credential exfiltration from the internal service · **security decision**
Three links, each documented separately, never composed: the socket does a bare
`accept_async` with no Origin check or handshake auth; `GetSessions` returns
`None` from `session_cid()` so the ownership gate never applies and it iterates
the whole map including every peer relationship; and `LocalDBGetKV` is
hard-exempt from the gate while a CID absent from the map is also let through —
and the credential store lives at CID 0, which is never in the map.

So two frames to `ws://localhost:12345`, from any local process or any page the
user visits, yield every stored account's plaintext password and PSK. Nothing
is logged on the read path.

Compounded by 110 (stored regardless of the switch), by there being **no
credential rotation or invalidation path anywhere** — a repo-wide grep for
change/reset/revoke password returns only `URL.revokeObjectURL` — and by
`serverPassword` being stored in plaintext forever while never being read back
by any connect path.

**Related to the ClaimSession decision already recorded.** Both turn on the same
question: what is a localhost connection entitled to? **Not taken
unilaterally.**

### 113. Registration half-completes and the retry advice is wrong · high
With `connect_after_register`, the service emits no `RegisterSuccess` — it
synthesises a `Connect` reusing the request id, and the account exists the
moment register returns. The client matches `ConnectFailure` only under
`Response` and `SessionAlreadyActive` nowhere, and there is **no transport
timeout on auth at all** while every other websocket op has one. So a
register-OK/connect-rejected produces a 30-second spinner and then "The
connection request timed out" — the real reason discarded. Pressing Join again
says "An account with that username already exists. Please choose a different
username", which is actively wrong: it is their own account from thirty seconds
ago, and no path offers to log in with credentials the app never stored.

### 114. Only one form validates credentials · medium-high
The complete call graph of `credential-rules.ts` is the join form. The login
form validates nothing beyond non-empty and sets no maxLength, so a
24-character password from a password manager is accepted and reported back as
"Incorrect password" — when the product maximum is 17 and it could never have
been registered. Server-side the password check is passed `None`, so the 7-17
rule is enforced by that one client-side gate and nowhere else.

### 115. A guard that is cited in a comment and does not exist · medium
`credential-rules.ts` states "the mirror is guarded: `cargo test -p
citadel-workspace-types credential_mirror` fails if an SDK bump moves any of
these numbers." A repo-wide grep for `credential_mirror` returns exactly one
line — that comment. The numbers are correct today; the guard is fiction, so
the next SDK bump drifts silently.

## Round twelve — build, toolchain and limits, 2026-08-26

### 116. The shipped agent was compiled with `localhost-testing` · critical — FIXED (aff9fdf)
The single most serious finding of the campaign. `tests/common` is a workspace
MEMBER pulling citadel_sdk with that feature, and the internal-service image
built workspace-wide, so cargo unified it in. Per the SDK's own source it
replaces NAT-traversal config encryption with identity functions and skips STUN
entirely — P2P worked in the dev stack, where every hop is localhost, and could
not traverse a real NAT in production. The sibling image had the mitigation and
a comment naming the mechanism; this one never got it. Guarded by
`scripts/check-no-test-features-shipped.mjs`.

### 117. Nothing gated image publication · critical — FIXED (706ecfa)
`publish` had no `needs`; `promote-latest` needed only `publish`. A red master
commit shipped to the tag production pulls by default. `validate.yml` had
declared `workflow_call:` all along and nothing invoked it.

### 118. "Max file size to accept" gated sending, not accepting · high — FIXED (6b0811d)
### 119. verify-session-fixes.sh reported failure against correct code · high — FIXED (76727ab)

### 120. `overflow-checks` on in tests, off in every shipped binary · high
There is no `[profile.*]` in any of the fourteen manifests, so release builds
wrap silently while `cargo test` panics. In a codebase of u64 CIDs, ticket
counters, byte offsets and quotas, that is the divergence most likely to make a
real integer bug pass CI and wrap in production — the suite cannot reproduce
the field failure. One line closes it.

### 121. The module that owns the WASM boundary is linted by nothing · high
`citadel-internal-service/typescript-client` has 109 files, no eslint config,
no lint script and no CI matrix entry. It is also where the type holes
concentrate: `next_message(): Promise<any>`, `send_p2p_message(cid, message:
any)`, and `wasmModule as unknown as WasmModule` with no runtime shape check —
so a stale or partial WASM build asserts complete and fails as "undefined is
not a function". Its three `eslint-disable` comments suppress a linter that
never runs.

### 122. Eight UI guards never run on a UI change · high
All fourteen `scripts/check-*.mjs` are invoked from ONE parent-repo job, and
eight of them scan `citadel-workspaces/src`. The submodule's own workflow has
no equivalent job, and the UI is developed there — so every UI guard runs only
after the pointer bump. The submodule also still has the production-bundle
gates in the typecheck job, which the parent's own comment documents as never
having run because the WASM artefact does not exist there.

### 123. The bundle gates measure a different artifact than ships · high
`production-build` is the only job on Node 22; every other job and
`docker/ui/Dockerfile` use Node 20. It also measures a runner-local `npm run
build` against the committed lockfile, while the image resolves ranges live. So
bundle budget, PWA installability, source maps, Lighthouse, offline, update
flow, reduced-motion and mobile layout all certify a build the registry never
receives.

### 124. Playwright has no `forbidOnly`, and two retries mask ordering bugs · medium
A committed `test.only()` would silently reduce a shard to one test and pass.
There is none today and nothing prevents one. With `workers: 1` against shared
mutable backend state, two retries also make a genuine ordering bug
indistinguishable from infrastructure flake.

### 125. Declared limits enforced nowhere · high
Five file-transfer constants have exactly one occurrence each — their own
definition: max resend attempts, expiry check interval, max chunk size, chunk
timeout, chunk retries. There is no `setInterval` anywhere in
`lib/file-transfer/`. The 7-day TTL is computed, stored, transmitted and read
back, and never compared to `Date.now()`. So a stalled transfer's chunks are
never reclaimed and any chunk size is accepted.

### 126. The advertised storage quota is fiction · high
`max_file_transfer_size_mb` and `revfs_storage_quota_mb` are serialised to
clients and appear at five sites across both Rust crates — struct, Default, two
logs, and the populate. **Zero comparisons.** The transfer-accept path has them
in scope and reads only a bool. The config comment claims "users can set lower
limits per-peer, but not exceed this value"; nothing implements that. The UI's
slider ceiling is a hardcoded constant, not the server's value, so lowering the
server setting changes neither enforcement nor the UI.

### 127. The RE-VFS quota's denominator is supplied by the peer it constrains · high
`storageUsed` sums `fileMetadata.fileSize` over nodes the peer sent in a
`SyncResponse`, which `flipNodeStates` converts to locally-hosted. A peer
reporting `fileSize: 0` zeroes the check; inflated sizes block the user's own
uploads. Never cross-checked against bytes actually stored.

### 128. Unbounded recursion on the permission path · medium-high
`is_member_of_domain` recurses to the parent with no visited set and no depth
cap, under `#[async_trait]` so each level heap-allocates. It fronts `list_nodes`
and `get_tree_structure`. A sibling BFS in `tree_validator` omits the visited
set its two neighbours in the same file have, and `check_no_cycles` exists but
is not called from the Move branch. Whether a client can construct the cycle
decides whether this is DoS-reachable or corruption-only — worth confirming
before ranking further.

**Recorded as already excellent:** the per-CID token bucket keyed on the
authenticated CID with its "one user multiplying their budget" reasoning;
`GetGroupMessages`' server-side `.min(100)`, the only clamped wire count in the
system; `MAX_BYTE_CONTENTS_SIZE_BYTES` checked before `arrayBuffer()` with the
V8 boxing cost explained; dev/prod CSP parity that is byte-identical rather
than asserted; the deploy gate refusing to pass vacuously; and the file-upload
path's 0700 root, RAII byte reservation, TTL sweeper and startup sweep.

## Round thirteen — state, layout, PWA lifecycle, 2026-08-26

### 129. A DM switch leaked the previous peer's messages into the new thread · critical — FIXED (cb5f204)
Confidentiality, not cosmetics. No `key` on `<P2PChat>`, `useP2PMessages` resets
only on a FALSY peerCid, and `mergeMessages` dedups by id alone — so Alice's
messages merged into Bob's thread and rendered under Bob's name. Every live
subscription in the same feature IS peer-scoped, each with a comment naming
this hazard; only the switch path was missed. Same key fixed the group
composer, which was pairing a stale draft with the current groupId.

### 130. File-manager selection never reconciled with the grid · critical — FIXED (087137a)
### 131. Accepting a PWA update force-reloaded every other window · critical — FIXED (434e048)
### 132. overflow-checks off in release · high — FIXED
### 133. No forbidOnly in CI · medium — FIXED

### 134. Nine `max-h` ScrollAreas clip with no scrollbar · critical
`ui/scroll-area` puts the caller's class on the Radix ROOT, whose height stays
`auto` under a `max-height` — so the Viewport's `h-full` resolves to auto, no
scrollbar appears, and the Root's `overflow: hidden` amputates the rest. The
"View all N members" dialog — whose entire purpose is escaping the sidebar's
5-member cap — shows about 7 of 40. Group member management loses the role
selector and kick button for members 9+. The working call sites use `flex-1` or
a definite `h-[...]`, which is the fix.

### 135. A ringing call during any open dialog is visible, un-clickable and aria-hidden · critical
`IncomingCallCard` is z-60 so it paints above a z-50 Radix modal — but every
Radix layer sets `body { pointer-events: none }` and `hideOthers()`, so Accept
and Decline do nothing and a screen reader cannot see it. `LoadingModal` at
z-100 hides it entirely, so a call arriving during a workspace switch is both
invisible and inert. A missed call with a working-looking UI is the worst
failure mode a calling feature has.

### 136. Pasted URLs escape the 1:1 chat bubble · high
`TextBubble` renders `whitespace-pre-wrap` with no `break-words`; its sibling
`GroupMessageItem` has both. A pasted link has no soft-wrap opportunity, so it
paints outside the bubble and is cut at the panel edge. The most common long
string a chat user produces. Related: the detailed `min-w-0` post-mortem in
`TextBubble` describes a `<pre>` overflow — but TextBubble renders plain text;
`MarkdownBubble` is the one with the `<pre>`, and it has no `min-w-0` at any of
its three levels.

### 137. The installed app is silent when open but unfocused · high
Notifications gate on `document.hidden`, which stays false for a standalone
window sitting behind the user's editor — the app's most common posture. There
is no `hasFocus()` check and no `setAppBadge`, so an incoming message produces
no signal at all.

### 138. "Ready to work offline" is a promise the app cannot keep · high
`state.workspace` comes only from a live `GetWorkspace` round trip, and
`WorkspaceLoader` gates every authenticated route on it. Offline, the user gets
~2.5s of leader election, then "Loading workspace…", then a redirect to
/connect — with their entire message history on disk and unreadable. The app is
offline-loadable and not offline-usable.

### 139. Every launch lands on the marketing page · high
`start_url` is `/`, Landing explicitly declines to auto-navigate, and the only
route memory is `useState`. A daily user gets the hero every time and must pick
their session from the navbar. Manifest shortcuts are discarded too: the
re-auth path is a bare `navigate('/connect')` with no redirect target.

### 140. `citadel:file-transfers` is write-only accretion · high
Three references: the declaration, the read inside its own writer, and the
write. Nothing reads it, nothing prunes it, and every state transition
re-parses and re-stringifies the whole map against a 5MB cap. The same pattern
was diagnosed and fixed in `WorkspaceEventHandler`, with the reasoning written
down; it was never propagated here. First casualty at quota is
`saveSettings`, whose catch is `// Silently fail` — so turning auto-accept OFF
appears to work and reverts on next launch.

### 141. Sign-out leaves nearly everything · high
It removes the agent-side session and one tabContext row, then says "You have
been fully logged out." Surviving: every transfer record and per-peer setting,
`session_last_accessed_*`, `peer-first-seen:*`, recent servers, all three
settings blobs, every OPFS tree, orphaned tabContext rows, and the entire
precache. There is no "clear local data" anywhere.

### 142. A precache install failure is silent and retries forever · high
Any 404 on any of the 41 precached entries rejects install; `onRegisterError`
does not fire for that. The user stays on the old build indefinitely, with no
signal — while two hourly checks plus every visibilitychange and online event
re-download ~2.7MB and fail again.

### 143. Two closed loops with no exit · high
The `VersionError` recovery button unregisters the SW and reloads, which during
a real rollback re-serves the same older build and the same error. And a render
crash unmounts the only code path that can apply a waiting update, while the
error screen's Reload re-serves the same precached shell.

### 144. Count and format vocabulary is unowned · medium
Five unread badges with four different cap rules, two of them in the same
sidebar list; three "1 items" bugs; nine byte formatters with five vocabularies,
seven of them indexing `sizes[i]` unbounded so a 1TB file reads "1 undefined"
and 1,048,575 bytes reads "1024 KB". `use-call-duration` never carries to
hours, so a 3-hour call reads "180:00".

## Round fourteen — Rust server correctness and first-hour UX, 2026-08-26

Two parallel audits: the workspace server kernel, and everything a user meets in
their first hour. The server findings are the most severe of the campaign so far,
because they corrupt durable state rather than mis-rendering it.

### 145. `ListMembers` read one copy of the roster and the mutators wrote the other — FIXED

The root workspace is stored twice: as a `Workspace` record, and denormalized
inside `Domain::Workspace`. `UpdateWorkspaceTheme` documents keeping the two in
sync as the invariant "every other workspace mutator also writes". Both
membership mutators — `add_user_to_domain` and `remove_user_from_domain` — wrote
only the `Workspace` record, and `ListMembers` reads the `Domain` copy **first**.

**No race required.** An added member never appeared in the roster; a removed one
never left it. Meanwhile `is_member_of_domain` reads the fresh `Workspace`
record, so enforcement was correct — the displayed roster and the enforced roster
disagreed permanently and in both directions. An admin removing someone saw them
stay listed forever, while their access was in fact already gone.

Fixed by adding the `insert_domain` write to both root branches.
`tests/workspace_membership_visibility_test.rs` reads through `ListMembers`
rather than the backend, because at the backend layer each copy looks fine on its
own — the defect only exists in the relationship between them.

### 146. Every workspace except the seeded root was unreadable by everyone — FIXED

`is_member_of_domain` special-cased `domain_id == WORKSPACE_ROOT_ID` and looked
everything else up as a `DomainNode`. Every workspace `create_workspace` mints
gets a UUID and is stored as a `Workspace`, never as a node — so the node lookup
missed, and membership returned `false` to **everyone, including the creator**,
who had been written into `members` two lines earlier. Global Admin did not help:
this path calls `is_member_of_domain` directly and has no admin short-circuit.

The record, its `Domain` twin, its password entry and the creator's Admin grant
were all written and then permanently unreachable. `list_workspaces` filters
through the same predicate, so it never appeared in any listing either.

Fixed by trying `get_workspace` first for any id — it returns `None` for a node
id, so one lookup covers every workspace instead of one.

### 147. Two member handlers did an unguarded read-modify-write on the whole node map — FIXED

All `DomainNode`s live behind one key. `lock_nodes()` exists for exactly this and
its doc names the hazard; `create_node`, `delete_node` and `move_node` each take
it. The two membership handlers did not — and **a mutex only excludes
participants**, so the other three locking correctly bought nothing.

A member add overlapping a room creation loads the pre-insert map and saves it
back. The room is not orphaned, it is **erased** — after `create_node` has
already returned success and the client has rendered it. Nothing detects it; the
next read simply does not have it.

Fixed by taking `lock_nodes` across both cycles. Deliberately **not** covered by
a test: a scheduling interleaving cannot be asserted deterministically here, and
a probabilistic test that usually passes is worse than none. The structural
guarantee is that all five mutators of this map now take the same lock.

### 148. Recorded, not fixed — needing a decision or a larger change

- **`update_node`'s read-modify-write spans the lock** (`async_node_ops.rs`).
  `get_node` reads outside, `update_node` re-inserts the stale struct wholesale
  inside. A rename racing a move yields `N.parent_id == P1` while `P1.children`
  lacks N and `P2.children` has it — three mutually contradictory facts. A
  non-cascade delete of P1 then succeeds (the emptiness check reads `children`)
  and strands N permanently unreachable. `TreeValidator::validate_tree` exists
  and is **called from tests only** — the tree's consistency checker was written
  and never wired to anything.
- **Pagination drops same-millisecond messages** at every page boundary. The
  timestamp is the only cursor, the filter is strictly `<`, and `has_more` is
  computed on the already-filtered set — so the client sees a consistent-looking
  stream with a hole in it. Also `limit: Some(0)` yields `has_more = true` with an
  empty page, which loops a paging client forever.
- **`set_role_permissions` replaces rather than merges**, so any later
  `AddMember` or `UpdateMemberRole` silently destroys explicitly-granted
  permissions. Related: `add_user_to_domain` sets the **global** `user.role` from
  a **per-domain** role argument, so adding an existing Member to one room as
  Guest demotes them everywhere.
- **Cascade delete deletes nodes and nothing else** — chat history is left
  resident and unreachable (`chat_channel_id` is only ever written, never read, so
  nothing could ever find those blobs again), permissions entries persist, and
  `delete_workspace` leaves its `DomainNode`s behind still carrying `members`, so
  the content of a deleted workspace stays readable to anyone holding a node id.
- **`group_id` is never validated** on `SendGroupMessage` — any authenticated user
  mints unbounded durable keys. Adjacent to the already-recorded group
  authorization gap, but the key-minting side is distinct from it.
- **`default_permissions` is configured, persisted and never read.** An operator
  who sets per-office defaults in `server.toml` gets a value that is stored and
  ignored. Likewise `Workspace.offices`, whose only writers have no callers.
- **`list_nodes` depth filtering is nondeterministic** — `base_depth` is taken
  from `HashMap::values().first()`, and the filter admits both depth-0 and
  depth-1 starts, so the same request returns a different subtree run to run.
- **Master passwords are stored in plaintext and compared with `==`** (not
  constant-time), and `update_workspace` sets `user.role = Admin`
  unconditionally on every successful call, not only for the first claimant —
  contradicting the constructor comment that documents first-claimant semantics.

### 149. First-hour UX — the core loop is gated on a number the product never shows you

Ranked by how many new users hit each in their first hour:

1. **Messaging anyone requires a decimal CID.** The input is unlabelled
   (`"Enter peer CID..."`), accepts `/^[0-9]+$/` only, and its error points at
   "the directory" with no link — and the directory searches only *existing
   members*, so it can never surface the one person a new user needs. There is
   nowhere in the UI showing your own CID to share.
2. **Nothing distinguishes "not accepted" from "offline" from "network down",**
   and `canSendMessages` is hardcoded `true`, so the composer is never disabled.
   Every failure reads "Check your connection and try again" — a social state
   reported as a network fault. A newcomer goes and debugs their wifi.
3. **The login form's Server Address field is inert** (`connect()` takes no
   address parameter; a comment states the protocol stores it from registration),
   **`Remember Credentials` has zero consumers repo-wide**, and the security
   settings chosen at login are discarded. Every returning user meets all three.
4. **The Privacy tab operates on nothing** — six controls persist to
   localStorage and nothing reads any of the keys. `Screenshot Alerts` promises
   something a browser cannot do, in a product that sells privacy.
5. **Step 2 of 3 of signup is a cryptography configuration screen** — KEM
   Algorithm (one option), Header Obfuscator Mode, ML-DSA-65 — whose four help
   tooltips restate their own labels and sit on non-focusable `<svg>`s.
6. **An empty workspace serves the Markdown tutorial that was explicitly written
   out of the product.** `node-content.ts` — the best product writing in the repo,
   explaining offices, rooms and permission inheritance in plain English — renders
   only when a node exists. With zero nodes the fallback is the old
   `MDX Editor Showcase`, which also makes two false claims about the page it is
   on ("Content is automatically saved as you type"). Its Edit button is enabled
   (no `domainId` means no permission check) and Save permanently returns "This
   page is still loading" — an infinite retry loop with no correct action.

One concept has six names: **Connect** (button) → **registration request**
(error) → **Awaiting Response** (status) → **Registered** (presence) →
**Connected** (badge) → **Pending Connection Requests** (the peer's modal). A
newcomer cannot build a mental model from that, and the one document that
explains the model is the unreachable one above.

## Round fifteen — delivery integrity and the deployment path, 2026-08-26

### 150. Accepting any incoming file transfer threw before anything was sent — FIXED

A transfer arrives as two independent events that name it differently: the bytes
over the protocol's `SendFile`, carrying a numeric `object_id`, and the bubble as
an ordinary P2P message carrying a `crypto.randomUUID()`. Accept goes back over
the protocol, so it must name the `object_id` — and the accept path passed the
UUID into `BigInt(params.protocolId)`, which throws `SyntaxError` synchronously
while the request literal is built, **before `sendRequest` is reached**.
`RespondFileTransfer` was therefore never issued for any incoming transfer.

`registerTransferMapping` was written to bridge the two id spaces and had no
callers. `onTransferRequest`, the subscription that learns the `object_id`, had
no callers either. Both halves of the join existed and neither end was connected.

Fixed with a correlator joining on (sender, file name, exact byte size) — the
only thing both sides independently describe, since the absence of a shared id is
the whole problem — handling both arrival orders. **The existing accept test
mocks `io` wholesale, so the mock stood exactly where the defect was**; the new
test drives the real router and mocks only the socket.

### 151. The production server image could not be built at all — FIXED

`docker/workspace-server/Dockerfile` substitutes its own root manifest, so the
real `Cargo.toml` is never seen by that build. A dev-dependency added to
`citadel-workspace-types` and defined in the real root only left the image
failing at manifest load — `cargo clippy` never started, and the message named a
dependency rather than the duplicated file responsible. **No local cargo command
can catch this**, because locally the real manifest is correct. Guarded by
`scripts/check-docker-workspace-manifest.mjs`.

### 152. Recorded, not fixed — delivery integrity

- **A persistence failure silently discards an incoming message.**
  `addMessageToConversation` pushes to memory, then awaits a LocalDB write that
  can reject on timeout. The rejection unwinds past the ACK, the render
  notification and the desktop notification — all inside the same `if (wasAdded)`
  — into a catch that logs *"Failed to deserialize P2P command"*, which it did
  not. The message sits in memory, unpersisted, with no subscriber ever told.
- **Outgoing message status is never persisted.** `sendMessage` writes the
  message while still `pending` and then mutates `status` in memory only; the
  sibling `resendMessage` does call `updateMessageInPages`, proving the author
  knew. So after a reload every sent message reads back as `pending` and renders
  a "sending…" clock, and retry is gated on `failed` — a message that genuinely
  failed can never be retried. Retry is doubly broken across a reload:
  `resendMessage` looks the message up in `conversation.messages`, which
  `loadFromStorage` rebuilds empty.
- **"Delivered" and "read" are inferred from wall-clock comparison.** One ACK
  promotes every earlier message with a smaller timestamp — including one that
  was handed to the transport and never arrived. The double-tick is a guess, and
  it is wrong precisely in the case that matters. The ACK is also never scoped to
  the peer who sent it: `peerCid` is in hand and not passed, and the handler then
  scans all conversations by id.
- **Ordering is the sender's clock**, and the same comparator writes the page, so
  a skewed peer's misordering is persisted. The `index` field exists on every
  message and is unusable for ordering, because `lastMessageIndex` is a max
  across both directions and the two peers' sequences collide.
- **Page rollover is two writes with no transaction** — and the code says so in a
  comment. If the metadata write fails after the page write, the next append
  rolls over again and overwrites the page just written, losing exactly one
  message with no error anywhere.
- **File-transfer records are written to a `localStorage` key nothing reads**,
  inside a `catch {}` that cannot distinguish a quota error from success. After a
  reload every handler's `if (!transfer) return;` drops completions and
  cancellations in silence.
- **Duplicate chunks would count as progress** — both the completion trigger and
  the integrity check compare a count, not distinct indices, so a duplicate plus
  a gap passes validation and produces a corrupt file marked complete. Latent
  only because the chunk path is currently unreachable; it goes live the moment
  `sendChunk` is implemented.

### 153. Recorded, not fixed — deployment and upgrade

- **A fresh production install builds from source instead of pulling**, and
  `docs/INSTALL.md` states the opposite ("both pull prebuilt images"). Two of the
  three services carry a `build:` block beside `image:`; the compose file itself
  documents why that is wrong — but only for the third. A ~5.6 GB Rust toolchain
  build, requiring submodules the docs list as development-only, on first
  contact. **The correct fix was applied to exactly one of three services.**
- **Persisted server state has no forward-compatibility discipline.** The entire
  node tree is one JSON key. The repo already paid for this once and wrote the
  lesson out verbatim in a comment on the one field that has `serde(default)` —
  and there are exactly two in twelve persisted structs, no `serde(alias)`
  anywhere, and no test that deserializes a previously-written record. The next
  field added without a default takes out every office and room on the first
  restart after upgrade. `CURRENT_SCHEMA_VERSION` exists with the migration slot
  as a comment, so bumping it stamps un-migrated data as current.
- **The schema-version gate runs after the writes it exists to prevent** —
  admin injection and workspace seeding happen first, so by the time it refuses
  to start, the older binary has already mutated a forward-migrated store.
- **`[file_transfer]` limits are advertised and enforced nowhere on the server.**
  Only `allow_server_file_transfer` is checked; size and quota enforcement lives
  solely in the browser. `file_ttl_days` is entirely dead — "pending transfer
  requests expire after this period" is false, nothing expires. And `ServerConfig`
  has no `deny_unknown_fields`, so a misspelled table name falls through to
  defaults that enable both flags: **an operator disabling server storage via a
  typo enables it instead.**
- **No wire-protocol versioning and no request correlation** on the workspace
  protocol. This matters more than usual because each user runs their own agent
  outside the operator's control, and neither INSTALL nor UPGRADING tells them to
  refresh it. A version skew produces a UI waiting forever rather than an error.
- **`is_healthy()` has zero callers** — every healthcheck is a bare TCP probe, so
  a server that binds but cannot reach its backend reports healthy and passes the
  deploy gate.

## Round sixteen — multi-tab identity, loading state, light mode, 2026-08-26

### 154. Duplicating a tab produced two permanent leaders — FIXED

The instance id lives in `sessionStorage`, and its comment claimed it "survives
page reloads but not new tabs". Chrome and Safari **copy sessionStorage** into
the new context on Duplicate Tab. The twin booted with a byte-identical id, and
the channel's self-traffic filter — `senderInstanceId === instanceManager.instanceId`
— then made the two completely invisible to each other. Neither saw the other's
heartbeat or election claim, so both took the "no heartbeat ever received" branch
and both became leader, permanently: two WebSockets from one browser, each
claiming every session away from the other, every directed message handled twice.

No storage survives a reload but not a duplication, so this could not be fixed by
changing store. Messages now carry a per-DOCUMENT nonce generated at module load
and never persisted; a document that sees its own id from another document
re-rolls, and exactly one of the pair yields because both compute the same
comparison from the same two values.

### 155. Every workspace open said "your workspace is empty" while loading — FIXED

`emitLoadingEvent` had **one** call site in the codebase. `state.loading.nodes`
and `.members` were therefore permanently false, and TreeNodesSection's
`if (!isLoading && !treeData)` fired on every open. The `"Loading..."` arm inside
that branch is unreachable by construction — which is precisely why it read as
correct to every reviewer. The office skeleton component was likewise never
reachable.

The listeners that LOWER the flags were already present and correct. Only the
raise was missing. Fixing it required adding the deadline at the same time, or
the fix would have introduced the opposite failure: `listX()` resolves when the
request is SENT, so a lost response would have spun forever.

### 156. Light mode painted white on white — FIXED

`getBubbleStyles` returned `bg-surface text-white` for a failed message, and
`--surface` in light mode is 96% lightness: about **1.08:1**. A light-mode user
whose message failed could not read what they had tried to say. Thirteen further
literal whites in `components/p2p` made hover feedback vanish, the file-transfer
progress *groove* invisible, and markdown rules disappear.

The palette lint guard anchors on `-[0-9]`, and white and black carry no numeric
suffix, so it walked past all fourteen. The new rule covers
`text-white`/`text-black`/`bg-white` only — `bg-black/N` scrims and the colour
picker's `border-white` are correct code, and banning the broad class would have
produced 28 findings of which 22 were fine, which is how a guard gets switched
off.

### 157. Also fixed this round

- **A sent message's status never survived a reload.** Both send paths mutated
  `status` in memory only, so every message read back as `pending` — and retry is
  gated on `failed`, so a message that genuinely failed could never be retried.
  `resendMessage` did persist, but only after a `catch` that rethrows, so it too
  recorded 'sent' and never 'failed': the one status worth keeping was the one
  guaranteed to be lost.
- **An arrived message was discarded when its write failed.** The rejection
  unwound past the ACK, the render and the notification. It now renders, and
  deliberately does NOT ack — claiming delivery for a message that will be gone
  on reload is a lie that outlives the message.
- **Deserialization and handling shared one catch**, so a storage timeout was
  logged as "Failed to deserialize P2P command". A wrong diagnosis is worse than
  no log: it sends the reader to the wire format when the wire format was fine.

### 158. Recorded, not fixed — multi-tab and session lifecycle

- **A promoted tab whose WebSocket creation fails becomes a permanently dead
  leader for the whole browser.** The promotion handler is `async` and its
  rejection cannot be observed by the emitter's `try`, nothing retries, and the
  tab keeps winning every subsequent election — so every request from every tab
  is answered "WebSocket not ready", forever. There is no self-demotion path.
- **The outbound queue is never started and never drained on failure.**
  `OutboundQueue.start()` has no caller, so the retry/timeout machinery is dead;
  meanwhile `sendToLeader` resolves an error on timeout **without removing the
  entry**, and every later leader change replays it. A request the user was told
  had failed is silently re-executed on a later connection — repeatedly.
- **Closing a tab can release another tab's live session.** The decision reads
  `knownInstances`, which is only populated when another tab pushes its CID, and
  `handleInstanceAnnounce` does not make existing tabs answer — so a
  second-opened tab never learns the first's CID and releases on close. The
  leader performs the release with no ownership check.
- **A fresh tab adopts another tab's CID** from a broadcast `ConnectSuccess`,
  because the ownership test admits any tab that has not yet picked a session.
- **P2P auto-connect polling stops on a socket drop and is never restarted** —
  both restart paths are unreachable after the first page load, so the socket
  comes back and the P2P layer does not.
- **A tab that booted as leader never registers the demotion handler**, because
  that listener is registered only in the follower branch — so the first tab in
  a browser keeps its socket open after demotion. The comment above it describes
  fixing exactly this failure for the other case.

### 159. Recorded, not fixed — PWA polish

- **The offline banner is z-40 and every surface shown while offline is above
  it** (the opaque z-50 workspace loader, the z-100 LoadingModal, four z-50 auth
  modals). It also overlaps content: it starts at the exact y where the fixed
  TopBar ends, with no compensating padding. `useOnlineStatus` has two consumers
  and no action, button or form consults it.
- **Cached conversation history exists on the device and the app refuses to show
  it offline**, because `/messages` sits behind a loader gated on
  `!state.workspace`, which is only ever populated over the network.
- **The four signup-wizard overlays are not dialogs** — no `role`, no
  `aria-modal`, no focus trap, no focus restoration — and Escape works on two of
  the four. One of them is also nested inside a real Radix dialog, so its scrim
  double-paints and Escape both closes the panel and navigates the user out.
- **`LoadingModal` blocks clicks invisibly for 300ms** — no `pointer-events-none`
  on the `opacity-0` state, and under reduced motion the fade is instant while
  the transparent z-100 sheet still covers the viewport.
- **The only framer-motion animation ignores reduced motion.** It animates height
  via inline styles, so the reduced-motion stylesheet has nothing to act on, and
  the CI gate only probes two CSS classes on the landing page.
- **Three different scrim opacities**, recovery-screen buttons bypassing the
  `Button` component (no focus ring on the screens that most need to look
  competent), and a second error-toast system overlapping Sonner in the same
  corner.
- **The social preview image is 220x154** — below both Twitter's and Open
  Graph's minimums — and both image URLs are relative where Twitter requires
  absolute.

## Round seventeen — leader recovery, editor data loss, call and notification seams, 2026-08-26

### 160. A leader that could not serve never yielded — FIXED

Promotion is handled by an `async` listener, and `emit` invokes handlers
SYNCHRONOUSLY — so the rejection from `createWebSocketAsLeader` escaped the
emitter's own try/catch and nothing observed it. The tab stayed `isLeader`, kept
winning every subsequent election, and answered every request from every tab in
the browser with "WebSocket not ready". Permanently: the yield branch only fires
on a competing heartbeat, which never arrives while this tab broadcasts its own.
`relinquishLeadership` demotes, broadcasts goodbye, and stamps a cooldown so the
tab that just failed does not immediately re-claim and fail again.

### 161. A failed request was silently re-executed at every later leader change — FIXED

`sendToLeader`'s ACK timeout resolved an error but never removed the entry — the
ACK path calls `acknowledge()`, the timeout path did not — and `onLeaderChange`
replays every queued entry. A Connect, a workspace mutation or a P2P message the
user had already been told had failed was re-sent to the next leader, and again
at every leader change after that.

The replay was ALSO a black hole whenever the tab that owned the queue won the
election: BroadcastChannel never delivers to the posting context, so posting to
'leader' addressed nobody. The retry subscription's own comment describes a
recovery that only ever worked when some other tab won.

### 162. The MDX editor lost the user's work to unrelated re-renders — FIXED

`content` is the controlled value of the textarea, and its load effect had no
`isEditing` guard. It depended on `getInitialContent`, a bare arrow in
WorkspaceView's render body — a new identity every render — and WorkspaceView
subscribes to the whole workspace store. **A colleague's typing indicator
elsewhere in the app replaced what the user was typing**, and destroyed the
native undo stack with it. On a new node the else branch ran and replaced their
work with the default template.

Three causes, all fixed: the guard, `useCallback`, and a `key` per node (without
which React reused the instance and `isEditing` stayed true while the buffer was
swapped to another node's body).

**The first version of the test passed with the guard fully removed** — the
harness used `useCallback`, so the effect never re-ran and the guard was never
exercised. It now uses the unstable arrow the bug actually had.

### 163. The notification panel showed other accounts' message previews — FIXED

`recipientCid` is recorded on every notification and plumbed to
`getUnreadCountByCid`; the panel that renders them filtered only by TYPE.
Message notifications carry a 100-character plaintext preview and the sender's
name, so a tab that switched accounts rendered the previous account's messages
to the new one and marked them read as the new account. `cleanup()` has no
callers, so logout clears nothing either.

### 164. The offline banner was invisible exactly when it mattered — FIXED

At z-40 it sat under every full-screen surface that appears BECAUSE you are
offline. The demotion from z-100 was itself a fix — at top-0 it had covered the
whole header — but `top-14` is what keeps the header clear, so the z-index was
free to go above the blocking surfaces all along. It was also `fixed` and
therefore covered the first ~36px of both panes; it now publishes its measured
height and the layout reserves it.

### 165. Also fixed: a failed call was a permanent dead end

`use-call-runtime` tears the manager down on a terminal state, and `failed`
deliberately keeps its surface up so the user can read the reason — but nothing
cleared the React `call` state, so Leave awaited `undefined?.end()` and did
nothing. The error panel stayed for the rest of the page's life with both call
buttons replaced by that dead Leave, and no further call to that peer was
possible from that conversation.

### 166. Recorded, not fixed — write acknowledgement is the root of several

- **Every tree and document write reports success on SEND, not on write.**
  `sendProtocolRequest` resolves once the frame reaches the WASM sink, and the
  server answers rejections as a *response*, which can never reject that
  promise. So "Office Deleted — deleted successfully" appears in green next to a
  red "Permission denied" five seconds later, with the node still in the tree.
  **The correlation this needs already exists** — `service.ts`'s raw request
  path has timeouts and `expectedResponseTypes` per request — labelled "for
  testing" with no production caller. `TreeNodesSection`'s careful
  close-only-on-success dialog is dead code for the same reason: the handler it
  awaits swallows its own errors and always resolves.
- **The UI gates MDX editing on `EditMdx`; the server enforces
  `EditTreeStructure`, at the workspace root rather than the node.** Custom roles
  are never granted `EditTreeStructure`, and `EditMdx` is directly grantable in
  the permission matrix — so an admin can grant exactly the persona whose saves
  are always refused. The tree menu (Edit / Add Child / Delete) renders for every
  node with no permission check at all.
- **Tree changes are never broadcast and never re-fetched.** `listNodes` is
  called once, at authentication. A node another user creates, renames or deletes
  never reaches an open session — and `nodes:loaded` merges rather than replaces,
  so even a fresh fetch could not prune a deletion.
- **Node state and the permissions cache survive a workspace switch.** The
  permissions cache is keyed by domain id with a `'workspace-root'` sentinel that
  is the same string on every server, and its TTL is unreachable from the UI — so
  after switching from a workspace where you are Admin to one where you are a
  Guest, every gated control stays enabled.
- **Live documents are never persisted for the invited peer** — the cache entry
  is created only on the creating side, so both the debounced save and the
  unmount flush early-return. That peer's contribution exists in RAM only.
- **`mdx_content` is broadcast to every connected client with no membership
  filter.** The UI discards unknown nodes, so it is not displayed — but it has
  already crossed to the client.
- **"Set as Default" is inert**: the hand-written request mirror has drifted from
  the generated type, `is_default` is dropped by serde, and the user is told it
  worked every time. **MoveNode** is implemented on the server and fully wired on
  the client response side, with no `moveNode` method and no drag affordance —
  reorganising a workspace is impossible.
- **The cascade-delete warning under-reports** because the parent's `children`
  array is never patched when a child is created, while the sidebar derives
  nesting from `parent_id` — so the tree shows three rooms and the dialog
  mentions none of them.
- **Last-writer-wins on document bodies**, with no version, etag or base
  revision, and no detection.

### 167. Recorded, not fixed — calls and devices

- **A group call can stay `active` with an empty roster and the camera on.**
  `active` has no deadline by design (the liveness watchdog owns it), but the
  watchdog only tracks peers who are `active` or `connecting` — an invitee who
  never answered stays `'invited'` forever and blocks both end conditions.
- **A follower tab rings audibly with no answerable card.** `RingingCall` refuses
  to render outside the leader tab; `CallSoundEffects` has no such check and the
  follower reliably wins the per-callId ring lock, because the leader never saw
  the signal.
- **Call invites ride the offline-queued path with no expiry** — a call placed
  while the callee was offline rings them hours later.
- **`openSessionFor` never re-checks the call state after its awaited open**, so
  a hangup during the 10s window resurrects a departed peer and leaks the media
  session. `CallSession.start` does exactly this re-check for the same hazard.
- **Calls have no outcome.** `reason` on `ended` has no reader: after 45s of
  ringing or an instant decline the stage simply vanishes, and there is no
  missed-call record anywhere.
- **Devices removed mid-call are undetected** — no `track.onended`, no
  `devicechange` — and `toggleCamera` disables rather than stops tracks, so the
  camera indicator stays on after the user turns their camera off. Defensible as
  the standard mute idiom, but worth an explicit decision in a product that sells
  privacy.
- **Hangup is gated on network I/O**, with the caller's own await unbounded, so a
  stalled send keeps the camera on for as long as the stall lasts.

## Round eighteen — write acknowledgement, agent survival, tree state, 2026-08-26

### 168. Every tree and document write reported success on SEND — FIXED

`sendProtocolRequest` resolves once the request reaches the local WASM sink, and
the server answers a refusal as a RESPONSE, which can never reject that promise.
So the user saw, five seconds apart and in opposite corners:

> green **"Office Deleted — Engineering has been deleted successfully"**
> red **"Failed to delete node: Permission denied: EditTreeStructure required"**

with the node still in the tree, the modal closed, and — if they had been viewing
it — themselves navigated away from a node that still exists.

Every downstream failure path was unreachable as a consequence.
`TreeNodesSection` closes its delete dialog ONLY on success and renders its own
`role="alert"`; that whole path was dead because the handler it awaits caught its
own errors and always resolved. **Two layers of careful failure handling, neither
of which could ever fire.**

Known limitation, recorded rather than hidden: the protocol carries no request
id, so responses can only be matched by TYPE. The real fix is a request id on the
wire.

### 169. Editing a document required the right to restructure the workspace — FIXED

`update_node` required `EditTreeStructure` at `WORKSPACE_ROOT_ID` for every
update, including a pure content save. `Permission::for_role` never grants
EditTreeStructure to a Custom role, while `EditMdx` IS directly grantable and is
what the UI gates its Edit button on — so an admin could grant exactly the
persona "can edit MDX documents" whose every save was refused. The two ends
disagreed about which permission the feature needs, and #168 is why nobody saw
it.

### 170. One failed delivery shut down the entire local agent — FIXED

Returning `Err` from `on_node_event_received` is not "this event failed". The
SDK's KernelExecutor treats it as fatal and calls `shutdown()`. There is no
supervisor above it, so the process exits — taking every session for every
account with it, and with the default in-memory backend, every account too.

The triggers are ordinary: a P2P channel arriving for a session just removed from
the map (connect.rs removes it and then sleeps 200ms), or a send to a tcp entry
whose receiver was dropped because a tab closed (ext.rs drops the receiver
*before* removing the map entry). **Closing a tab could kill the agent.**

### 171. The initiator path broadcast decrypted P2P messages to every localhost client — FIXED

When the target uuid was stale it fell back to sending the MessageNotification to
EVERY live TCP entry — handing the plaintext body to every other session
multiplexed through the agent, including other users' sessions.

The acceptor side had already removed exactly this broadcast, for exactly this
reason, with a comment spelling out the leak. `object_transfer_handle.rs` records
the same fix a third time. **Three files, one lesson, applied to two of them.**

### 172. The node tree ratcheted permanently open — FIXED

The auto-expand effect expanded every node with children and re-ran on every
change of `treeData` OR `filteredTreeData` identity — both of which change
constantly. Every collapse the user made was undone by typing one character into
the filter and deleting it, or by anyone saving a document anywhere in the
workspace. A large workspace also opened fully expanded into an unvirtualised
50vh scroll area at three tab stops per row.

### 173. Recorded, not fixed — internal service

- **Session hijack via the two gate-exempt request variants.** The ownership gate
  keys on `session_cid()`, which returns `None` for `Connect` and
  `ConnectionManagement`. `Connect` re-points a live session to the caller by
  USERNAME ALONE, before the password is ever examined. `ClaimSession`'s only
  guard is the client-supplied `only_if_orphaned`, and it moves EVERY session
  sharing the old connection id. `GetAccountInformation` is also exempt and
  returns every local account's cid and username, so enumeration is one call.
- **`Connection` has no `Drop`,** yet three separate comments describe guarding
  against "the RAII Drop impl" firing a redundant disconnect. That machinery
  guards something that does not exist — so every site removing a map entry
  without an explicit disconnect leaks the SDK session, and `connect.rs` looks up
  existing sessions BY THE MAP, so a leaked session is invisible to its own
  duplicate guard.
- **LocalDB writes reach any cid not currently in the map.** The gate lets
  unmapped cids through on the stated grounds that "the handler owns that error"
  — but `BackendHandler` performs no session check, so Set/Delete/ClearAll
  naming any registered-but-disconnected account succeed.
- **`SetConnectionOrphan` is inert** — `orphan_sessions` is written in four
  places and read in none, and a client that disables orphan mode still gets a
  success response and still has its sessions preserved.
- **Unbounded intake**: an unbounded channel, no backpressure, and a spawn per
  request with no concurrency cap. Requests on one session are also handled
  concurrently and out of order — only `Connect` serialises, and its guard is
  unbalanced under panic, so a panic wedges that username permanently.

### 174. Recorded, not fixed — scale and navigation

- **`state.nodes` accumulates across workspace switches** (merge, never replace,
  with no reset path), while **`state.members` is clobbered by whichever domain
  asked last** — `MembersPayload` carries no domain id at all, so opening a
  room's member list repoints the sidebar roster under a heading still reading
  "Workspace Members".
- **The file-manager filter survives navigation and then lies**: it persists
  across folder, peer and storage-mode changes, and when it matches nothing the
  grid says "This folder is empty. Drag files here" — about a folder with files
  in it. The selection-clearing effect already lists exactly the right
  dependencies; the filter is simply not one of the things it clears.
- **The chat scroll yanks to the bottom on any status change**, including other
  conversations', because the status subscription's `prev.map` always allocates
  and the scroll effect has no "am I near the bottom" test. There is also **no
  message search anywhere** — the only way to reach an old message is scroll-up
  paging, 50 at a time.
- **`?id=` is written into every workspace URL and read by nobody**, and its
  value is always the literal `"root"`. Pasting a workspace link to a colleague
  in a different workspace opens THEIR workspace with your node id.
  **`/messages` navigates with `replace: true`**, so on the phone layout the Back
  gesture leaves `/messages` entirely instead of returning to the conversation
  list.
- **A keyboard user cannot enter a folder from the file grid** — navigation is
  bound to `onDoubleClick` only, and every tile is a tab stop.
- **`MembersTab` runs an O(n²) admin scan inside its map**, no member list has a
  search box or virtualisation, and "Recent Users" is the first five members in
  map-insertion order with no recency signal of any kind.

## Round nineteen — view-scoped state and honest links, 2026-08-26

### 175. The file-manager filter travelled with the user and then lied — FIXED

`filterText` matches only the current directory's immediate children, and it
persisted across folder navigation, peer switches and storage-mode switches. It
followed the user into folders where it matched nothing, and the grid then said
**"This folder is empty. Drag files here or right-click to create a folder"**
about a folder with files in it. The box is 32px wide in the top-right corner,
so nothing on screen explained where the files went.

The sibling selection-clearing effect already listed exactly the right
dependencies — and its comment explains at length why a stale selection is
destructive rather than cosmetic. The filter was simply never given the same
treatment, one line below the effect that would have covered it.

### 176. A delivery receipt in another chat moved your place in this one — FIXED

The chat scroll pinned to the bottom unconditionally on every change of
`messages`, and the status subscription's `prev.map` ALWAYS allocates — so the
array identity changed for a sent/delivered/read transition in ANY conversation.
A reader scrolled up through yesterday's thread was thrown back to the newest
message by a receipt in a chat they were not looking at. It also fought the
pagination anchoring in `useP2PMessages`, which goes to real trouble to preserve
scroll position across a prepend.

Fixing only the scroll would have been wrong: `scrollTop` is 0 on first paint,
so a pure near-the-bottom test opens every conversation at the TOP of its
history. Both halves — the identity guard and a first-paint jump — were needed.

### 177. Every workspace link claimed to identify a workspace — FIXED

Every path carried `?id=<activeWorkspaceId>`. Nothing read it, and its value was
always the literal `'root'` because `setActiveWorkspaceId` had no callers. Both
ends of the feature were absent; only the URL pollution was real.

That made shared links actively wrong rather than merely noisy:
`/workspace?id=root&nodeId=…` looks like it addresses a specific workspace, so
pasting one to a colleague in a **different** workspace opened THEIR workspace
with your node id. Removed rather than wired up — a genuinely workspace-scoped
link needs the id in the ROUTE and a loader that honours it, and leaving a
parameter that claims to identify something it does not is worse than none.

### 178. Recorded, not fixed — needs a coordinated protocol change

- **`state.members` is clobbered by whichever domain asked last.**
  `WorkspaceProtocolResponse::Members` is `Members(Vec<User>)` — it carries no
  domain id at all, and every consumer accepts every response. So opening a
  room's member list repoints the sidebar roster and the global `state.members`
  under a heading still reading "Workspace Members". The fix needs a field on
  the wire plus a coordinated WASM rebuild; shipping the TS half alone would
  break member loading entirely, so this is recorded rather than half-applied.

## Round twenty — data destruction, dead gates, stuck calls, 2026-08-26

### 179. One user logging in destroyed another user's message history — FIXED

Message pages are keyed by PEER alone and live in LocalDB bucket `0n`, which
every account on the device shares. Nothing recorded whose conversation a record
was — and `cleanupStaleConversations` deletes any cached conversation missing
from the CURRENT account's peer list, which is true of every conversation
belonging to a different account.

So user B logging in **permanently deleted user A's messages**, on a device this
product explicitly expects to hold several accounts. The guard already there is
well reasoned and says the right thing — *"the guard belongs here, at the
destructive operation"* — it simply had no notion of WHOSE data it was deleting.

`ConversationMetadata.ownerCid` now records it, and a delete refuses anything it
cannot attribute. Unattributed legacy records are kept by the sweep (unknown
ownership is exactly when destroying is unsafe) and adopted by the first account
that writes to them. The explicit "clear this conversation" is a separate scope —
the user has it open and pressed the button — but still refuses a record
demonstrably belonging to someone else.

**Two bugs in my own fix, caught by the tests:** `ownerCid` was serialized to a
string and never parsed back, so every comparison was string-vs-bigint and the
guard silently became "refuse everything" — which would have looked like the
feature working.

### 180. An unanswered invitee kept a call alive with the camera on — FIXED

`active` has no status deadline by design (the heartbeat watchdog owns it), but
that watchdog only tracks peers who are `active` or `connecting`. An invitee who
never answers is neither, and blocked BOTH end conditions — so call Bob and
Carol, Bob answers, Carol's tab is closed, Bob hangs up, and the call sat
`active` with nobody in it: duration ticking, **camera light on**, phantom tile
rendered.

### 181. The internal-service workspace was linted but never tested — FIXED

It got a dedicated `fmt` + `clippy` job and its tests were never brought with
it. `rust-tests` is the root workspace only and `-p` cannot reach a separate
workspace, so **135 tests across eight crates ran nowhere** — including the media
lane, on the branch where the media lane lives. The submodule's own workflow runs
them, but only on PRs to that repo, while CLAUDE.md has developers editing inside
it from this worktree.

`check-crate-coverage.mjs` — a guard written precisely to catch "a gate that
never runs against a path" — only looped over fmt and clippy, so it could not
see this. It now covers tests too.

### 182. A flaky test of my own — FIXED

`instance-identity` asserted 200 minted ids were all distinct: a ~2% flake, since
the id is `timestamp_ms * 10^6 + random(10^6)` and 200 mints in one millisecond
collide by the birthday bound. Passed five times in isolation, failed under
full-suite load — the worst shape, because it reads as an unrelated regression.

It was also asserting the wrong property: uniqueness is not something this id has
or needs, which is exactly why `documentNonce` exists. **The replacement was
wrong on its first attempt too** — within a millisecond the random low digits
make the full id unordered, so only the timestamp component carries the
guarantee.

### 183. Recorded, not fixed — cross-account leakage (auth audit)

- **Every account's data shares one LocalDB bucket, `cid 0n`.** Conversation
  lists are enumerated from it with no owner filter, so account B **sees** account
  A's conversations. The destruction is fixed above; closing the visibility leak
  means either dropping existing local history or attributing it by guesswork —
  a decision with real data-loss risk either way, and one to take deliberately.
- **Plaintext passwords for every account live in that same bucket**, typed
  `password: string; // Note: This should be encrypted in production`, with no
  encryption, no TTL and no zeroing. Sign Out splices out ONE entry. They are
  auto-reused by leader election alone.
- **Every stored password is printed to the console on every session write.**
  `formatForDebug` redacts a `password` field only when it is a BYTE ARRAY;
  `StoredSession.password` is a string, so it prints verbatim, and
  `serverPassword` is not in the redaction list at all. `debugLog` is a no-op in
  production builds — but `docker-compose.yml` builds `target: dev`.
- **"Connected" is reported when the request was merely SENT.** A wrong password
  re-persists the session as if it had authenticated, and the entire
  exponential-backoff recovery block is dead for real auth failures.
- **Registration that half-succeeds leaves an orphaned account**: `ConnectFailure`
  is matched only inside the `Response` wrapper on the Join path where every other
  consumer reads it at the top level, so the promise hangs for 30s behind an
  uncancellable backdrop, then blames the network. Retry says "username taken",
  which is actively wrong advice, and there is no route to Login.
- **Deregister reports success on enqueue, not deletion** — `NodeRemote::send`
  only pushes onto a channel — and drops the connection-map entry FIRST, so a
  server-side failure is unobservable. The client then deletes the stored
  session, which held the only copy of the password.
- **Signing out of one account tears down all of them**: `removeSession(cid)`
  exists, is documented as the right call, and has zero production callers — all
  three sites use `stop()`, which clears every session.
- **Two login branches never settle** (`SessionAlreadyActive`, and `ConnectFailure`
  containing "already connected"): they clear the timeout and then neither
  resolve nor reject, so the closure holding the plaintext password is retained
  for the page's lifetime. In the same block, re-login overwrites the stored full
  name with the username and destroys the stored server PSK.

### 184. Recorded, not fixed — tests that cannot fail (CI audit)

- **The flagship P2P spec's two core tests contain no assertions at all.** All six
  helpers return `Promise<boolean>` by design and every return value is
  discarded, so a total handshake failure surfaces as two green tests named
  "P2P registration and handshake" and "Open conversations on both sides".
- **Multi-tab coordination: 3 of 5 tests cannot fail**, and one asserts the
  failure state as success — its disjunction includes `seesLandingButtons`, which
  IS the not-detected state. Another asserts `document.readyState` is truthy,
  which it always is. This is the only spec covering leader election.
- **A unit assertion is swallowed by the production code's own `catch`** — the
  only substantive `expect` runs inside a callback production invokes inside a
  `try`, so breaking the feature turns the AssertionError into a caught error and
  the test still passes.
- **The CID-routing drift guard cannot detect drift**: fixtures are the test's own
  literals and `extractTargetCid` is type-agnostic, so all eight parametrized
  cases exercise one branch with a value the test supplied.
- **Request-layer permission enforcement is asserted for one of ~40 variants.**
  Every helper-driven test dispatches as admin, and `check_entity_permission`
  short-circuits for admins. Delete the permission check from any handler except
  `UpdateNode` and the entire Rust suite stays green.
- **`loginWithCredentials` returns true by default**, can skip the credential path
  entirely via an existing session, and converts a server "already exists" error
  into success — so "Login with credentials" can pass having never entered any.
- **`scroll-containment.spec.ts` asserts the CSS the test itself wrote** — it uses
  `page.setContent` with hand-written rules and never touches the app.
- **The Windows agent binary is published without ever being run** — the smoke
  test is `if: runner.os != 'Windows'`, and Windows is the platform whose users
  get that download by default.
- **`check-storage-keys.mjs` silently exempts the module it was written for**: it
  resolves only `const` key declarations, and file-transfer holds its keys as
  `static readonly` class fields, so all four of its sites resolve to null and are
  dropped — while the summary line reports "OK".
- **`check-submodule-pointers-pushed.mjs` is invoked by nothing** — no workflow,
  no npm script, no git hook. It is the exact thing its own header warns against.

## Round twenty-one — secrets in logs, specs that can fail, a real multi-tab bug, 2026-08-26

### 185. Passwords were printed to the console, because redaction checked the TYPE — FIXED

Redaction lived entirely inside `shouldFormatAsBytes`, which begins
`if (!Array.isArray(value)) return false`. `StoredSession.password` is a STRING,
so it fell through and was printed verbatim on every session write — auth
success, auto-reconnect, logout, role update, active-index change.
`serverPassword` was in no list at all. Whether a secret is safe to print must
not depend on how it happens to be encoded, so redaction is now on the field
NAME, before any type-based formatting.

`debugLog` is a no-op in production builds — but the shipped compose stack
builds `target: dev`, where it is live.

### 186. A second tab cannot see the first tab's session — REAL BUG, surfaced and flagged

**The flagship P2P spec's two core tests contained no assertions at all.** Every
helper returns `Promise<boolean>` and is designed not to throw; every return
value was discarded. A total handshake failure surfaced as two green tests named
"P2P registration and handshake" and "Open conversations on both sides".
Asserted — and the flow genuinely works, 8 passed. They simply were not checking.

**The multi-tab spec had three tests that could not fail, one asserting the
failure state AS success**: its disjunction included `seesLandingButtons`, which
IS the not-detected state, so a test named "should detect existing session"
passed precisely when the session was not detected.

Strengthening it surfaced a real bug, verified by screenshot: **a second tab in
the same browser context, opened seconds after the first registered and loaded a
workspace, shows the logged-out landing page with no Active Sessions strip.** A
bounded retry (an empty result during startup is not evidence of no sessions)
did not resolve it, so the cause is not first-paint timing. Under investigation.

Marked `test.fail()` rather than skipped or reverted: the assertion still runs
and Playwright reports a FAILURE if it starts passing, so whoever fixes the bug
is told to remove the annotation. Skipping loses the detection; reverting
restores the false green.

### 187. Recorded, not fixed — RE-VFS (claims pending independent verification)

An audit reports that **the RE-VFS upload path may never store any bytes**:
`source` sent as a bare string where the backend expects an externally-tagged
`FileSource` enum; `transfer_type: 'FileTransfer'` rather than
`RemoteEncryptedVirtualFilesystem`, with `virtual_path` never sent; and the
peer-scoped upload never calling the backend at all. If true, the user sees
"Uploaded: x", the file appears in the tree and counts against quota, and no
bytes exist. **Being independently verified before any fix** — the change is
large and a wrong confirmation costs more than a wrong refutation.

Also reported in the same layer, not yet acted on:
- **The pending-op queue is written to OPFS and never read back** —
  `load-pending-ops` and `setPendingOps` have zero production callers, so the
  offline queue is empty on every page load and `retryPendingOps` returns 0,
  which the UI reports as **"Tree synced with peer"**.
- **The ACK reports success for operations the receiver silently dropped** —
  `applyRemoteOp` no-ops on missing parent, name collision or missing source and
  returns the unchanged tree, and the caller acks `success: true` as a literal.
- **An unreadable `tree.json` is indistinguishable from "no tree"**, and the
  recovery path writes a fresh default tree over the original — so one transient
  OPFS read failure destroys the user's virtual tree.
- **A file can overwrite a directory node**, deleting the subtree, in three
  places; and `mergeTrees` resolves a directory/file conflict by timestamp with
  a `>=` tie-break, which is **not symmetric** — the two peers converge to
  different trees.

### 188. Recorded, not fixed — accessibility

- **The entire auth flow is four hand-rolled overlays with no dialog semantics**
  — no `role="dialog"`, no `aria-modal`, no initial focus, no focus restore, and
  Tab walks straight out into the still-live Landing buttons behind them.
  `LoadingModal` is full-screen `z-[100]` with no live region at all.
- **No `AvatarImage` in the app has an `alt` — 19 of 19.** Radix unmounts the
  fallback once the image loads, so the initials carrying the name disappear:
  the moment a user sets a profile picture, the only route to Profile / Settings
  / Sign out becomes an unnamed button.
- **Icon-only buttons with no accessible name**, concentrated in group chat and
  the file manager — including the group-chat SEND button, where the DM
  composer's identical fix carries a comment explaining exactly why it was
  needed. The file manager's New folder / Upload / Sync are the only way to
  create, upload or refresh.
- **Tooltips whose trigger cannot be focused or tapped**: the signup
  cryptography help, and the message delivery-status tooltip. `DisabledWithTooltip`
  is worst — it forces `tabIndex: -1` and `pointer-events: none` on every child,
  so the REASON a control is disabled is unreachable by keyboard and touch.
- **A radiogroup made of buttons** — the workspace picker on reconnect uses
  `role="button"` children with no `aria-checked`, so selection is colour-only.
  The correct pattern is already in the repo twice.
- **The mobile navigation drawer is an unnamed dialog with its close button
  `display:none`d**, and the `className` prop is dropped in the mobile branch, so
  the offline banner's reserved height is silently lost there.
- **39 of 43 truncations carry no `title`**, including the DM list, workspace
  switcher, chat tabs and member rows — every identity-bearing one.

## Round twenty-two — the multi-tab bug root-caused and fixed, 2026-08-26

### 189. A second tab could not see the first tab's session — FIXED, two breaks

Root-caused precisely, and both breaks proved from source.

**Break 1 — the "can I send" gate was leader-only.** `fetchActiveSessions` gates
on `isWebSocketConnected()`, which is `isInitialized && client !== null`. A
FOLLOWER tab never owns a WASM client — `doInit` sets `client = null` for
followers **by design** and proxies through the leader instead. So tab 2 failed
the gate, returned `[]` **without ever sending GetSessions**, and cached the
empty answer. This is why the bounded retry added in the previous round changed
nothing: the request was never being made.

**Break 2 — the follower proxy correlated on the wrong id.** It minted a fresh
UUID as the key for the leader's pending map, but the internal service echoes
the `request_id` embedded in the PAYLOAD. `routeByRequestId` missed,
`routeByCid` got null (GetSessions replies with `cid: 0`, which is falsy), and
the response was processed locally on the leader — a tab with no such pending
request — while the follower waited out its timeout.

Connect and Register work from followers precisely because they pass their
embedded requestId through explicitly. **The mechanism was correct in one place
and never propagated** — the campaign's most common shape, again. Deriving the id
in the proxy fixes every `sendMessage()`-based flow at once.

Negative-controlled end to end: restoring the leader-only gate reproduces the
exact original failure.

**The method note worth keeping:** this bug was found only because a test that
could not fail was made able to fail. The assertion had `seesLandingButtons` in
its disjunction — the not-detected state — so it passed precisely when the
session was not detected. Nothing else in the suite covered it.

**And the strengthened failover assertion was itself wrong**, which the run
exposed: it navigated tab 2 to `/workspace`, but tab 2 never selected a session,
so that legitimately redirects to `/connect`. Taking over leadership means being
able to REACH the internal service, so it now asserts the session list survives.
A strengthened assertion is still an assertion that has to be right.

### 190. CONFIRMED by independent verification — RE-VFS uploads store no bytes

The claim recorded last round was verified against source, and is **worse than
reported**: the request dies client-side at the WASM serde boundary before ever
reaching the internal service, so nothing is even logged.

- `source` is sent as a bare string where the backend expects the externally-
  tagged `FileSource` enum. `deserialize_request` uses strict
  `serde_wasm_bindgen::from_value`, so the send rejects immediately — and
  `backendSendFile`'s catch resolves `{ success: false }`, which the caller
  awaits and **ignores**.
- `transfer_type: 'FileTransfer'` rather than
  `RemoteEncryptedVirtualFilesystem { virtual_path, security_level }`, and
  `virtual_path` is never sent — so even with the source fixed, the key that
  DownloadFile and DeleteVirtualFile address is never created.
- The peer-scoped upload never calls the backend at all, and `handleDrop` reads
  only name/size/type off the browser `File` — `arrayBuffer()` appears nowhere
  in the file-manager or revfs paths.
- The tree is mutated and persisted BEFORE the backend call, there is no
  rollback, and the user is shown **"Uploaded: {name}"**. Phantom files count
  against the quota and can trigger the storage-limit modal.
- **Reachable and enabled by default** — sidebar → File Manager, no feature flag;
  the only gate defaults to true on both server and client.
- Unit tests cannot catch it: the test helper mocks the entire intent as
  `{ type: 'backend-send-file', success: true }`.

Not fixed in this round: the fix needs the `File` object plumbed through
`handleDrop` → `uploadFile` → intent (currently metadata-only), a correct
`FileSource` and `transfer_type`, the result checked instead of discarded, and
the same treatment for the peer path. Recorded in full so it is done once,
properly, rather than partially.

### 191. Avatars had no `alt` — FIXED, at the type level

All seven `AvatarImage` call sites lacked one. Radix unmounts `AvatarFallback`
once the image loads, so the initials carrying the person's name disappear at
exactly the moment a real picture exists — and in the TopBar account menu, whose
button has no text, that left the only route to Profile, Settings and Sign out
announced as "button". Its `title` was admin-only, so non-admins had nothing.

`alt` is now **required by the prop type**, not by a lint rule: a rule can be
disabled per line and a new call site added without one, whereas this fails the
build. Six sites pass `alt=""` deliberately — their subject is named in adjacent
text, so a meaningful alt would announce the person twice — and that choice is
now visible in the diff rather than absent from it. The account-menu button
carries its own `aria-label`, which is what survives the image failing to load.

## Round twenty-three — uploads actually store the file, 2026-08-26

### 192. File uploads stored no bytes at all — FIXED

Confirmed by independent verification and fixed end to end. Four defects on one
path, and the ordering that made all of them silent.

- **`source` was a bare string**, and the string was a tree DIRECTORY PATH — not
  a filesystem path and not data. The backend field is `FileSource`, an
  externally-tagged enum, and the WASM client deserializes strictly, so the
  request was **rejected in the browser**. Nothing reached the internal service,
  so nothing was logged there either — which is why this survived so long.
- **`transfer_type` was `'FileTransfer'`** rather than
  `RemoteEncryptedVirtualFilesystem`, with `virtual_path` never sent, so even a
  correct source would have put the bytes somewhere `DownloadFile` and
  `DeleteVirtualFile` cannot address.
- **The peer-scoped upload never called the backend at all** — it sent the peer a
  tree op describing a file whose contents existed only in the uploader's page.
  Both peers showed the file; neither had it.
- **`handleDrop` discarded the browser `File`**, reading only name, size and
  type. `arrayBuffer()` appeared nowhere in the file-manager or revfs paths.

**The ordering is what made it silent.** The tree was mutated and persisted
BEFORE the call, the failed result was awaited and discarded, and the user was
shown "Uploaded: {name}". Phantom files counted against the storage quota and
could trigger the limit modal. Bytes now go first, and a node appears **if and
only if** they were accepted — the optimistic render is worth less than the
guarantee, since there is no progress UI and a file that silently is not there
is far worse than one that takes a moment to appear.

Reachable and enabled by default: sidebar → File Manager, no feature flag.

**Why no unit test caught it:** the existing helper mocks the whole intent as
`{ type: 'backend-send-file', success: true }` — the mock sat exactly where the
defect was, which is the third time this campaign has found that shape. The new
test asserts on the REQUEST OBJECT through the module's injected I/O seam, so it
sees what the backend would see.

### 193. Method note — the fix that only a compiler could sequence

Threading the bytes through required changing the intent type first and letting
`tsc` walk the change up: intent → network layer → dispatcher → file-ops →
service facade → two hooks → shared interface → the drop handler that had the
`File` all along. Each error named the next place the data had to reach.

Making the parameter **required** rather than optional is what produced that
chain. An optional `content?: Uint8Array` would have compiled at every step and
shipped the same silent failure.

## Round twenty-four — one key per file, 2026-08-26

### 194. A file was written under one key and read back under another — FIXED

Upload writes `virtual_path = <full file path>`. Download and delete sent
`fileMetadata.virtualDirectory` — the containing **directory** — so a file at
`/docs/notes.txt` was stored as `/docs/notes.txt` and looked up as `/docs`.
Five call sites, two different keys for one object.

Now that uploads actually store bytes (round twenty-three), this is the
difference between a file the user can open and one that exists but is
unreachable — with the delete missing too, so the storage stays consumed with
nothing referencing it.

Deriving from `node.path` also ends a drift the stored field could not avoid:
**rename and move rewrite `node.path` and never touch `virtualDirectory`**, so
the stored key grew staler with every rename while the path stayed correct. One
derivation, no second copy to fall behind — the SSOT rule, applied to a key
rather than to data.

### 195. A failed delete left bytes with nothing referencing them — FIXED

`removeFileFromServer` removed the node and persisted the tree first, then
issued the backend delete and **ignored its result**. A failure left the bytes on
the server with no tree node pointing at them: storage consumed permanently, and
no node left to retry from. Bytes go first now, and a failure stops the removal.

Same shape as the upload ordering fixed last round — the irreversible local step
belongs last, after the remote one has been confirmed.

### 196. Method note — a test that passed with the bug fully restored, again

The first version of the key-correspondence test called the network functions
directly with a path and asserted they passed it through. They always did: the
network layer was never wrong. **The caller chose the wrong value**, and a test
one layer below the decision cannot see a decision.

It passed the negative control, which is the only reason it was caught. Rewritten
to assert on the INTENTS the file operations emit — the level where the key is
actually selected — it fails with `expected '/' to be '/notes.txt'`.

This is the third test this campaign that passed with its own bug restored. The
pattern in all three: **asserting below the layer where the decision is made.**

## Round twenty-five — the key that must not be re-derived, and the update session, 2026-08-26

### 197. The file key is recorded at upload, NOT re-derived — CORRECTED

My own fix from round twenty-four was wrong for renamed files, and an audit
caught it before it shipped anywhere real.

The backend exposes send, download and delete for a file and **no way to re-path
one** — the module header says so explicitly, which is why rename and move are
local-only operations. So the server-side key is **immutable**: whatever the
path was at upload time. A key derived from the current `node.path` therefore
misses every renamed file — a worse failure than the one being fixed, because it
only appears after a rename.

`virtualDirectory` now holds the upload-time file path and is read back
unchanged. That makes it the SSOT for a key the client **cannot recompute** —
the opposite of the usual derive-don't-duplicate rule, and it needed the comment
saying so, or the next person "fixes" it to track `node.path` and breaks exactly
those files.

The test now covers both mistakes: the original directory-vs-path bug, and a
rename that must still address the original key. Negative-controlled against
both — including against my own wrong version, which fails with
`expected ['/notes.txt', '/renamed.txt'] to deeply equal ['/notes.txt', '/notes.txt']`.

### 198. Recorded, not fixed — every accepted update runs one session on mismatched WASM

The highest-reach PWA finding, and a **narrowed but not closed** version of a bug
this repo already fixed once.

The WASM binary is fetched from a stable URL (`/wasm/..._bg.wasm`) and runtime-
cached StaleWhileRevalidate. The JS glue that calls into it is NOT at a stable
URL — it is bundled into hashed, precached chunks. Workbox activates the new
precache atomically, so on the first launch after a user accepts an update, the
page runs the **new glue against the old binary**, and only revalidates in the
background.

The config comment names this exact failure — *"old WASM against new bindings,
which surfaces as undefined-function errors rather than anything obvious"* — and
the move from CacheFirst to SWR shrank the window from thirty days to one
session. But that session is **the update session**, which every installed user
hits on every wasm-changing deploy, and nothing tells them a second reload fixes
it. There is no version compatibility check anywhere.

**Fix direction:** give the binary a build-scoped identity — `?v=<build-id>` on
the fetch, or a build-scoped runtime `cacheName` — so a new build is a cache MISS
and fetches fresh, with offline preserved after first load. Not applied here: it
spans the submodule that constructs the URL and needs a real
install-then-update cycle to verify, and a caching change that cannot be
verified is not one worth shipping.

### 199. Recorded, not fixed — the rest of the PWA and RE-VFS audits

- **Accepting an update half-updates every OTHER open window.** `skipWaiting`
  takes over all clients at once, the old hashed chunks leave the precache, and
  nginx 404s them — so a not-yet-visited lazy route in another window fails its
  dynamic import into the top-level error boundary. There is no
  `vite:preloadError` handler anywhere. Multi-window is first-class here.
- **RE-VFS download listens for an event REVFS pulls never emit.**
  `backendDownloadFile` waits on `FileTransferStatusNotification`, emitted only
  by the standard accept/decline flow; a REVFS pull auto-accepts and streams
  `FileTransferTickNotification`. It also reads `status.response?.download_path`
  where `response` is a `bool`. Every download therefore times out at 30s and
  resolves `success: false` — and the caller checks only `result.type`, so it
  returns `undefined` and the UI toasts "Download initiated". **The success path
  is unreachable.**
- **`backendDownloadFile` correlates on CID, not request_id**, unlike both its
  siblings in the same file — so a concurrent standard transfer resolves an
  unrelated pending download.
- **`copyNode` clones `fileMetadata` with a fresh id but the SAME key**, so two
  tree nodes alias one backend object. Harmless while deletes miss; once they
  land, deleting the copy destroys the original's bytes while its node still
  shows the file.
- **Deletes report success on enqueue**: the backend answers
  `DeleteVirtualFileSuccess` after `remote.send`, without awaiting the actual
  outcome — so even a delete of a nonexistent key succeeds.
- **iOS has no install affordance at all** — the button requires
  `beforeinstallprompt`, which iOS Safari never fires, zeroing the install funnel
  for that platform.
- **The WASM runtime cache expires after 30 days**, so an installed app launched
  offline after a long idle renders its shell and cannot initialise the client —
  while the toast promises it "will now load without a connection".

## Round twenty-six — the file round trip closes, 2026-08-26

### 200. A file could be uploaded and never downloaded back — FIXED

The download handler waited on `FileTransferStatusNotification`, which the
internal service emits from exactly ONE place: `respond_file_transfer.rs`, the
accept/decline flow for STANDARD transfers. A REVFS pull auto-accepts and
streams `FileTransferTickNotification` instead.

So **the success branch was unreachable**. Every download waited out the full
30-second timeout, resolved `success: false`, and the caller — which checked only
`result.type`, never `.success` — returned `undefined`. The UI read that as
**"Download initiated for X"**. A download that provably did not happen was
reported as progress.

Two more defects in the same few lines:
- it read `status.response?.download_path`, where `response` is a plain `bool` on
  the wire, so even an impossible match would have produced `undefined`;
- it correlated on `status.cid === cid`, matching ANY transfer notification for
  the session — unlike both siblings in the same file, which use `request_id`.
  A concurrent standard transfer would settle an unrelated pending download.

Now correlated on `request_id`, completing on `ReceptionComplete` /
`TransferComplete`, failing on `Fail`, and taking the local path from
`ReceptionBeginning` — the variant that actually carries it. The callers no
longer swallow a failure into `undefined`, and the UI's "Download initiated"
branch is gone: **there is no longer a state where the code knows the download
did not happen and says something encouraging about it.**

Negative-controlled: disabling the tick branch fails all three tests, two of them
by hanging for the full timeout — precisely what users experienced.

### 201. The round trip, end to end

Three rounds closed one feature that never worked:

| Round | Defect |
|---|---|
| 23 | Upload sent a directory path as `source` where the backend wanted a `FileSource` enum, and `'FileTransfer'` where it wanted `RemoteEncryptedVirtualFilesystem`. The request died in the browser's WASM deserializer; nothing was ever stored. The peer path sent no bytes at all, and `handleDrop` never read the `File`. |
| 24-25 | Download and delete addressed the containing DIRECTORY, not the file. Corrected once more when an audit showed the key must be the UPLOAD-TIME path — the backend cannot re-path an object, so a rename cannot move the bytes. |
| 26 | Download listened for an event REVFS pulls never emit. |

Each layer was individually plausible and the whole was inert. **The unifying
tell in all three: a failure resolved rather than rejected, and a caller that
awaited the result and discarded it.** Upload discarded `{success:false}`,
delete discarded it, download turned it into `undefined` — and every one of them
had a green toast waiting on the other side.

The ordering fix matters as much as the protocol fix: bytes now go first and the
tree commits only on success, so a node exists if and only if its content does.

## Round twenty-seven — guarding the shape instead of finding it, 2026-08-27

### 202. Twenty-two more discarded failure results — FIXED, and now gated

Having fixed the resolve-instead-of-reject shape three times by hand, I went
looking for it mechanically instead. `RevfsIO.execute` **never rejects** — a
timeout, a refused request, a full disk all come back as `{ success: false }` on
a RESOLVED promise — so `await io.execute({...})` with the result discarded is
not fire-and-forget. It is asking whether something worked and then looking away.

33 call sites; 21 discarded the answer.

- **`serverRmdir` discarded every per-file delete result.** The directory is
  already gone from the tree by then, so a refused delete left files consuming
  server storage with nothing referencing them. Now collected and reported —
  collected rather than thrown per file, because aborting halfway would leave the
  remaining files both undeleted AND unreported.
- **`removeFileFromPeer` had the server path's ordering bug**: node removed and
  persisted first, delete result discarded.
- **The twenty `persist-tree` calls** now go through one helper. Deliberately
  **not** a throw: by then the in-memory tree is already mutated and, for a peer
  op, the op may already be sent — throwing would report failure for something
  that partly succeeded. The operation happened; its *durability* failed. One
  event from one place, so a "changes may not survive a reload" notice gets wired
  once rather than at twenty sites.

`scripts/check-intent-results-checked.mjs` now gates it, with an explicit
`// best-effort: <reason>` opt-out so a deliberate omission is **visible rather
than absent**. Negative-controlled: removing one check exits 1 and names the
file, line and intent.

### 203. Method note — the mock that could represent neither outcome

The rmdir test's IO mock returned a bare `{}` for every intent. That cannot
represent success OR failure, so **any caller that started checking its result
would fail against a working backend** — which is exactly what happened the
moment `serverRmdir` began reporting undeletable files. The test broke on a
correct change.

A mock that returns a shape the real thing never returns is not a simplification;
it is a third behaviour that exists only in tests. It now echoes the intent type
with success, and a new test covers the refused-delete path that previously could
not be expressed at all.

Same family as the earlier finding that the revfs helper mocks
`backend-send-file` as `{ success: true }` unconditionally — which is why no unit
test could see that uploads stored nothing.

### 204. Method note — a guard that only works from one directory

The first version of the new check resolved its search root from the caller's
cwd. Run from the repo root it worked; run from `citadel-workspaces/` it crashed
with ENOENT — **which reads exactly like the guard being unavailable rather than
the guard being broken.** Now resolved relative to the script file. Worth
checking on every guard here: several are invoked from CI at the root and by hand
from elsewhere.

## Round twenty-eight — the write gate, wired to all of it, 2026-08-27

### 205. Seven of eleven workspace writes still reported success on send — FIXED

`awaitWriteResponse` exists, works, and narrates this exact defect in its own
header. It was wired to **four** of the eleven write types. The other seven each
had a UI that reported success regardless:

- *"Member Added — {username} has been added to the workspace as {role}"* — for a
  username that does not exist;
- *"Permissions saved successfully"*, modal closed, for permissions the server
  refused;
- the edit composer clearing the user's typed text while the message kept its old
  content;
- *"Every member will see this theme"* — for a theme nobody receives.

Every one of those surfaces has a carefully written `catch` that **could never
fire**, because a refusal arrives as a response and a response cannot reject a
send-only promise.

All seven success variants were read from the server source rather than guessed.
The new test asserts on the SOURCE, because "no write bypasses the gate" is a
property no single call can demonstrate — and it checks the map too, since a
variant wired at the call site but missing from the map falls through the early
return and sends without waiting: **the same defect wearing the fix's clothes.**

`MoveNode` is deliberately excluded from the call-site assertion — the server
implements it and the client has a full response path, but there is no
`moveNode` method and no drag affordance, so asserting it is gated would assert
something about code that does not exist.

### 206. Recorded, not fixed — group chat is largely a local illusion

An audit of the group stack found the client's model is almost entirely
page-local. Ranked as reported:

- **Groups do not survive a reload.** The list lives in module memory only, and
  both halves of the recovery path are missing: `refresh()` → `sendGroupListRequest()`
  has **no caller anywhere**, and `GroupListGroupsSuccess` is handled nowhere. So
  opening a group after a reload bounces the user out with *"This group may have
  been deleted"* — which is false. Server-side membership persists; the client's
  view can never reconverge.
- **"Own message" compares a username to a CID, so it is never true.** The server
  sets `sender_id` to the username; the client compares against
  `String(connectionInfo.cid)`. Edit and Delete are gated on that, so **they never
  render for anyone**, and your own messages render left-aligned as if from
  someone else.
- **Every group operation reports success on write**, and every failure variant —
  `GroupCreateFailure`, `GroupInviteFailure`, `GroupLeaveFailure`,
  `GroupKickFailure` — has **zero handlers** in the UI. Leave removes the group
  from the sidebar on send; delete navigates away on send; accepting an invite to
  a group that no longer exists keeps a phantom group locally.
- **Deletion never converges on other members.** Only the deleter gets
  `GroupEndNotification`; everyone else gets `GroupDisconnectNotification`, which
  appears nowhere in the UI. Their sidebar keeps the group and they can keep
  posting into it. Kicks are indistinguishable from voluntary leaves —
  `group:member-kicked` is subscribed in two places and **emitted by nothing**.
- **Invitations are auto-accepted with no consent.** `sendGroupRespond` is never
  called with `accept=false` anywhere: any peer who can address you can put you
  in a group, and the toast arrives after you have already joined.
- **"Load more" replaces the message list instead of prepending.** The prepend
  branch exists; the only caller never passes the flag. Scrolling up to read
  history destroys the recent view.
- **The group name never crosses the wire.** The dialog collects it, the create
  request has no name field, and every member computes a different fallback.
  Rename writes page-local React state only.
- **Unread counts and previews listen for an event nothing emits.** The store
  handles `group:message-received`; the real inbound path emits
  `group:message:new`, which has zero listeners. Two half-built pipes that do not
  meet.

### 207. Recorded, not fixed — resolve-on-failure outside revfs

The same sweep that found the write gap found more of the shape:

- **A live document's edits are never persisted for the RECIPIENT peer.**
  `updateDocumentState` returns early when the cache has no entry, resolving
  successfully while writing nothing — and only the creator ever calls
  `createDocument`. The unmount flush, documented as existing "so closing the tab
  does not drop the last edits", is the same no-op. Every peer who receives a
  shared document loses everything they type, silently.
- **Sign-out toasts "You have been fully logged out"** while the backend
  disconnect is best-effort and may have failed — a security claim that is false
  when the session lives on as an orphan.

## Round twenty-nine — a recipient can save, and you own your own messages, 2026-08-27

### 208. A peer who received a live document lost everything they typed — FIXED

`updateDocumentState` returned early when the cache had no entry, resolving
successfully while writing **nothing**. Only the CREATOR ever had an entry: the
recipient's open path builds a tab and no store record. So every peer who
received a shared document lost their work when the tab closed, with no error
anywhere — and the unmount flush, added specifically *"so closing the tab does
not drop the last edits"*, was the same no-op because it called the same
early-returning function.

`adoptDocument` keeps the id it was given — `createDocument` mints a NEW one,
which would make it a second document the peer never sees. `updateDocumentState`
now throws for an untracked document, and the final flush announces its failure
rather than swallowing it: the debounced write can retry on the next edit, but
the flush is the last chance.

### 209. Edit and Delete never rendered on your own group message — FIXED

The server sets `sender_id` from `get_username_by_cid` — a **username**. The
client compared it against `String(connectionInfo.cid)` — a **CID**. Those can
never be equal, so `isOwnMessage` was always false for every user on every
message: Edit and Delete are gated on it, and your own messages rendered
left-aligned as if someone else had sent them.

The server would have accepted those edits — its own check compares
`msg.sender_id != actor_user_id`, username against username. Only the UI was
dead. Fixed in the component, because `currentUserId` is genuinely a CID at three
other sites and would break if it became a username.

### 210. Method note — two of my three assertions were vacuous

They queried a `data-own-message` attribute that **does not exist**, so they
passed by finding nothing. The replacements open the actions menu and read its
items — because the trigger renders for every message (Reply is always
available), and only Edit and Delete are gated.

Related, third occurrence this campaign: a test file passed under vitest while
`tsc` rejected it, because the props object was cast `as never` and the spread
went untyped. **vitest passing is not evidence a test file is correct** — the
type-check is a separate gate and catches a different class of error.

And once more: removing the live-document adoption from the open path failed
NOTHING, because those tests asserted on the store, one layer below the
decision. There is now an assertion on the open path itself.

### 211. Recorded, not fixed — the first-run cliff is social, not technical

A deployment audit walked the quickstart as a reader would:

- **The README's dev quickstart produces an unreachable stack on macOS/Windows**
  and reports itself healthy. Every dev service uses `network_mode: host`, which
  the repo's own `docker-compose.local.yml` explains cannot work off Linux — and
  the healthchecks probe `127.0.0.1` from INSIDE the container, so `--wait` exits
  green while the browser gets connection refused.
- **The first user must type the operator's `WORKSPACE_MASTER_PASSWORD` into a
  browser modal, and no doc says so.** Worse, every subsequent user gets the same
  blocking modal until someone completes it, and its Cancel ejects them from the
  workspace they just joined. The README's "the first account to register
  initialises the workspace and becomes its administrator" is wrong in a
  load-bearing way: admin is granted automatically at connect, while
  "initialise" is a separate manual step requiring the secret.
- **That password is a permanent, identity-blind admin-escalation and deletion
  credential**, documented only as "first-time workspace initialization". Any
  authenticated account presenting it becomes a global Admin, persisted — and
  `delete_workspace` ignores identity entirely (`_user_id`).
- **Two users connecting simultaneously to a fresh workspace both become Admin**,
  and the second write erases the first's membership. `lock_workspaces()` exists
  for exactly this and its only caller is the theme handler — the
  fixed-in-one-place pattern, in the first-run path.
- **Inviting a second user requires GHCR org access the docs never mention.**
- **`.env.example` instructs a production UI build step the production compose
  deliberately made impossible**, and there is **no upgrade procedure at all for
  the local client stack** every non-operator user runs.

## Round thirty — a healthcheck that could not fail, and the first-run race, 2026-08-27

### 212. The quickstart reported success on a stack the browser cannot reach — FIXED

`docker compose up -d --wait` exits 0 when every healthcheck passes, and every
healthcheck in the dev compose probes `127.0.0.1` **from inside its own
container**. All five dev services use `network_mode: host`; on macOS and Windows
Docker runs in a VM, so "host" is the VM's network and the ports bind where the
browser cannot see them.

The container is genuinely healthy — it is listening on its own loopback — so the
healthcheck is **structurally incapable of detecting the condition it is inside
of**. The documented first command on a clean Mac prints success and leaves an
unreachable stack with no diagnostic anywhere.

`docker-compose.local.yml` explains this failure at length. The dev compose the
README leads with carries no such warning: **the explanation existed and was
never propagated to the path new users take.**

`scripts/check-stack-reachable.mjs` asks from OUTSIDE whether a request from this
machine reaches the app — deliberately not a healthcheck, because a container
cannot answer that about itself. The README now runs it as the last quickstart
step and says what to do when it fails.

### 213. Two users connecting at once both became Admin — FIXED

The connect-time member-add reads the whole workspace record, decides
`is_first_member`, and writes it back across two awaits with no lock. Both
observe `members == []`, both are promoted, and the second write **erases the
first's membership**.

The promoted-but-unlisted admin still passes every gate (`is_admin` reads the
global role and never consults membership) while `ensure_not_last_admin`, which
counts admins among `workspace.members`, cannot see them — so the workspace can
reach zero *visible* admins with an invisible one remaining.

`lock_workspaces()` was built for exactly this, and its only production caller
was the theme handler. Its other caller is a test that races 25 concurrent
read-modify-writes and asserts none is lost — the primitive was already proven;
only this call site was missing it. **First-run is precisely when two people are
most likely to connect at once, and the moment there is no other admin to
recover.**

### 214. Method note — two healthchecks, two different questions

A container healthcheck answers "is this process up". A user needs "can I reach
the app". Those diverge exactly when the networking is wrong, which is the case
worth catching — so the check that mattered had to live outside the thing being
checked. Worth applying to the other healthchecks here: every one of them probes
its own loopback.

## Round thirty-one — the first-run dead end, 2026-08-27

### 215. Dismissing the initialization prompt ejected the user — FIXED

The prompt asks for the operator's `WORKSPACE_MASTER_PASSWORD`, which no
ordinary member can obtain — and it is shown to **every** user until somebody
completes it, because the root workspace is seeded at boot with empty metadata
and only this modal ever writes `initialized: true`.

So for most users the only available action was Cancel — and Cancel did
`window.location.assign('/')`, throwing them out of the workspace they had just
successfully joined. **A prompt they could not complete, whose only escape
removed them from the product.**

Nothing about the workspace actually requires initialization: it is created at
boot from the master password, and Admin is granted at connect to the first
member. The marker is read **nowhere on the server** — it exists only to decide
whether to show this modal. The dismissal was already recorded in
sessionStorage, so deleting the navigation was sufficient.

The modal now says what the password is (the operator's, not the user's own) and
that skipping is safe; the button reads "Not now" rather than "Cancel", because
a prompt whose only escape was an eject should not describe that escape as
abandoning something.

The README claimed *"the first account to register initialises the workspace and
becomes its administrator"* — wrong in a load-bearing way, and corrected.

### 216. Method note — a source assertion that matched its own comment

The first version of the test **failed against the fixed code**: it searched for
`window.location.assign` and found it inside the comment explaining the removal.

This is the exact `toContain`-matches-a-comment trap from earlier in this
campaign, running the other direction — there a test passed because the word
appeared in prose; here one failed for the same reason. A source assertion must
read CODE. The fix strips comment lines before matching, and is worth applying to
every source-level assertion added since.

## Round thirty-two — the lock, applied to all of it, 2026-08-27

### 217. My own locking fix was half-applied — FIXED

An audit of the previous round's commit found it excluded only the writers that
took the lock. **A mutex only excludes participants** — the lesson already
written into this file — and three root-workspace writers still did an unguarded
read-modify-write:

- **`update_workspace`**, the first-run claim flow, reads the record whole,
  appends the caller to `members`, and writes it back. It could read `[user1]`
  and write `[user1]` over the `[user1, user2]` the connect path had just
  written UNDER the lock. user2's membership vanishes; `get_workspace` then
  refuses them with "Not a member", which the command processor maps to
  `WorkspaceNotInitialized` — so their client re-shows the setup flow. **Same
  first-run window the connect-side fix targeted.**
- **Both membership handlers' workspace-root branches.** Their earlier fix added
  `lock_nodes` to the node branch only.

### 218. Two admins could remove each other down to zero — FIXED

`ensure_not_last_admin` counts the admins and returns; the write happens
separately. Two admins removing each other both counted 2, both passed the
check, and both writes landed — leaving **zero admins**, which the guard's own
doc calls terminal: *"promotion requires an admin, so there is no way back."*

Placing the lock BEFORE the check, not after, is what makes the guard mean
anything. Note this is only closed if **all three** role writers take the same
lock across check-and-write; half-applying it leaves the TOCTOU intact, which is
the same lesson as #217 one layer down.

### 219. Method note — a test that passes with the fix removed, and saying so

The new last-admin test covers the SEQUENTIAL invariant only. **It passes with
the lock removed** — verified by control — because it removes admins one at a
time, so the check legitimately refuses the second.

The concurrent case is scheduler-dependent, and a probabilistic test that
usually passes is worse than none: it reads as coverage. So the test's docstring
states its scope explicitly and names what actually protects the race. The
alternative — renaming it "race test" and moving on — would have been the fourth
non-discriminating test this campaign, except deliberate.

### 220. Recorded, not fixed — the remaining locking surface

- **There is no user lock at all.** Six `get_user → mutate → insert_user` cycles
  write the whole record — role, permissions map, profile — with nothing
  serializing them. An admin granting a permission while that member edits their
  avatar loses one or the other, and the lost write can be an **authorization**
  change that enforcement then never sees. The fix is a dedicated `user_mutex`,
  not reuse of `lock_workspaces` — reusing it would couple every profile edit to
  workspace writes and create multi-lock paths that do not exist today.
- **`CreateNodeType` has no lock**: two admins creating node types concurrently
  lose one, and the lost type then cannot be used as a child anywhere. The lock
  must go in the caller — putting it in the schema accessors would deadlock
  `create_node` and `move_node`, which read the schema while holding `lock_nodes`.
- **`add_office_to_workspace` / `remove_office_from_workspace`** are unguarded
  and currently unreachable — no request maps to them. Fix when wiring, or now.
- **Lock ordering is currently sound**: the only nesting is
  workspace → index, index is strictly innermost, and no path takes two of
  {group, node, workspace}. Worth preserving deliberately — a user lock added
  carelessly inside the membership handlers would create the first real ordering
  constraint in the codebase.

## Round thirty-three — a regression I introduced, 2026-08-27

### 221. Four writes I gated always reported failure — FIXED

Two rounds ago I extended `awaitWriteResponse` from four write types to eleven.
**Four of the seven I added were gated on variants the response router HANDLES.**

The router emits `workspace:raw-response` from the `Success` and `Error` branches
and from its unhandled fallback. A variant with its own handler returns `true`,
and the response ends there. So the signal those four waits depend on was never
emitted: **every role change, theme save, message edit and message delete waited
out the full 15-second timeout and told the user "the change may not have been
saved"** — after the same handler had already applied it to the UI.

The action worked and the app said it had not. **That is worse than the bug I was
fixing**, which at least told the truth when things succeeded.

**What I should have checked and did not:** adding an entry to `SUCCESS_RESPONSES`
asserts a variant WILL arrive at the waiter. Nothing verified that. I checked the
server emits the variant — and never checked the client router forwards it.

The new test drives the real router and asserts every gated variant reaches the
waiter, including `Success`, so the three that always worked stay covered.

### 222. The general lesson: wiring a gate is two halves

This is the same shape the campaign keeps finding — a mechanism correct at one
end and unconnected at the other — except this time I built the disconnected
half. Every previous instance was someone else's; the pattern does not care.

A gate needs: the waiter, and proof the signal reaches it. I verified the first
against the server source and assumed the second. **The test that would have
caught it takes four lines and drives the real router** — which is now what
guards it.

### 223. Recorded, not fixed — error handling and recovery

- **A failed group-message load is a permanent spinner.** `loading` is cleared
  only by the `messages_loaded` event, and the fetch resolves on send with no
  error branch — so a refused response spins forever with nothing to press. Same
  shape disables "Load older messages" permanently.
- **The login "session already active" path never settles its promise** — it
  clears the timeout and neither resolves nor rejects, so the form shows no error
  and pressing Connect repeats the identical path, with the plaintext password
  retained in the closure for the page's lifetime.
- **ConnectionRetryModal has a LIFETIME retry budget of 10, never reset.** The
  counter accumulates across separate outages, so after ten total failures every
  subsequent disconnection opens a modal with a disabled Retry and no recovery
  but reload. Its close-on-success listener is also wired to an event nobody
  emits.
- **One authentication rejection silently disables auto-reconnect for that
  account forever** — the failure branch logs and never calls `cancelRetry`, so
  the map entry persists and the scheduler skips it. Send-level failures retry
  forever instead, with no ceiling and no UI.
- **Every collaborative-document edit ships a stale hash**, so the receiver's
  post-apply hash never matches and a full-state resend fires on every update —
  making genuine divergence indistinguishable from the constant false positives.
- **The camera toggle is inert in a call started audio-only** — it flips
  `enabled` on zero video tracks and broadcasts `video: true` anyway.
- **Group leave/kick fail silently** (try/finally with no catch), and delete-group
  navigates away even when no client existed to send the request.

## Round thirty-four — PWA: the update that broke other windows, 2026-08-27

### 224. Accepting an update broke every OTHER open window — FIXED

`skipWaiting` takes over all clients at once, so the new precache is active
everywhere the moment one window accepts. The old hashed chunks are gone from it
**and 404 from nginx**, which serves only the current build. Every route in this
app is lazy, so any other open window that then navigated somewhere it had not
already visited failed its dynamic import.

With nothing listening, that rejection reached the **top-level error boundary and
replaced the whole app** — for a user who did nothing but have a second tab open.
Multi-tab is first-class here; the leader/follower architecture assumes it.

`vite:preloadError` exists for exactly this, and a reload is the correct answer:
the new build is already the one installed. `preventDefault` stops the rejection
so the boundary does not also fire mid-reload.

### 225. iOS had no install affordance at all — FIXED

Safari never fires `beforeinstallprompt` — there is no programmatic install on
that platform — so `canInstall` was permanently false and the button rendered
nothing. That **silently zeroed the install funnel for every iPhone and iPad**, on
a product whose primary mobile surface is the installed PWA. The manifest and
apple-touch-icon groundwork was all in place; only the affordance was missing.

Detected by capability rather than browser name: **iPadOS reports a Mac
user-agent**, so a name check misses exactly the device most likely to install
this. Rendered as text rather than a button, because there is nothing to click —
it is the instruction Safari requires the user to follow.

### 226. Method note — an extraction that took too much

Splitting the initialization modal under the line gate, the first cut ran past
the explanatory panel and pulled the form's Label and Input with it. `tsc` named
them immediately, but the lesson is the boundary: I chose the end of the block by
searching for the next `</CardContent>` rather than the panel's own closing tag.

Reverted and re-cut at the real boundary. **A split is a refactor, and a refactor
that compiles by accident is worse than one that fails** — this one failed
loudly, which is the good case.

## Round thirty-five — two states with no way out, 2026-08-27

### 227. A failed group-message load spun forever — FIXED

`getGroupMessages` resolves when the request is SENT, and `loading` is cleared
only by the `messages_loaded` event, with no error branch. A refused or lost
response left the chat spinning with **nothing to press** and no escape but
navigating away or reloading.

Pagination was worse: "Load older messages" is `disabled={loadingMore}`, so one
lost response disabled it permanently for the rest of the session.

Both now use the deadline helper built for this exact shape in an earlier round,
rather than a second timeout — falling back to the empty state, which is at least
a statement the user can act on.

### 228. The reconnect budget was per-TAB-LIFETIME, not per outage — FIXED

`reset` was never destructured from `useRetry`, so the attempt count accumulated
across separate outages. After ten failures spread over hours, **every subsequent
disconnection opened a modal reading "Failed to reconnect after 10 attempts" with
Retry already disabled** and no recovery but a reload. Before exhaustion, each
outage inherited the previous count and started at inflated backoff.

Its close-on-success listener also waited for `connection-success` — which
**nothing emits**. The socket layer emits `on-ws-connection-success`, so a
connection recovered by any other path never closed the modal.

### 229. Method note — testing a listener against its emitters

The natural test for the dead listener — assert the component listens for
`on-ws-connection-success` — would have **passed on the broken version too**, had
the name been the other one. Asserting a string proves only that the string is
there.

So the test derives the set of events the websocket layer actually emits and
asserts the listened-for name is in it. The control failure reads: *"the modal
listens for 'connection-success', which the websocket layer never emits"* —
which is the finding itself, produced mechanically.

Worth generalising: **a listener and an emitter are two ends of one mechanism**,
and this campaign has now found four cases where only one end existed
(`group:message-received` vs `group:message:new`, `refresh()` with no caller,
`GroupListGroupsSuccess` with no handler, and this). A test that reads both ends
catches the whole class.

## Round thirty-six — the listener/emitter class, gated mechanically, 2026-08-27

Round thirty-five ended with the observation that a listener and an emitter are
two ends of one mechanism, and that four had been found with only one end built.
This round stopped finding them by hand.

### 230. A whole-tree scan for subscribed events nothing emits — GUARDED

`scripts/check-event-listeners-have-emitters.mjs` collects every emitter form in
the tree (`emit('x')`, `emitEvent('x')`, and the `name: 'x'` literals the group
translator later emits dynamically) and every subscription (`useEventListener`,
`eventEmitter.on/once`, `useEventListeners([...])`), and fails on any subscribed
name with no producer.

Getting it to zero false positives was most of the work, and each false positive
was informative:

- A bare `.on(` also matches Yjs documents and sockets, whose names are not on
  this bus — `change` and `update` are not dead, they are a different emitter.
- `emitEvent(` is a second emitter form used by the whole connection layer;
  without it, four live events read as dead.
- The group events are emitted via `emit(event.name, ...)`, so the literal only
  ever appears as `name: 'group:created'`. A scanner that reads only `.emit('` calls
  seven working events dead.

**Test files are excluded from both sides on purpose.** An event emitted only by
its own test is precisely the failure being hunted, and counting the test as a
producer would hide it. `group:message-received` is exactly that case.

Of the four survivors, three were already recorded (round 206) and are carried
in a `RECORDED_DEAD` map whose entries must name their finding — a debt marker,
not an exemption. The map is checked in **both** directions: an entry whose event
later gains an emitter fails as a STALE MARKER, so paying the debt is what
removes it, rather than the marker silently outliving the bug.

### 231. Reconnect never re-synced the peer roster — FIXED

The fourth survivor. `P2PRegistrationService` subscribed to
`connection:status-changed` to re-run `checkAndRegisterPeers()` as soon as the
socket returned. **Nothing has ever emitted that name** — the socket layer emits
`on-ws-connection-success`.

Sized honestly: this is a latency bug, not a breakage. A 30s poll runs
independently, so a reconnect paid up to a full poll interval with a stale peer
list rather than losing it permanently. Rewired to the real event.

One trap in the fix: the dead handler called `checkAndRegisterPeers()` with no
arguments, so simply renaming the event would have re-synced **without** the
options `start()` was given, silently dropping `autoRegisterAll` on every
reconnect. The service now records its start options and replays them.

### 232. The delete confirmation closed on the click, not the outcome — FIXED

`AlertDialogAction` **is** a Radix `Close` — provable in the installed package,
not just by reputation. `ConfirmDeleteDialog` wired `onClick={onConfirm}`
directly, so the dialog shut on the click, before an async delete resolved.

That made a whole error path dead code. `TreeNodesSection` catches a failed
delete and renders the reason into the dialog's own description, under a comment
reading *"Closed only on success. The dialog used to close in a `finally`, so a
failed delete looked exactly like a successful one."* The comment described the
intent; Radix closed it first, so the message was rendered into a dialog that no
longer existed. The failure surfaced only because a caller two layers up happened
to toast before rethrowing.

Fixed in the shared component with `preventDefault`, plus in-flight state that
disables both buttons — the double-click path had the same hole. All three
callers already close themselves from their own state, which is what made the
change safe to make once rather than three times.

### 233. Method note — the control must fail for the stated reason

The dialog test drives the real component; asserting the source contains
`preventDefault` would pass on any version that merely mentions it. Reinstating
the exact defect produces *"Unable to find role=alert"* — the error rendered into
a closed dialog, which is the finding itself.

The success-path test **still passes** on the broken version, and that is
correct: it is not the discriminating assertion, and a control in which every
test fails proves less than one where only the right ones do.

## Round thirty-seven — two unaudited surfaces, recorded not fixed, 2026-08-27

Two areas that earlier passes never reached. Findings below are **recorded, not
fixed**; the headline claim of each was re-verified against source before being
written down, because an audit report is a lead, not a fact.

### 234. The permission editor writes four role columns to one user — VERIFIED, NOT FIXED

`PermissionManager` is opened for a single `userId`, but presents a
Role × Permission matrix. `handleSave` loops `ROLE_HIERARCHY` and applies **each
role column's** delta-from-defaults to that one user. Unchecking "View content"
in the **Guest** column issues `Remove ViewContent` for a user who is an
**Owner**. Checking a box in one column and clearing it in another sends both an
Add and a Remove for the same user, and the surviving set depends on loop order.

It also never shows real state: `getUserPermissions` is send-only, the awaited
result is discarded, and the response — which does arrive, as
`user:permissions:loaded` — has no subscriber. So the matrix always renders role
defaults, existing overrides are invisible, and an untouched Save sends nothing
while toasting "Permissions saved successfully."

**Not fixed because the correct fix depends on intent**, and the two candidates
disagree: if this is meant to edit one member, the matrix is wrong and it should
be a single column fed by the loaded payload; if it is meant to edit role
templates, the per-user write is wrong. Guessing would replace a visible bug with
an invisible one in an authorization path. Flagged for a decision.

### 235. Recorded, not fixed — file transfer never reaches a terminal state

The protocol router defines `onProgress`, `onComplete` and `onStatusChange`, and
the parsers for every `FileTransferTickNotification` variant exist. **Nothing
subscribes to any of them** — the same class round thirty-six now gates for the
event bus, in a callback registry the guard does not cover.

Consequences: a receiver sits at "Downloading… 0%" **for ever, including on
success**, because the only code that marks an incoming transfer complete waits
on an in-band message whose sender throws `sendComplete not supported`. The
sidebar's Downloads section filters for exactly that unreachable state. The
sender learns nothing — not accept, decline, progress, completion or failure.

The sender has no bubble at all: the announcement goes straight to the wire
without a local echo, so "Waiting for acceptance…", "Sent successfully",
"Transfer declined" and **Cancel** are all unreachable. A sender cannot cancel a
transfer. Where cancel is reachable it is a local-map cleanup that tells the peer
nothing. `expiresAt` is set, shipped, and never compared to a clock.

The async mode — labelled "Recommended" — announces a `staged:` pseudo-ref that
its own upload code documents as "NOT a server path", and its completion matcher
resolves on **any** status notification for the same user, with no per-transfer
correlation: a concurrent transfer completing stamps this one complete with
someone else's download path.

### 236. Recorded, not fixed — admin forms discard typed input on unrelated events

`GeneralTab` re-seeds its name and description from the store on
`[.., state.nodes]`, and `state.nodes` is re-minted by **any** node event in the
workspace — including a teammate saving an unrelated document. Mid-edit text is
replaced, and because the reset also overwrites `originalName`/`originalDescription`,
`hasChanges` flips false and Save greys out: the work is gone and the UI denies
it existed. `ChatSettingsTab` has the identical dependency.

Adjacent: "Add member" sends an untrimmed typed username, and the server mints a
`User` for any id it does not find. A typo does not fail — it fabricates a
permanent roster entry for a person who does not exist, and toasts that they were
added.

## Round thirty-eight — a poisoned retry, a shadow type, and a button that told you to press it, 2026-08-27

### 237. The first failed init poisoned every later attempt — FIXED

`initService` caches its in-flight promise so concurrent callers share one
attempt. **On failure the promise was left set**, so the guard replayed the same
rejection for ever.

The full chain is the worst part. A brand-new user without the local agent
running gets a connection failure — the exact case the "install the agent" hint
exists for. They install it. They press Retry. The cached rejection returns
**instantly**, nothing re-attempts, and after ten of those the modal reads
"Failed to reconnect after 10 attempts" with Retry disabled. Login and Join both
begin with `await init()`, so they replay it too. Only a page reload recovered,
and nothing said so.

One line: clear the promise in the catch.

The test drives the real `initService` — its `initOps` is injectable, which is
SBIO paying off — and **counts attempts**, because asserting that the second call
rejects would pass on the broken version too: the broken version rejects
precisely because it never tried.

### 238. Method note — a control that flips the wrong test is a broken test

The first control run showed the retry test failing (right) *and the concurrency
test passing without the fix while failing with it* (impossible — the catch does
not run on success).

That was the test, not the code: `initService` short-circuits on a `window`
global, test one left it set, and my `beforeEach` cleared a **guessed** key name
rather than the imported `GLOBAL_INIT_KEY`. `create` was never called at all.
Chasing the anomaly instead of accepting the green run is what found it. After the
fix the control is clean: only the discriminating test moves.

### 239. `ObjectTransferStatus` is hand-written fiction — RECORDED, blocks the file-transfer stack

Round thirty-seven recorded that the SDK's progress and completion ticks have no
subscribers. Wiring them up revealed **why nobody ever did**: the parser they
would feed is written against a type that does not exist.

`file-transfer/protocol-types.ts` hand-declares `ObjectTransferStatus` instead of
importing the generated one, so `tsc` validates the whole parser against the
invention and passes. Every variant disagrees with
`@avarok/citadel-protocol-types`, which is generated from the Rust enum:

| hand-written (fiction) | generated (real) |
|---|---|
| `{ ReceptionTick: { object_id, received, total } }` | `{ ReceptionTick: [number, number, number] }` |
| `{ ReceptionComplete: { object_id } }` | `"ReceptionComplete"` — a bare string |
| `{ TransferComplete: { object_id } }` | `"TransferComplete"` — a bare string |
| `{ Fail: { object_id, message } }` | `{ Fail: string }` |

Two independent sources agree against the local copy: the generated `.d.ts` and
the Rust `ObjectTransferStatus::ReceptionTick(_cid, _rel_group_id, percent)`.

The consequence is larger than a parsing bug. **The real tick carries no object
id at all**, so the `objectId -> transferId` correlation the entire file-transfer
stack is built on cannot be satisfied from these notifications. This is not a
subscription that was forgotten; it is a join that cannot be made as designed.

**The subscriptions were reverted rather than shipped.** Subscribing a parser
that can never fire would have been exactly the defect this campaign exists to
find — a mechanism built at one end — and would have been announced as a fix.
Two `it.fails` tests now pin the divergence: they feed the canonical shapes and
document what the parser does with them, so the day the type is corrected they
flip to passing and demand attention.

What did survive is `applyTransferOutcome`: one idempotent terminal-state applier
shared by both planes, so whichever reports first wins and no transfer can be
double-completed.

### 240. The re-offered update's Reload button did not reload — FIXED

`PwaUpdatePrompt` gates `onNeedReload` on a `weInitiatedUpdate` ref, so one
window taking an update does not yank every other window. The return-to-tab
re-offer — added in an earlier round of this campaign — **omitted setting that
ref**. Pressing Reload therefore took the other branch and displayed *"Updated in
another window — reload when you are ready."* The user pressed Reload and was
told to reload.

My own two-ends failure, in the round that named the pattern. Both toasts now
share one `acceptUpdate` handler, so they cannot drift apart again.

## Round thirty-nine — a fix that never propagated, and a failure reported as a timeout, 2026-08-27

### 241. The initialisation write erased the workspace theme — FIXED (server)

`Workspace::metadata` is one JSON object several features share: initialisation
writes `{"initialized": true}`, theming writes a `theme` key. An earlier round
fixed the theme handler to **merge** rather than assign, with a comment
explaining that assigning erased the initialisation marker and reopened the setup
modal over a working workspace.

`update_workspace` — the path that writes the initialisation marker — never
received that fix. It still did `workspace.metadata = meta_bytes`, so a theme
configured before someone ran "Initialize & Become Admin" was erased for
everyone. The exact mirror image of the bug the theme path was fixed for, one
function away, for months.

This is the *fix that was never propagated* pattern, and the reason it recurs is
that the correct rule lived inside one call site. It now lives in
`metadata_merge::merge_metadata_document`, and **both** writers call it, so a
third writer inherits the rule instead of rediscovering the bug.

The helper refuses a non-object payload rather than applying it: a bare array or
string carries no keys, and writing it would erase every other feature's state.
It tolerates an unparseable *existing* document, because refusing the write there
would make a once-corrupted workspace permanently unconfigurable.

**The test drives the real command, not the helper**, because the helper was
never the broken part: it seeds a theme, runs the initialisation write, and
asserts the theme survived. Reinstating the assignment fails it with *"the
initialisation write erased a theme it never mentioned"*.

### 242. A registration that SUCCEEDED was reported as a timeout — FIXED

With `connect_after_register` the internal service re-dispatches a Connect under
the **same request_id**, so its failure arrives as a top-level `ConnectFailure`.
The handler matched top-level `ConnectSuccess` but only the `Response`-wrapped
`ConnectFailure` — so the failure matched nothing, fell through to the 30s
timeout, and reported **"Registration timed out after 30 seconds"** for an
account that had been created.

The user then retried and was told the username already exists, for an account
they did not know they owned. Work silently done, failure wrongly reported, then
a second error contradicting the first.

The asymmetry is the tell: the same variant family, one direction matched at both
nesting levels, the other at only one.

### 243. Method note — the closure that could not be tested

`createResponseHandler` was a closure inside `useJoinRegistration`, so the missing
branch could not be reached without rendering the whole join flow — which is
plausibly why it went unnoticed. The file was also 259 lines, over the limit, so
extraction was owed regardless.

It is now `registration-response-handler.ts` with its two closures injected, and
the test drives it directly. Removing the branch again fails exactly the two
tests that assert the new behaviour, while the three guarding the old behaviour
keep passing — the discrimination a control is for.

## Round forty — upgradability: two ways a build could not replace itself, 2026-08-27

Both findings are about the product lifecycle rather than a feature: an app that
cannot reliably install its own next version has a hole no amount of feature work
closes.

### 244. A crashed build could never apply the fix for itself — FIXED

`AppErrorBoundary`'s recovery button was `onReload={() => window.location.reload()}`.
A same-tab reload does **not** activate a service worker sitting in `waiting` —
the old worker keeps controlling the page and keeps serving the old, crashing
precached shell.

The trap closes completely. When the boundary is showing, `PwaUpdatePrompt` is
unmounted — and it is the **only** sender of `SKIP_WAITING` in the whole app. So
a fixed build downloads (the hourly `registration.update()` poll works), installs,
and then sits in `waiting` for ever while the user presses "Reload workspace"
against the identical crash. Recovery required closing *every* tab on the origin,
which nothing anywhere tells the user.

The half of this mechanism that fetches the fix worked; the half that activates it
did not exist — in the code whose own comment says the hourly poll was added
"because users were stuck on the broken build".

Recovery now hands control to any waiting worker first, then reloads **either
way**: the user pressed a button and is owed an outcome, so a worker that never
takes control is bounded, not waited on.

Tested at both levels, because they fail independently: the helper against a fake
`ServiceWorkerContainer`, and the real boundary rendered around a throwing child,
whose button must actually post the message. Reinstating the plain reload leaves
`tsc` and every helper test green — only the boundary test moves.

### 245. Every WASM-changing update ran one broken session — FIXED

The `.wasm` binary lives at a **stable** url while the wasm-bindgen glue JS is
bundled into hashed chunks, so the caching strategy alone decides whether the two
match. A previous round moved this from `CacheFirst` to `StaleWhileRevalidate`
for exactly this reason — but SWR still serves the stale copy **first** and
revalidates behind it.

So the very reload that applies an update — the one the toast promises will
reconnect your session — was guaranteed to pair the new glue with the previous
binary. The symptom is not a clean failure: every internal-service call silently
no-ops, so login and register do nothing at all, with no message and no
server-side log line. The *following* start would be correct, with nothing telling
the user to reload again.

Now `NetworkFirst` with a bounded `networkTimeoutSeconds`: correct pairing
whenever the network is reachable — which it must have been for an update to have
arrived — while the cache still answers offline starts and captive networks.

The test reads the real vite config and **strips comments before matching**. That
is not incidental: the file names `StaleWhileRevalidate` twice in prose
explaining why it was abandoned, and an earlier round of this campaign already
produced one source assertion that matched its own comment.

### 246. Recorded — the declared Node engine is not enforced

`package.json` declares `"node": ">=20"` and CI uses 20, so the production build
is fine there. On Node 18 it fails with `ReferenceError: crypto is not defined`
raised from inside `@rollup/plugin-terser` — a message that names neither Node
nor the version requirement.

Not fixed unilaterally: `engine-strict` applies to transitive dependencies too and
can fail installs for unrelated reasons, so turning it on is a decision with a
blast radius rather than a one-line fix. Recorded so the next person who hits it
does not spend the afternoon on it.

**Verification note:** the caching change was verified by test and typecheck; a
local production build could not be run for the reason above. CI builds it.

## Round forty-one — the other direction, and two audits recorded, 2026-08-27

### 247. Group invite notices were written to nobody — FIXED

`notification:show` had **three emitters and no listener anywhere**. The arrival
notice and both failure notices went nowhere. The call site's own comment claimed
`applyGroupInvite` "swallows its own failures with a user-facing toast" — the
toast did not exist, so a failed invite vanished exactly as silently as the
comment says it must not.

Now rendered through the same `toast()` every other surface uses.

### 248. Its test asserted the emit, which is how it survived

The existing test asserted `emit('notification:show', ...)`. That assertion
**passes for precisely as long as the notice reaches nobody** — it measures the
send, not the delivery, which is the same shape as every resolve-on-send defect
in this register, one layer up.

It now asserts the rendered surface, and a second test covers the failure branch
that had no test at all. Restoring the emit fails both.

### 249. The guard checks one direction, and the other resisted mechanisation

Round thirty-six's guard catches listeners with no emitter. This finding is the
mirror — an emitter with no listener — which the guard does not see, so I tried
to extend it. **It does not work yet, and shipping it would have been worse than
not having it.**

Two reasons, both worth recording:

- The emitter side must accept `name: 'x'` literals to see the group translator's
  dynamically emitted events. In reverse that pattern matches every theme preset,
  MDX template and column heading in the tree — "Tokyo Night" and "Meeting Room"
  are not dead events.
- More seriously, `workspaceEvents.onWorkspaceEvent('workspace:loaded', …)` is a
  **third** subscription facade the guard does not know about. Scanning naively
  reports 75 dead emitters, of which the great majority — every `workspace:*`,
  `node:*` and `member:*` event — are consumed through it.

That last point is not just a reverse-direction problem: **a listener registered
through that facade is invisible to the guard in the direction it does check.**
Recorded as a known limitation rather than papered over; the honest next step is
to enumerate the subscription facades first, not to loosen the matcher.

### 250. Recorded, not fixed — the calling stack

The branch's headline feature, audited for the first time. Findings recorded in
full; none fixed this round, because several interact and the top two need a
decision about intended behaviour rather than a patch.

- **Starting a call from another conversation destroys the one you are in.** No
  busy guard on the 1:1 entry button — the group entry has one, so this is the
  fix-in-one-place pattern again. The old stream's tracks are never stopped (the
  camera stays lit) and the orphaned capture pump keeps feeding the shared
  encoders, so the new peer receives two interleaved streams.
- **Glare leaves the loser with a dead ringing card.** Adoption routes through a
  terminal state on the live manager, which trips the provider's teardown and
  nulls the manager ref — so Accept and Decline are both no-ops while the ring
  plays out its full 45 seconds. The glare rule itself is correct; the layer
  above defeats it.
- **A call to a session in a follower tab rings audibly with no card and no way
  to answer.** The card is leader-gated; the sound is not.
- **The capability probe never checks `MediaStreamTrackProcessor`/`Generator`**,
  which the audio path hard-depends on. Where they are missing the call rings,
  connects, and the timer ticks — carrying no audio in either direction.
- **`end()` awaits unbounded sends before releasing the camera**, so Leave can
  wedge with the camera lit while `decline()`, which applies its state first, is
  immune. The asymmetry is the bug.
- **A fatal encoder error kills outbound media permanently and silently** — the
  decoder path nulls its handle to force a rebuild; the encoder path only logs.
- **The caller is never told why a call did not connect**: decline reasons are
  recorded "for the UI to explain itself" and every one of them renders as the
  panel silently disappearing.

### 251. Recorded, not fixed — the user directory is wired to a demo simulation

`sendRegistrationRequest` reaches `setTimeout(… "Simulate a response for demo
purposes")` and touches no wire, while the UI reports "Request Sent" in green.
The simulation is itself inert, so `userConnections` is never written and
`canMessageUser` is permanently false — every member, including genuinely
connected peers, gets "Connection Required", and the directory's Online tab can
never populate.

The real registration pipeline exists and works; the directory is simply
connected to the fake one. Also recorded: a deleted P2P message returns on
reload (delete never touches the page store, while edit does), and OS
notification permission is only ever requested from a hidden tab, where browsers
suppress the prompt.

## Round forty-two — three calling defects that all look like a healthy call, 2026-08-27

Taken from the calling audit: the three findings that needed no decision about
intended behaviour, only the propagation of a pattern the sibling code already
had. Every one of them presents as a call that rings, connects, ticks its timer,
and carries nothing.

### 252. The capability probe never asked whether media tracks can be processed — FIXED

`probeMediaCapabilities` checked WebCodecs and Opus encode, and stopped. But the
pipeline moves samples through **Insertable Streams** at both ends, and neither
end has a fallback for audio:

- capture without `MediaStreamTrackProcessor` logs one debug line and gives up;
- the inbound sink without `MediaStreamTrackGenerator` returns a writer that
  closes every frame it is handed.

So on a browser with WebCodecs but without those, the probe said `supported:
true`, the buttons enabled, the call rang, connected, the timer ran and the mic
indicator lit — and **neither side heard anything, in either direction**.

Both detectors now live in one `track-transforms` module instead of being
private to the two consumers, so the capability question and the capture code
cannot disagree about what the browser has. The existing disabled-with-reason UI
handles the rest for free.

### 253. Leave could wedge with the camera still lit — FIXED

`end()` awaited the CallEnd sends **before** closing sessions and applying
'ended'. `sendSignal` is unbounded all the way down to the WASM messenger — the
constants file says exactly that — so a stalled send left the stage up, the
duration ticking and the camera on while Leave appeared to do nothing. Pressing
it again queued another unbounded send.

Worse: the ring deadline fires `end('unanswered')`. A stalled send there meant
'ended' was never applied, so the deadline never re-armed and **no timer anywhere
was left** to rescue the call.

`decline()` was always immune because it applies its state first. The two now
agree: local state settles, then the goodbye and the session close go
best-effort. Peers detect a departure through liveness regardless, so neither may
hold up a teardown the user just asked for.

### 254. A fatal encoder error killed outbound media permanently — FIXED

The **decoder** path nulls its handle on a fatal error so the next frame builds a
fresh codec, with a comment explaining why. The **encoder** path only logged.
A closed codec makes the next `encode()` throw, and that throw escapes the
capture pump's read loop — which then exits for good. Video and/or audio stopped
reaching the far side for the rest of the call, with nothing shown to anyone:
the camera stayed lit and heartbeats kept the call "alive".

Fixed for both encoders, plus the `state === 'closed'` guard the decoder already
had, since the error callback fires asynchronously and a frame can race it.

### 255. Method note — a control that hangs is still a control

Two of these tests initially failed for reasons that were mine, not the code's,
and both were worth the detour:

- Wedging **every** `sendSignal` hung `start()`'s own invite send rather than
  `end()`. The test now stalls only the CallEnd — and the detour recorded
  something real: `start()` awaits an unbounded send too.
- A third assertion expected `closeSession` on a call that was still ringing out,
  where no media session has been opened yet. The premise was wrong, so the
  assertion was removed rather than contorted into passing.

The end() control does not fail with a mismatch — it **times out at 5000ms**,
which is precisely the defect: Leave never returning.

## Round forty-three — I built a check that could not fail, 2026-08-28

### 256. The stack-reachability guard reported a dead port as reachable — FIXED

This campaign has repeatedly recorded *checks that cannot fail*. This one was
mine, and it was the single guard for the documented macOS blind spot where every
container healthcheck probes its own loopback and proves nothing.

It fetched the port and decided from the error **text** whether the failure was a
refused connection or a protocol mismatch, treating anything unmatched as proof
the port was open:

```js
if (tcpOnly && !/ECONNREFUSED|abort|timeout/i.test(message)) return { ok: true };
```

undici sets `error.message` to the constant `"fetch failed"` and puts the real
cause in `error.cause`. Verified directly rather than reasoned about:

```
message: "fetch failed"   cause: connect ECONNREFUSED   regex on message: false
```

So a refused connection took the `ok: true` branch. Running the pre-fix script
against a port with nothing on it prints **"reachable: internal service"** and
exits 0 — the exact condition it exists to catch.

Two things made it survive: the default was "assume open unless proven
otherwise", and it runs nowhere in CI (Linux runners do not have the problem it
was written for), so nothing ever exercised its failing branch.

Now it opens a **TCP socket** for such targets instead of parsing error strings.
That answers the actual question — is anything listening — with nothing to
misread, and still works for a WebSocket-only port that would never speak HTTP.
The HTTP branch now reports `error.cause`, because "fetch failed" alone tells the
reader nothing.

**The lesson generalises past this script: a check whose default is `ok` when it
does not understand what it saw is not a check.**

### 257. One flaky chunk fetch disabled calling until a page reload — FIXED

`ensureManager` memoises its in-flight build so two concurrent callers cannot
each construct a manager. The build had **no catch**, so a single failure was
permanent: the rejected promise stayed in the ref, the CID guard kept matching,
and every later start, accept and inbound signal awaited the *same* rejection —
unhandled, with no toast and no retry.

The likely trigger is a lifecycle one: the codec table is dynamically imported,
so a redeploy that invalidates its chunk hash breaks it for anyone whose tab is
still open. Incoming invites were then dropped without a decline, so callers rang
out the full 45 seconds against a peer who could never answer.

The sibling defect is in the capability probe: no catch there either, so the
initial `"Checking whether this browser supports calls…"` was permanent — the one
raised-forever flag in a feature that otherwise uses deadlines everywhere.

Both now clear their state so the next attempt is a real retry, and the probe
falls back to a reason the user can act on.

### 258. The caller was never told why a call did not connect — FIXED

`CallState.reason` is documented as being there "for the UI to explain itself",
and both surfaces hide the `ended` status — so declined, busy, unsupported, no
microphone and forty-five seconds unanswered all presented identically: the
outgoing panel silently vanished with a down-chime.

`no-devices` is the case that makes this matter. The callee's client sends it
*precisely* so the caller knows to try another way, and it was the outcome most
likely to be read as being ignored.

The map returns null for a normal hangup and for any reason this build does not
recognise — silence beats "the call ended because it ended" — and the peer name
falls back to a generic noun rather than a raw CID, which this register has
already recorded leaking into the UI as identity.

## Round forty-four — the typed message that never became a document, 2026-08-28

### 259. "Turn this message into a document" discarded the message, every time — FIXED

The flow exists only to turn typed text into a live document — the modal opens
solely when the compose box is non-empty. The text was passed all the way to the
last function and dropped there: the parameter was underscore-ignored, and
`createDocument` was called with no initial doc. The compose box was then cleared
regardless. **The document opened empty and the work was gone, on every use,
whether or not anything failed.**

The shape of the fix matters as much as its presence. TipTap's `Collaboration`
extension binds to `getXmlFragment('default')` and expects ProseMirror's document
model, so a plain `Y.Text` insert would have persisted, round-tripped, and still
rendered a blank page — the same silent loss with more steps and a green result.
Paragraphs are built as `XmlElement('paragraph')` nodes, and the tests assert the
fragment rather than merely that something was written.

The editor also mints its **own** `Y.Doc` on mount and loads persisted state into
it, so a seed that does not survive an encode/decode is not a seed. That round
trip is its own test.

### 260. The same function's error branch was unreachable — FIXED

`handleCreateDocument` swallowed every failure in a `debugLog` catch, while
`LiveDocumentModal` had already been written to render exactly that failure
("Could not create the document…") — with its own comment noting that `debugLog`
is a production no-op. The correct fix applied in one place, the sibling keeping
the bug.

It also opened with `if (!currentUserCid) return;` — a success-shaped no-op that
closed the modal and cleared the compose box having created nothing.

Both are gone, and the two fixes compose: because the call now throws, the caller
no longer reaches `setInputMessage('')`, so a failed creation **keeps the user's
text in the box** instead of destroying it on the way to an error nobody saw.

### 261. Recorded, not fixed — from the same audit

- **Unsaved MDX edits are discarded with no warning** on Cancel, on clicking any
  other sidebar node (the view is keyed by node id, so it unmounts mid-edit), and
  on browser close. There is no `beforeunload` guard and no dirty check.
- **Live-document persist failure is announced to nobody.** `live-document:persist-failed`
  has one emitter and no subscriber — the same class round thirty-six gates for,
  in the direction the guard cannot yet see.
- **Two people editing one MDX page: last writer silently wins.** `UpdateNode`
  carries no revision or hash, and the existing comment records that only "the
  safe half" of the fix was done.
- **RE-VFS drops queued peer ops after MAX_OP_RETRIES with a debug line, then
  toasts "Tree synced with peer"** — the give-up is not counted in what the
  caller checks, so the same click that discards a change reports success.
- **`UpdateWorkspace`, `CreateWorkspace` and `UpdateUserProfile` still resolve on
  send**, and the profile spinner has no deadline, so a refusal locks the
  settings form in "Saving…" until it is closed and reopened.
- **The YJS ack "retry" never resends anything** — `PendingAck` does not store
  the update bytes, so a resend is impossible — and the badge never leaves
  "Synced".

## Round forty-five — gating the last resolve-on-send writes, and the trap in doing so, 2026-08-28

### 262. Three more writes reported success on send — FIXED

`UpdateWorkspace`, `CreateWorkspace` and `UpdateUserProfile` were still
send-only. The workspace rename is the worst: `GeneralTab` awaited it, toasted
"updated successfully" and cleared its dirty flag — so a refusal (no permission,
wrong master password) left the admin believing the rename had landed,
contradicted seconds later by a disjoint global error toast, with the name
unchanged.

The profile save compounded it: the settings form disables **every input** on
`isSaving`, which was cleared only by the success event and by the catch of a
promise that could not reject. A refusal locked the whole panel in "Saving…"
until it was closed and reopened. Gating the send was the entire fix — the catch
that clears the flag and toasts was already there, waiting for a rejection that
never came.

### 263. Two of the three would have reproduced my own regression — CAUGHT BEFORE SHIPPING

Round twenty-six shipped exactly this change for eleven types and broke four of
them, because `awaitWriteResponse` settles on `workspace:raw-response` and most
router handlers apply a response and `return true` **without emitting it**. I had
verified the server sends the variant and never checked the client forwards it.

Checked first this time. `Workspace` emits (fixed in that round). `CreateWorkspace`
and `UserProfileUpdated` **did not** — gating them as-is would have made every
successful workspace creation and profile save wait out 15s and report possible
failure. The emit was added to both handlers before the table entry.

### 264. And the test for it could not fail — CAUGHT, then fixed

To stop this recurring I wrote a test that drives the real router with each
gated variant and asserts the raw event arrives. **It passed with the emit
deleted.**

The wire shape was wrong — I nested the payload one level too deep, so every
variant fell through to the router's *Unhandled* branch, which also emits
`workspace:raw-response`. Every variant "passed", and would have passed whatever
the handlers did.

This is the second check-that-cannot-fail I have written in two rounds, both with
the same root cause: **a fallback path that produces the same observable as
success.** The stack guard defaulted to `ok` on an error it did not recognise;
this defaulted to the fallback's event.

The fix is a precondition. The test now spies on `emit` and requires at least one
**domain** event — proof that a real variant handler ran, since only the Unhandled
branch emits raw-response alone. That precondition immediately earned its keep by
catching a malformed test payload (`NodeDeleted` without `children_deleted`,
which made the handler throw into the emitter's catch and look unhandled).

With it, deleting the emit fails with the finding itself: *"UpdateUserProfile is
gated on 'UserProfileUpdated', but the router handles that variant without
emitting 'workspace:raw-response'."*

**The general rule: when a test asserts an observable that a fallback path also
produces, assert first that the fallback is not what produced it.**

## Round forty-six — I broke CI with my own comments, 2026-08-28

### 265. Eight files over the 250-line cap, every one pushed there by me — FIXED

Adding the unsaved-edit guard made me run the CI line-cap check locally for the
first time in this campaign. **Eight files were over, and CI was red.** The
before/after is unambiguous:

```
250 -> 264  ConnectionRetryModal.tsx      249 -> 261  media-pipeline.ts
247 -> 278  CallProvider.tsx              249 -> 263  call-manager.ts
243 -> 251  p2p-registration-service      248 -> 270  p2p-transfers.ts
244 -> 259  codec-support.ts              250 -> 263  call-session.ts
```

Every one sat at 243–250 — just under the cap — and every one was pushed over by
the explanatory comments I have been adding with each fix. The comments are
worth having; writing eight lines where three carry the same information is not,
and doing it to a file already at the limit breaks the build.

Fixed by condensing my own prose and by five real extractions —
`transfer-outcome`, `media-decoders`, `codec-negotiation`, `use-call-capability`,
`use-retry-countdown` — which is what the cap is for. **Not by adding anything to
the skip list**, which would have been dodging my own rule.

Two things this cost that are worth recording. Extracting `handleTransferComplete`
alongside `applyTransferOutcome` broke three import sites; splitting the decoders
out of `media-pipeline` moved a type its consumer still imported from the old
module. Both were caught by `tsc` immediately — but only because I ran it after
each step rather than at the end.

### 266. Method note — a gate you never run locally is a gate you will break

The line cap runs only in CI. I have been pushing after `tsc`, `eslint`,
`vitest` and the submodule-pointer guard, and never this one — so eight
violations accumulated across many rounds without a single local signal.

This is the same shape as finding 256, where the stack-reachability guard could
not fail *and* ran nowhere in CI. **A check that nothing exercises is a check
that is not running**, whichever side of the fence it sits on.

### 267. Unsaved MDX edits could vanish on Cancel or a browser close — FIXED

The editor buffer is plain component state, Cancel was a bare toggle, and the
load effect then restored the stored document over the top. Closing the tab did
the same with no prompt anywhere.

Cancel now confirms when the buffer is dirty, and a `beforeunload` guard is armed
while it is. The baseline is captured when editing BEGINS rather than compared
against the stored document, because the two differ legitimately — a node with no
content opens with a template the user has not written and must not be warned
about.

**Still open, and stated plainly:** clicking another node in the sidebar unmounts
the editor (the view is keyed by node id), and that path is not yet guarded. It
needs interception where the navigation happens, not in the editor.

## Round forty-seven — the third check that could not fail, 2026-08-27

### 268. The icon-button guard passed every unnamed button with an arrow handler — FIXED

`check-icon-button-names.mjs` matched `<Button\b((?:[^&gt;]|\n)*?)&gt;`. The `[^&gt;]`
attribute capture stops at the **first** `&gt;` — which, for any button carrying
`onClick={() =&gt; …}`, is the `&gt;` inside the arrow. The handler body then landed
in the "children" half, and the text check counted code like `setVisible(false)}`
as the button's visible label.

So it passed essentially every unnamed icon button in the codebase, while
printing **"OK — all 39 icon-only Buttons have an accessible name"**. Thirteen
were nameless, including the per-row remove-member control in the Create Group
flow — destructive, repeated per row, announced by a screen reader as just
"button".

Rewritten with a brace-, quote- and comment-aware tag scanner. It now also sees
**native `&lt;button&gt;`** and icon-only buttons that are not literally
`size="icon"` — the file-manager toolbar's New folder / Upload / Sync were all
invisible to the old rule — and it rejects `aria-label=""`, which the old
presence-only test accepted. Scanned count went from 39 to 53.

Two calibration passes were needed, and both are worth recording:

- Stripping JSX **expressions** to find "no text" flagged 57 buttons, most of
  which render `{loading ? <Spinner/> : 'Save'}`. The rule is now that children
  must be **nothing but self-closing elements** — the shape that is always
  nameless.
- `ThemePreview` spreads `{...hotspot(id)}`, which supplies `aria-label`. A
  spread cannot be judged statically, so it is exempted **knowingly** and in
  writing: it is this guard's one blind spot, and a false accusation would push
  someone to add a duplicate label.

### 269. Three guards reported a pass when their input was missing — FIXED

Trying to run the OLD guard for comparison produced neither a pass nor a
failure: *"citadel-workspaces/src absent (submodule not checked out);
skipping."*, exit 0.

`check-storage-keys` and `check-destructive-contrast` had the same branch. Every
CI job that runs them uses `submodules: recursive`, so the branch is unreachable
there — but that is an argument for deleting it, not for keeping it. **A guard
that cannot find what it guards has verified nothing, and must say so.** All
three now exit 1 with a message naming what was missing.

This is the third cannot-fail check found in this campaign and the third that was
mine. The three have one shape between them: **when the check did not understand
what it saw, it returned success** — an unrecognised error string, a fallback
event, an absent input.

### 270. Recorded, not fixed — two authorization holes in the local agent

From the internal-service audit. Both are PROVED from source and neither is a
UI-layer fix:

- **`ClaimSession` can hijack any account's live message stream.** The request is
  exempt from the ownership gate, and the only guard on taking over an ACTIVE
  session is a boolean the *client* supplies (`only_if_orphaned`). Nothing checks
  that the claiming connection has any prior relationship to the session. The
  handler then reassigns `associated_localhost_connection` unconditionally, so
  the victim's inbound P2P notifications route to the attacker's socket. Victim
  CIDs are discoverable because `GetSessions` is also ungated. No credentials
  required, and the dev stack binds all interfaces with WebSocket exempt from
  CORS — so "any localhost client" includes a page the user merely visits.
- **The ownership gate passes any CID that is not currently in the map.** It
  refuses only when the CID is present AND owned by another connection. The
  LocalDB handlers never consult the map, so read/write/**clear** against an
  offline account's persistent store all succeed — and that store holds ILM
  messenger state and offline-message queues, so a wipe destroys undelivered
  messages. `LocalDBGetKV` is exempt unconditionally, so it reads even a live
  account's store.

The audit also **refuted** a flagged claim: `propose_target(cid, 0).expect(...)`
in `local_db/mod.rs` cannot panic from client input, because the `ID` path
returns `Ok` unconditionally. Recorded so nobody re-chases it.

### 271. Recorded, not fixed — accessibility findings beyond the guard

- **The incoming-call card's live region does not exist.** Its own comment says
  it "announces itself through a live region instead" of taking focus; there is
  no `aria-live` anywhere in the call path. The *outgoing* panel got
  `role="status"`; the incoming one did not. A blind user with call sounds off is
  never told a call is ringing.
- **Every pre-auth overlay is a modal in appearance only** — Login, Join,
  ServerConnect, SecuritySettings and both initialisation modals have no
  `role="dialog"`, no focus move-in, no trap and no restore; Join and
  SecuritySettings have no Escape handler at all. Tab walks controls buried under
  the scrim.
- **`check-hover-only-controls` cannot fail for named Tailwind groups** — it
  requires the literal `group-hover:opacity-100`, so `group-hover/menu-item:` and
  `invisible group-hover:visible` pass. Currently harmless only because the one
  component using that form is imported nowhere.
- Opening a folder in the file grid is **double-click only**; the tree sidebar
  rescues keyboard users, so this is degraded rather than blocked.

## Round forty-eight — the front door was a modal only to sighted mouse users, 2026-08-27

### 272. Six pre-auth overlays had no dialog semantics at all — FIXED

Login, Join, ServerConnect, SecuritySettings and both initialisation modals were
each a `fixed inset-0` div with a scrim. Visually a modal; to assistive
technology, nothing:

- **No `role="dialog"`**, so a screen reader was never told one opened and focus
  stayed on whatever launched it.
- **No trap**, so Tab walked the landing-page controls buried under the *opaque*
  scrim — focus landing on things the user cannot see, which is WCAG 2.4.11.
- **No restore**, so closing dropped focus to `<body>`.
- Join and SecuritySettings had **no Escape handler at all**.

This is the front door of the product, and every Radix surface deeper in the app
already does all of this correctly.

Fixed once, in `useDialogOverlay`, rather than six times by hand. Two details
were not obvious from the audit and only appeared while wiring it:

- **Login renders SecuritySettings inside its own scrim.** Two live traps both
  listening on the document answer one Escape twice and fight over focus, so the
  hook takes an `enabled` flag and Login stands down while it has delegated.
- **The initialisation modals get role and focus but no Escape.** Wiring Escape
  to a modal that deliberately refuses to close would be a behaviour change
  dressed as an accessibility fix — their "Not now" semantics are documented and
  were left alone.

`Login` also had its own Escape listener, which would have fired alongside the
hook's and called `onCancel` twice. Removed.

### 273. Method note — assert the trap, not the attribute

The tempting test is that the markup contains `role="dialog"`. It would pass on
an overlay that still leaks focus out to the page behind it — and leaking is the
half that actually strands people.

So the test presses real Tab keys through the real hook and asserts focus wraps
at both ends and never reaches a control outside. Deleting the trap fails
**exactly those two tests**; the role, focus-in, Escape and focus-restore tests
keep passing, because they are not the discriminating ones.

## Round forty-nine — a fourth guard that could not fail, and a green toast over lost work, 2026-08-27

### 274. The hover-only guard was blind to named groups and to every non-opacity reveal — FIXED

`check-hover-only-controls` required the literal string `group-hover:opacity-100`.
A **named** group — `group-hover/menu-item:opacity-100 … md:opacity-0`, which is
exactly what the sidebar uses — sailed straight through, as would
`invisible group-hover:visible`, `hidden group-hover:flex` or
`scale-0 group-hover:scale-100`.

Broadened to all four hide/reveal pairs and to named groups. It immediately
found two live sites, and the underlying defect there is worth stating on its
own: **`md:opacity-0` uses viewport width as a proxy for pointer type.** A tablet
at desktop width hides the control with no hover to bring it back. Replaced with
`[@media(hover:hover)_and_(pointer:fine)]:opacity-0`, which asks the question
that actually matters, and the guard now accepts that form as the correct
pattern.

Measured without a pipe, because `exit=$?` after `| head` reports head's status
and not the guard's: **new guard 1, old guard 0, on the same defect.**

That is the fourth cannot-fail check in this campaign, and the fourth that was
mine. All four share the shape already recorded in finding 269 — *when the check
did not understand what it saw, it returned success* — with a fifth variant to
add: **a check that recognises only one spelling of the thing it forbids.**

### 275. "Tree synced with peer" was shown for changes that had just been thrown away — FIXED

`retryPendingOps` removed an operation past `MAX_OP_RETRIES` and `continue`d.
The drop never reached the count the caller checks, so `stillPending` came back
0 and the file manager toasted a green **"Tree synced with peer"** — on the very
click that discarded a rename permanently. The trees then diverge for good: the
union merge cannot reconstruct a lost explicit operation.

The code called that drop "deliberate and loud". The only trace was `debugLog`,
which is a no-op in production, so it was neither.

It now returns `{ stillPending, discarded }`, and the two are reported with
different words on purpose: one will be retried, the other never will, and
merging them would tell the user their lost change is coming back.

### 276. Method note — a test failure that was the fake, not the code

The first run failed with `deps.io.execute is not a function` — but the debug
output showed the give-up branch had run correctly. The defect was in my stub:
the flush persists the queue through `io.execute` at the end, and I had passed
`io: {}`.

Worth separating deliberately. A test that fails because the harness is
incomplete looks identical, in the summary line, to one that fails because the
code is wrong — and reading only the summary would have sent me to change
working code.

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.
