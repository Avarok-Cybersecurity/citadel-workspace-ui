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

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.
