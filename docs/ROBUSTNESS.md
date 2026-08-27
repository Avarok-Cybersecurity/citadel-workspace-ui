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

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.
