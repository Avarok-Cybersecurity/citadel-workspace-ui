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

## Round fifty — four places the UI said nothing at all, 2026-08-27

### 277. A ringing call announced nothing — FIXED

`IncomingCallCard`'s own comment says it "announces itself through a live region
instead" of taking focus, because taking focus mid-typing is hostile. **There was
no live region anywhere in the call path.** `role="group"` is inserted silently,
so a screen-reader user with call sounds turned off was told nothing for the full
45-second ring. The *outgoing* panel got `role="status"`; the incoming one never
did.

Now an assertive `sr-only` region — assertive because a ring is time-limited and
a polite queue can outlast it — carrying the caller and how to reach the
controls, since focus is deliberately not moved.

It is populated in an effect rather than rendered with its text already in place:
**a live region that mounts WITH content is frequently not announced**, because
assistive technology watches it for changes.

### 278. The registration overlay's progress was colour-only and silent — FIXED

`LoadingModal` is the full-screen "Connecting…" surface the whole register/login
flow runs behind. It had no role, so its changing headline never announced —
between submitting a registration and landing in the workspace a screen-reader
user got nothing. Step progress was distinguishable **only by fill colour**,
which a colour-blind user cannot read.

Now `role="status"` on the content box (polite: this is progress, not an
emergency), plus a ring and `aria-current="step"` on the active dot and an
`sr-only` "(current step)" on its label.

### 279. Two more colour-only or unreachable affordances — FIXED

- **The chat tab's unread dot** was the only signal: nothing for a screen reader,
  and a small green-or-nothing cue for a colour-blind user. It now carries
  `aria-hidden` with an `sr-only` ", unread activity" beside it.
- **The orphan-session disconnect button** was a 16px target under the WCAG 2.2
  floor, sitting on top of the session button that switches workspaces — so a
  thumb-sized miss switched workspace instead of disconnecting. The visible dot
  stays 16px; the hit area is grown to 24px with a pseudo-element.

## Round fifty-one — auditing the tests, and four of mine could not fail, 2026-08-27

An audit aimed at the test suite itself rather than the product. Every claim
below was **reproduced before being acted on** — twice by deleting the
production fix and watching the suite stay green.

### 280. A test that performed the fix instead of testing it — FIXED

`outbound-queue-replay.test.ts` documents a real bug: `sendToLeader`'s ACK-timeout
path never removed the entry from the queue, so a request the user had already
been told had failed was silently re-sent at every later leader change — a
Connect, a workspace mutation, a P2P message, re-executed hours later.

The test never imported `instance-channel`. It called `outboundQueue.acknowledge`
**itself** and then asserted the queue had forgotten the entry — testing
`acknowledge`, which was never broken.

Reproduced: deleting the production fix left **all 41 tests in that directory
green**. The test now drives the real `instanceChannel.sendToLeader` under fake
timers, lets the ACK timeout expire with no ack, and then changes leader.
Deleting the fix now fails it with *"a request the user was already told had
failed was re-sent to the new leader"*.

### 281. My reconnect-budget test matched the dependency array — FIXED

`retry-budget-is-per-outage.test.ts` sliced 200 characters after
`useEventListener(` and matched `/reset/i`. That matched
`[onClose, resetAttempts]` — the **dependency array**. Deleting `resetAttempts()`
from the callback body left all three tests passing while the retry budget went
back to accumulating across the tab's whole lifetime.

Reproduced exactly: three passes with the bug reinstated. It now binds the name
from the `reset:` destructure and asserts that name is **called** inside the
callback body only — from the arrow to the brace that precedes the dependency
array.

### 282. Two smaller ones — FIXED

- **A conditional assertion that could run nothing.** `if (sent.kind ===
  'CallInvite') expect(...)` in the call-manager suite ran **zero** assertions if
  any other signal happened to go first. The kind is now asserted, as its sibling
  test three lines above already did.
- **`every-write-awaits-the-server` did not strip comments**, unlike the sibling
  guards in the same suite — so commenting a gate out and calling
  `sendProtocolRequest` beneath it would keep `toContain` satisfied.

The comment-strip control initially "passed", and that was **my control, not the
fix**: I commented out `UpdateWorkspace`, which was not in the guard's list. That
turned out to be the more useful finding — the three writes gated in round
forty-five were never added, so the guard did not cover them at all. Added; the
control then fails correctly.

### 283. Method note — what the audit found NOT to worry about

Worth recording because it bounds the suspicion: the audit swept all 156 vitest
files and named a long list as genuinely well constructed — including the
repaired versions of the earlier cannot-fail instances, the tests that count
attempts rather than asserting a rejection, the ones that render the real Sonner
surface rather than a mocked `toast`, and the fixture-coverage meta-test that
stops new routed-notification entries silently skipping extraction tests.

The suite is not uniformly suspect. The defects clustered in exactly one place:
**tests that assert on source text instead of behaviour** — which is also where
three of this campaign's four cannot-fail guards lived.

## Round fifty-two — three integration specs that could not fail, and a setting one account made for another, 2026-08-27

### 284. A security setting leaked between accounts in the same browser — FIXED

Per-peer file-transfer settings — including **auto-accept incoming files from
this peer** — were keyed by the PEER's CID alone. This browser holds several
sessions at once by design, so one account enabling auto-accept for peer X made
**every other account in the same browser** auto-accept from X: a security
decision inherited by an account that never made it.

Now scoped to the account that set it. A missing own-CID falls back to the bare
peer key rather than inventing a scope — a setting written before a session
exists belongs to no account, and silently filing it under one would be worse
than leaving it unscoped.

### 285. Three integration specs reported success for regressions they exist to catch — FIXED

All three are the "self-excluding gate" shape: a check that removes itself from
the verdict exactly when the thing it guards is broken.

- **`group-messaging-multiuser`** gated on `!results.officeChatEnabled || (…)`.
  `isChatEnabled()` returns false whenever no Chat tab is visible — *including
  when a regression removed it* — so a broken tab became a pass. Its sibling spec
  was repaired for precisely this, with a comment saying so, and the fix was
  never propagated. Navigation results were printed PASS/FAIL and gated on
  nothing at all, so a run that could not even reach an office still passed.
- **`offline-messaging`** left `postReconnectMessaging` out of the conjunction —
  directly under a comment reading *"All checks are mandatory."* That is the
  fragile part the spec exists for: ILM channel asymmetry means Alice→Bob can
  work while Bob→Alice does not, so a run could print two FAILs and exit 0.
- **`admin-modal`** filtered `undefined` results out of BOTH the numerator and
  the denominator, so a regression that stopped rendering child nodes did not
  fail the room checks — it deleted them from the verdict. Room rendering is now
  a recorded result; the seeded workspace always has rooms, so their absence is
  the failure.

### 286. Recorded, not fixed — the settings surfaces are substantially decorative

From the same audit, all PROVED, and too large to take unilaterally because the
fix for each is "wire it or delete it", which is a product decision:

- **The entire Privacy tab is a placebo.** Every toggle is written to
  localStorage and read by nothing. Typing indicators are real and outbound —
  `sendTypingIndicator` fires unconditionally — so switching them off changes
  nothing. "Who Can Message You: Nobody" blocks nobody. "Screenshot Alerts"
  promises what a browser cannot do.
- **Three of six Appearance controls are inert**: `compact-mode` and
  `reduce-motion` classes are toggled on the root element and appear in no
  stylesheet; `showAvatars`, `messageGrouping` and `sidebarWidth` have no
  readers. Nothing applies the saved settings at boot, and merely OPENING the tab
  drops the root font size to 14px because that is the default in its own state.
- **The P2P Chat Settings panel** has six `defaultChecked`/`defaultValue`
  controls with no handlers, and two fabricated statistics: "Storage Used" is a
  constant 15% of quota, and "First Connected" records when the Stats tab was
  first opened, because it writes the key on first read.
- **The workspace rename in the admin General tab can never succeed** — it sends
  no master password, which the wire type requires and the server verifies
  unconditionally. Save always fails with "Please try again", inviting a retry
  that cannot work. Fixing it means either collecting the password there or
  adding a permission-gated rename to the protocol, as themes already have.
- **A saved theme never reaches members who are already online.** Nothing
  broadcasts it — node content and group messages are broadcast; workspace
  metadata is not — while the admin is told "Every member will see this theme".
- **"Remove avatar" is unimplementable and reported as success**: the wire has no
  clear value, the server only writes `if let Some(avatar)`, and the echoed
  response puts the avatar straight back under a "Profile Updated" toast.

## Round fifty-three — three fixes that already existed elsewhere in the tree, 2026-08-27

Every finding here is the *fix applied in one place* pattern: the correct
treatment was already written, documented, and working somewhere in the
codebase, and a sibling never received it.

### 287. Unsaved theme edits were wiped by any workspace refresh — FIXED

`useAppearanceDraft` reseeded its draft on every change of `savedTheme`'s
**reference**. That value is re-derived from `state.workspace.metadata`, which is
re-minted as a new object by every `workspace:loaded` and by leader-to-follower
state sync — identical content, new identity. So mid-edit the colours snapped
back and the selection cleared, silently, most likely in a follower tab or across
a reconnect.

The admin tabs were given exactly this dirty guard in round forty-five, with the
reasoning written down. This hook never got it.

### 288. The admin Members tab spun forever on a refused list — FIXED

`listMembers` resolves on SEND, and the tab cleared `loading` only in the
`members:loaded` handler. A refusal arrives as a generic `Error`, for which there
was no branch and no deadline, so the panel spun until it was closed.

`useMemberEventSetup` has armed `armLoadingDeadline('members', …)` since it was
written, with a comment explaining this precise failure. The deadline here is
keyed per entity, so two admin modals open on different nodes cannot cancel each
other's.

### 289. A rejected save left the service holding the value — FIXED

`setEnabled` assigned `this.isEnabled` before awaiting the write. On failure the
UI reverted its switch and told the user it had not saved, while the service kept
the new value — the next `getEnabled()` reported the value the user had just been
told was rejected, and polling was left in whichever state the failed call set.
One line: assign after the await.

### 290. Method note — a test that passed for the wrong reason

The theme test's first version mocked `@/components/theme/WorkspaceThemeProvider`.
The hook imports `useWorkspaceTheme` from `@/lib/theme/workspace-theme-context`,
so the mock did nothing — `savedTheme` was a stable real object, no reseed could
occur, and **the guard test passed without exercising the guard at all**.

It only surfaced because a SECOND test in the same file — the one asserting that
reopening still starts from saved — failed with `{ id: 'avarok-purple' }`, a
value my fixture never produced. A single-assertion file would have shipped
green.

Worth generalising: **a fixture value appearing where your own value should be is
the signal that a mock is not applied**, and it is the reason to write the
"still does the normal thing" test even when the defect is about the exception.

### 291. Not tested, and why — the auto-connect toggle

The one-line ordering fix above is verified by inspection only. Three successive
attempts to render the service under test pulled in `instanceManager`,
`EventListenerPollingService` and `BroadcastChannelService`, each failing on a
different singleton, and the value of a test for `assign-after-await` did not
justify mocking a quarter of the app. Recorded rather than quietly skipped.

## Round fifty-four — folder navigation, nested controls, and a lock two writers never took, 2026-08-27

### 292. Opening a folder was double-click only — FIXED

Keyboard activation on a grid item ran `handleClick`, which **selects**. So a
keyboard user could select a folder and never enter it, and `onNavigate` was
reachable only through `onDoubleClick` — which iOS synthesizes unreliably, so on
touch the grid was effectively navigation-dead. The tree sidebar rescued users
from a total block, but it lists directories alone.

Enter now opens and Space selects, the convention every file manager uses, and a
single tap opens a folder where `(hover: none)`. Guarded on the pointer rather
than viewport width — a tablet at desktop width still has no mouse.

### 293. The chat tab was a button inside a button — FIXED

The close control was a real `<button>` nested inside the tab's
`role="button"` div: the nested-interactive pattern this project's own
`lib/a11y.ts` forbids in writing. Assistive technology reports one control where
there are two, and the inner one is not reliably reachable. Its target was also
~16px.

Restructured as siblings, the close button named for **its own tab** — "Close
tab" repeated down a row says nothing about which one — and grown to a 24px
target.

### 294. Two of three role writers never took the lock their own test names — FIXED

`last_admin_race_test.rs` states the contract in its header: `lock_workspaces`
held across the check AND the write, *"in all three role writers"*. It was true
in **one**. `update_workspace_member_role` took no lock at all.

Two admins demoting each other both count two admins, both pass
`ensure_not_last_admin`, and both write — leaving **zero admins**, which this
file's own documentation calls unrecoverable, because promotion requires an
admin.

The existing race test is deliberately sequential; its docstring argues that a
probabilistic race test which usually passes is worse than none, and says so.
Accepting that argument leaves the lock itself as the thing to assert, so the new
test extracts each writer's body — bounded at the next `async fn`, so a
neighbour's lock cannot satisfy it — and requires the call. Comments are stripped
first, for reasons this register has already recorded twice.

### 295. Workspace-wide clippy was already failing — FIXED

CI runs `cargo clippy --workspace --all-targets -- -D warnings`, and three test
files tripped `empty line after doc comment`. Pre-existing, in files this round
did not otherwise touch, and invisible to the per-crate clippy job that does not
pass `--all-targets`.

The cause is the same in all three: a `///` block written as file narrative,
placed after the imports, where Rust binds it to the next item. `//!` is not
available there, so they are now plain `//` comments — which is what they always
were in intent.

**This is the third CI gate found red by running it locally** (after the 250-line
cap and the stack-reachability guard). The pattern is not carelessness about any
one gate; it is that the local loop runs `tsc`, `eslint`, `vitest` and the
pointer guard, and nothing else, while CI runs eleven things.

## Round fifty-five — two multi-tab defects that ran work four times, 2026-08-27

### 296. A self-addressed ack vanished, so the request ran up to four times — FIXED

A tab can be the leader answering **its own** queued request: when a leader dies,
a follower holding a pending entry wins the election, and the replay executes
locally rather than being posted.

The ack for that execution went out over BroadcastChannel — which never delivers
a message to the posting context, and which classifies same-nonce traffic
`ignore-own` in any case. So it vanished. The queue entry survived, the retry
timer re-fired it every 5s, and **each retry re-executed the request** — a
Connect, a workspace mutation or a P2P message run up to four times — after
which the caller's own 30s timer reported it as **failed**.

Now delivered locally when the target is this tab.

### 297. A tab that BOOTED as leader was never wired for demotion — FIXED

The promotion/demotion listener was registered only inside
`initializeAsFollower`. `closeLeaderClient` has no other caller, so a boot-leader
that was later demoted kept a live socket whose handler discarded every inbound
frame. The browser then held two sockets: the sessions on the old one went
permanently deaf, while the tab proxied new requests to a leader that had never
seen them. Reachable through split-brain resolution, a duplicate-tab identity
reissue, or a background-throttled leader losing a heartbeat contest.

Now registered before the leader/follower branch, idempotently.

### 298. The line cap was red again, and two of the four were from earlier rounds

Four files over 250: two from this round, and two — `useFileManagerHandlers` and
`MembersTab` — pushed over in rounds fifty-two and fifty-three, committed
without re-running the check.

**This is the same gate, failed the same way, three rounds after recording that
it fails this way.** The note in round forty-six said the local loop runs four
checks while CI runs eleven; recording that did not change the loop. Fixed by two
real extractions (`send-to-leader`, `leadership-listener`) and, for the two
components, by removing lines rather than rewriting them at the same length —
which the first two attempts did, to no effect.

### 299. Method note — a full-suite failure my targeted run could not show

`registerLeadershipListener` became part of the `initOps` contract, and an
existing test's fake core did not implement it. The targeted runs I used while
iterating all passed; only the full suite surfaced it, as
`service.initOps.registerLeadershipListener is not a function`.

The fake was incomplete, not wrong — but the signal is real: **adding a required
method to an interface breaks every hand-written double of it**, and only a full
run finds them.

## Round fifty-six — fixing the loop instead of the files, 2026-08-27

### 300. The 250-line cap existed only as inline YAML — EXTRACTED

The rule and its skip list lived nowhere but inside `validate.yml`, so running
it locally meant hand-copying a bash loop. That is exactly what I had been
doing, and forgetting: **the cap was pushed over and committed three times, twice
after the failure had already been written down in this register.**

Round forty-six recorded "the local loop runs four checks while CI runs eleven".
Recording it changed nothing, because the gap was not knowledge — it was that
four of those eleven had no runnable form.

Now `scripts/check-file-length.mjs`, called by the workflow. Its failure message
also says the thing I had to learn twice: *rewriting a comment at the same length
does not reduce the count.*

### 301. `npm run preflight` — every gate that does not need Docker, in one command

Twelve checks: the file cap, six guard scripts, the event-pair guard, typecheck,
lint and the unit suite. Deliberately excludes anything needing Docker or a live
stack, and the integration suites, which share one backend.

Negative-controlled, because a preflight that cannot fail would be the worst
possible irony here: pushing one file over the cap and deleting one `aria-label`
produced exactly two FAILED lines and ten `ok`s.

### 302. An `assert…` helper returned true in the case it exists to reject — FIXED

`assertSessionNotInOrphanNavbar` retries three times and then, with the session
**still there**, logged "treating as soft pass" and returned `true`. Its only
`false` path was an exception.

Four reconnection suites record that return value as their verdict, so the
"Session Already Connected" lifecycle family — which this project has fought
repeatedly — was laundered into green.

The justification given was a Disconnect/TCP-close race. The retries already
answer that: three attempts with a 2s probe each is seconds of grace, and still
present after all of them is not a race, it is a session that was never cleaned
up.

**This may turn those suites red, and that is the point.** A test that should
fail, failing, is the fix working.

### 303. Two more helpers that reported success without checking — FIXED

- **`createLiveDoc` returned `true` unconditionally.** Create button never found,
  modal never opened, name never entered — every branch fell through to success.
  It would pass against an app with Live Docs removed entirely. It now verifies
  the document appears.
- **`connectP2P` returned `true` when the peer never appeared as connected** —
  its entire verification — with the comment "Connection request sent
  successfully". Request send is not response, and this helper is the documented
  **retry fallback** for PeerConnect timeouts, so it reported the retry as having
  worked in precisely the case where it had not.

## Round fifty-seven — reading fields the wire does not have, 2026-08-27

An audit aimed only at hand-written types that shadow generated ones — the class
that killed the file-transfer progress path. It found six more.

### 304. Every discovered peer showed offline and unnamed — FIXED

The peer list declared `PeerEntry { full_name, is_online }`. The generated
`PeerInformation` declares **`name`** and **`online_status`**. Both reads were
`undefined` on every peer, so the online badge was always off and the full name
always blank — and because the fields were optional, tsc said nothing.

Worse underneath it: `peer_information` is a Rust `HashMap`, which
`serde_wasm_bindgen` delivers as a JS **Map**. `Object.values()` on a Map returns
`[]`, so the primary discovery path found **no peers at all** and fell through to
the GetSessions fallback, which only sees peers on the same internal service. The
same shape made the already-registered set empty, so peers who were already
registered were offered for registration again.

A normalizer for the Map hazard was written once, in the P2P registration
service, and never propagated. It now lives in `lib/wire-map.ts` and is used by
both call sites here.

### 305. The admin shield never rendered in the sidebar — FIXED

`getRoleIcon` compared against `"owner"`/`"admin"` in lowercase. The wire sends
PascalCase, so no member loaded from the server ever matched. The neighbouring
code already knew — `TopBar` and `AdminSettingsSection` check both cases, and
`role-badge.ts` lowercases first — making this the one place the fix was not
applied.

### 306. Recorded, not fixed — four more shadow types

- **Incoming file offers show NaN for size.** The local notification type
  declares `metadata.file_size` and `mime_type`; the generated
  `VirtualObjectMetadata` has neither — the size field is `plaintext_length`. So
  `Number(undefined)` is displayed in the accept UI. Folds into the recorded
  rewrite of that same file.
- **`ActiveSession.full_name` is phantom**, so session avatars and the disconnect
  modal always fall back to the username.
- **`UserRoleTS` and `UpdateOperationTS` encode lowercase values the server
  rejects** — Rust has no `rename_all`, so `"admin"`/`"add"` fail serde and the
  whole payload is refused. It works today only because every live caller
  bypasses the enum with a PascalCase literal plus a cast: tsc is validating
  fiction in both directions, and the enum's own members are the one thing
  guaranteed to fail.
- **Two more `Object.keys` over wire HashMaps** — cached-peer sync after
  reconnect, and the LocalDB key listing that feeds paginated message history.

The report also names the mechanism that lets all of these past CI: three
`as unknown as` adapters between the hand-written request types and the generated
ones. Replacing the hand types with the generated imports removes the need for
all three, and is the real fix.

## Round fifty-eight — the rest of the HashMap class, and a privacy leak recorded, 2026-08-27

### 307. Message history and cached peers both read empty from populated maps — FIXED

The remaining two `Object.keys` over Rust `HashMap`s, which
`serde_wasm_bindgen` delivers as JS **Maps**:

- **`LocalDBGetAllKV` key listing.** `message-pagination-store` finds its
  persisted page index through here, so it returned no keys and **a reload found
  no stored history at all** — silently starting from empty.
- **`peer_connections` in cached-peer sync.** Sync after a reconnect therefore
  synced nothing.

Both now use `lib/wire-map.ts`, alongside the peer-discovery sites fixed last
round. The test asserts all three files and, separately, that each routes through
the shared normalizer — because "does not use Object.keys" alone would pass on a
file that had simply stopped reading the map.

### 308. Recorded, not fixed — the P2P delivery audit, and one of them is a privacy leak

- **Two accounts in one browser share a peer's message store.** Pages are keyed
  by PEER only, in LocalDB bucket `0n`, which every account on the device shares
  — the type's own comment concedes it. So with A and B both chatting to X, their
  private messages interleave in both tabs after a reload. The `ownerCid` stamp
  guards deletion only, so B's "Clear Chat History" hits a `debugLog` refusal
  — *"it belongs to another account"* — while the screen empties and the history
  returns on reload, after telling the user "This cannot be undone."
- **A failed message can never be retried after a reload.** The `failed` status
  is persisted deliberately, *"because it is what makes the message retryable"* —
  but `resendMessage` looks only in the in-memory window, which `loadFromStorage`
  restores as `[]`. Every retry click yields "Message … not found in
  conversation", forever.
- **Delivered/read acks for anything outside the 100-message window are
  discarded**, so the ordinary offline-peer flow — send, reload, peer acks hours
  later — leaves the message on one check permanently even though it was read.
  And opening a conversation after a reload **clears the unread badge without
  sending the read receipts**, so both directions of the status protocol die at
  the first reload.
- **A LocalDB hiccup during send strands a 'pending' bubble** that is neither
  retryable nor removable: the append is outside the try/catch, so its rejection
  unwinds `sendMessage` before the wire send and before any status transition.
- **Ack propagation fabricates 'delivered'** for messages the peer deliberately
  refused to confirm — the receiver withholds that ack when it could not store
  the message, with a comment calling the alternative "a lie that outlives the
  message itself", and propagation then tells exactly that lie.

These are one connected design problem — the in-memory window is treated as the
source of truth by four separate paths that outlive it — and the fix is a single
decision about where message state lives. Recorded rather than patched piecemeal.

## Round fifty-nine — two accounts in one browser no longer share a transcript, 2026-08-28

### 309. Message pages were keyed by peer alone, in a bucket every account shares — FIXED

Pages lived at `msgs_with_peer_{peerCid}` in LocalDB bucket `0n`, which every
account on the device shares — on a product that explicitly expects several
accounts in one browser and documents that workflow. Two accounts chatting with
the same peer therefore **appended into the same pages**, and after a reload each
one's private messages rendered in the other's transcript.

An `ownerCid` stamp had been added, but it guarded **deletion only**. So the
second account's "Clear Chat History" hit a refusal written to `debugLog` — the
screen emptied, the user was told *"This cannot be undone"*, and the history came
back on the next reload.

The fix removes the sharing rather than policing it: the owner is now part of the
key. Three details were not optional:

- **Legacy records are still readable.** Pre-scoping history would otherwise be
  orphaned by the rename. `loadMetadata` and `loadMessagePage` fall back to the
  peer-only prefix.
- **Only ours.** A legacy record stamped for a different account is refused
  rather than adopted — adopting it would be the same guess the shared key made.
  An unattributed one predates the stamp and is accepted, which is the same
  exposure as before rather than a new one.
- **Clearing deletes the legacy records too**, or the read fallback resurrects
  the conversation the user was just told could not be undone.

With no session yet, the key falls back to the legacy shape rather than inventing
an owner: a record filed under a guessed account is worse than an unscoped one.

### 310. Method note — the extraction that had to happen mid-fix

Adding the fallbacks pushed `message-page-operations` to 270 lines, so the
delete path moved to its own module. Splitting a file while changing its
behaviour is how a fragment gets orphaned — and one did: the `DeleteScope`
interface header was left behind, wedged into the middle of an unrelated
docstring, which `tsc` caught immediately.

Worth stating because the temptation is to do the extraction "while I'm here".
The safer order is fix, verify, then extract — and if the cap forces the
extraction first, verify between the two.

## Round sixty — message status stops dying at the first reload, 2026-08-28

Two of the four paths that treated the in-memory window as the source of truth.
It never survives a reload: `loadFromStorage` restores every conversation with
`messages: []`, and nothing rehydrates it.

### 311. A delivered/read ack for anything outside the window was discarded — FIXED

`handleMessageAck` scanned only the in-memory conversations — capped at 100 and
empty after a reload — and its miss path was a `debugLog`.

That miss is not an anomaly, it is the **ordinary offline-peer flow**: send to an
offline peer, close the tab, the peer comes online hours later and acks. The ack
arrived, was dropped, and the message stayed on a single check for ever even
though it had been delivered and read. Users conclude delivery failed and re-send.

The peer CID was already available at the call site and simply never passed. It
now falls through to the page store, and notifies listeners only when the store
actually patched something — `updateMessageInPages` returns false when the
message is in neither place, and claiming an update there would be the same lie
one layer down.

### 312. A failed message could never be retried after a reload — FIXED

The `failed` status is persisted deliberately, with a comment saying it is
*"exactly the one worth keeping: it is what makes the message retryable after a
reload"*. But `resendMessage` looked only in memory, so after a reload the red
retry bubble — rendered from the page store — sat above a lookup that searched an
empty array and threw. Every click produced "Message … not found in
conversation", for ever. The only escape was retyping.

`resendMessage` now reads the message back from storage and returns it to the
window, so the status mutations that follow, and any later ack, find it where the
rest of the code expects.

### 313. Method note — the mundane half of each test is what proves it discriminates

Each fix got two tests: the new behaviour, and the behaviour that must NOT
change — an ack for a message in neither memory nor storage must still notify
nobody, and a genuinely unknown message id must still throw.

Removing both fixes fails exactly the two new tests and leaves the two mundane
ones green. A control where everything fails would not have told me whether the
fallback was correct or merely present.

## Round sixty-one — the third path, and the badge that lied both ways, 2026-08-28

### 314. Opening a conversation after a reload cleared the badge without sending receipts — FIXED

`markMessagesAsRead` filtered `conversation.messages` — empty after a reload,
while the transcript on screen had been rendered from the page store. So **zero
read receipts** were sent for messages the user had visibly just read, and the
sender's bubbles stayed on 'delivered' for ever.

The second half was worse than the first: the new unread count was computed from
that same empty array, came out **0**, and was persisted. The badge cleared as if
everything had been handled, so nothing on either side recorded that the receipts
were owed.

It now falls back to a stored scan when memory has nothing, and derives the
remaining count from what was actually marked rather than from the empty array.

The scan is bounded by the metadata's own `unreadCount` and reads newest-first,
so it stops almost immediately in the normal case rather than reading every page
of a long conversation on every open.

### 315. That closes three of the four in-memory-window defects

Rounds sixty and sixty-one fixed the ack path, the retry path and the read-receipt
path. The fourth — a LocalDB hiccup during send stranding a 'pending' bubble that
is neither retryable nor removable, because the append sits outside the try/catch
— is still open and is a different shape: it needs the outbound path to separate
durability from delivery, which the INBOUND path was already hardened to do.

Worth recording as a pattern rather than three coincidences: **a cache that the
code treats as the source of truth will be believed by every path that touches
it**, and the ones that break are exactly those that run after the cache is
empty. The window here was capped at 100 and restored as `[]`; four separate
features assumed otherwise, and each failed only on reload, which is why none of
them showed up in ordinary use.

## Round sixty-two — the guard told me the debt was paid, 2026-08-28

### 316. The group unread badge never incremented for any message, ever — FIXED

`group:message-received` carried the sidebar's unread count, last-message preview
and recency sort. **Nothing emitted it** — the inbound path emitted
`group:message:new`. Two half-built pipes that never met: the badge never
incremented for any message in the product's life, and the recency sort never
reordered because `lastMessageTime` was never set. Invited members additionally
carried a permanent phantom "1" that opening the group could not clear.

Now emitted beside its sibling, in the shape the store destructures.

### 317. The stale-marker check earned itself

`group:message-received` was one of the three entries in the event guard's
`RECORDED_DEAD` map — debt markers carried so a known-dead listener does not fail
CI while the feature behind it is unbuilt.

Round thirty-six built that map to be checked **in both directions**, on the
argument that *paying the debt is what should remove the marker, rather than the
marker silently outliving the bug*. That was speculative when written. This round
it fired for real:

```
STALE MARKER: 'group:message-received' is in RECORDED_DEAD but now HAS an emitter.
  The debt was paid — remove the entry so a future regression fails.
```

The fix was refused by CI until the marker was removed — which is the whole
point, because with the entry left in place the listener would have been
permanently exempt from the guard that now protects it. Two markers remain.

### 318. Method note — the test asserts the payload, not just the event

Emitting the right event name with the wrong payload is the same defect one layer
along: the store destructures `{ groupId, senderId, content }`, and an emit that
delivers `{ group_id, message }` would satisfy a name-only assertion while the
badge stayed at zero.

The control confirms both halves — deleting the emit fails the test AND makes the
guard report a dead listener again.

## Round sixty-three — every group survived exactly until you reloaded, 2026-08-28

### 319. A page reload permanently lost every group — FIXED

The group store was memory-only, and nothing rebuilt it. `refresh()` has no
caller anywhere, and `GroupListGroupsSuccess` is handled nowhere — the request is
sent and the reply is dropped. So every reload emptied the sidebar, and opening a
bookmarked `/groups/:id` reported **"This group may have been deleted"** and
bounced to the workspace, for a group that still existed with its history still
on the server, now unreachable because there was no route back in.

The store's own header explains why the previous attempt failed and, in doing so,
prescribes the fix: localStorage persistence *"never once worked: member CIDs are
bigint, `JSON.stringify` throws on bigint, and the save was wrapped in a
try/catch that logged and moved on — so every instance always started from
nothing"*. It was removed rather than patched with a replacer, on the rule that
browser persistence belongs to IndexedDB.

So: IndexedDB, where structured clone stores bigint natively. Three properties
the tests pin independently, because each fails differently:

- **A member CID round-trips as bigint.** The control reintroduces the original
  defect — a `JSON.parse(JSON.stringify(...))` round trip — and that test alone
  fails.
- **Groups are keyed per account.** Two accounts in one browser must not inherit
  each other's group list, exactly as conversations were scoped in round
  fifty-nine. Dropping the key fails only that test.
- **A read failure reports no groups rather than throwing**, so a storage hiccup
  cannot stop the app starting; the live event stream still repopulates.

**Bindings are armed before the restore, and the restore MERGES under whatever
arrived live.** An invite landing while the read is in flight would otherwise be
overwritten by a snapshot taken before it existed — the read is async, and
assigning the result over current state is how a race becomes data loss.

Persisting is fire-and-forget on every mutation: a storage failure must not block
a state change the user can already see on screen.

### 320. What this does NOT fix, stated plainly

Restoring the store is not the same as re-syncing with the server. A group
created on another device, or one the user was invited to while this browser was
closed, still will not appear until an invite arrives live. Closing that needs
`GroupListGroupsSuccess` handled — and the internal service's handler returns
**owned groups only** (`list_owned_groups`), so member-of groups need a wire-level
roster the protocol does not currently carry.

Recorded rather than glossed: this fix removes the catastrophic case (your own
groups vanishing on refresh) and leaves the incomplete one.

## Round sixty-four — guarding the docs' biggest rot class, 2026-08-28

A docs audit returned 26 findings, all four existing doc guards passing. The
single largest class — a doc pointing at a source file that no longer exists —
was in every guard's blind spot: `check-doc-commands` validates COMMANDS, not
paths, and **never opens CLAUDE.md at all**, which is the file a contributor
reads as instructions.

### 321. `check-doc-file-refs.mjs` — GUARDED, and it found fifteen

Every `.ts`/`.rs`/`.toml` path in the operational docs must resolve. Getting it
useful took three calibration passes, and each one is the finding:

- **Full-path matching produced false positives.** CLAUDE.md writes
  `messenger/mod.rs` — a real file six directories down. Requiring full paths
  would have flagged correct prose, which is exactly how a guard earns its way
  onto an ignore list. It now resolves by **suffix** against an index of every
  tracked file.
- **Roadmap and historical docs describe what WILL exist, or once did.**
  `docs/plugins/`, `PLUGINS-ROADMAP`, `TODO_FUTURE` and `docs/review/` are
  excluded by name rather than by loosening the rule for everyone.
- **A path in a past-tense sentence is history, not a claim.** "was previously
  in X" must not fire; the control confirms it does not.

The fifteen real ones were almost all the same event seen from different docs:
five modules split into directories during this campaign —
`websocket-service`, `workspace-service`, `p2p-registration-service`,
`connection-manager`, `p2p-messenger-manager` — with every doc still naming the
old single file. The guard names that case specifically ("that module was split
— the path is now a directory") because the fix differs from a plain rename.

Two referenced components that were genuinely deleted, `MessagesSection.tsx` and
`PeerTest.tsx`, are now pointed at what actually renders.

### 322. One audit finding refuted: WARP.md is a symlink

The audit reported WARP.md as a byte-identical copy of CLAUDE.md, "doubling all
of this", and recommended de-duplication. `ls -la` shows
`WARP.md -> CLAUDE.md` — a symlink. `diff` reporting zero lines is what a
symlink looks like from `diff`. There is nothing to de-duplicate, and the guard
needs no separate entry for it.

Worth recording because the reasoning was sound and the conclusion was still
wrong: **`diff` cannot distinguish a copy from a link, and the check that
distinguishes them is one `ls` away.**

## Round sixty-five — the instructions file described a system that no longer exists, 2026-08-28

`CLAUDE.md` is what a contributor — human or agent — reads before touching the
code. Three of its claims were not merely stale but **inverted**, and each was
verified against the tree before rewriting.

### 323. "TCP drop cleans up sessions unless in orphan mode" — the opposite is true

`kernel/ext.rs` says it in as many words: *"ALWAYS preserve sessions when TCP
drops"*, and *"The orphan_sessions map is no longer used for cleanup
decisions."* A page refresh, a navigation or a closed tab leaves the session
intact by design. The document described orphan mode as the exception; it is now
the only behaviour.

Two further claims in the same section describe code that **does not exist**:

- *"Connection struct implements Drop for automatic cleanup"* at a cited
  line range — `impl Drop for Connection` has **zero matches repo-wide**.
- *"Kept exponential backoff retry as fallback (100ms, 200ms, 400ms)"* — there is
  no such retry in the connect path.

And the pre-connect behaviour is now the reverse of what was written: `connect.rs`
does **not** delete the existing session. It asks the SDK whether that session is
live and, if so, returns `SessionAlreadyActive` and leaves it alone — which is
what prevents the ratchet reset a ClaimSession racing a second Connect used to
cause. The documented 50ms delay is 200ms, and applies only to the stale branch.

Rewritten from the source, with an explicit note that the Drop impl and the
backoff do not exist — because someone who read the old text will go looking for
them.

### 324. "The UI runs locally, and not in the docker container" — inverted

The Tiltfile says *"UI service now runs in Docker container with HMR support"*,
and docker-compose defines a full `ui` service. This one directly misdirects
debugging: it sends you to the wrong logs.

### 325. A copied set that listed three of its eight members

The `CID_ROUTED_NOTIFICATIONS` excerpt named the wrong file and three entries;
the real set has eight, including all three file-transfer notifications and both
media ones. Routing any of those by `request_id` delivers them to whichever tab
issued the original request — so with two sessions in one browser, one session
receives the other's files or call media.

Replaced with a pointer to the file and a description of the *rule*, plus the
note that a fixture-coverage test enforces membership. **An excerpt of a list is
a copy that will go stale**, and this one had; the rule is what belongs in prose.

## Round sixty-six — a refused group message no longer eats the text, 2026-08-28

### 326. A server refusal discarded the user's message silently — FIXED

`sendGroupMessage` resolved when the frame left, and the composer clears on
resolve. So when the server refused — a store failure, or the rate limiter's
*"Rate limit exceeded. Please slow down."* — the text was gone: it never appeared
in the transcript, and the refusal arrives as a generic `Error` that no handler
surfaces.

Now gated. Two things made this one harder than the writes gated before it:

- **The success variant is also the broadcast.** The server answers the SENDER
  with `GroupMessageNotification` and sends the identical variant to every other
  member, so type-only matching would let someone else's message resolve this
  write — reporting success for a send the server may still refuse. The gate
  now takes an optional payload matcher, used here to recognise our own answer.
- **The handler returned `true` without emitting the raw response**, so gating
  first would have reproduced the round-twenty-six regression exactly. The emit
  went in first, and the guard from round forty-five confirmed it.

### 327. My own guards caught two things, and my own tests caught nothing

The round-forty-five guard did its job immediately: adding the table entry failed
with *"add a sample payload for the 'GroupMessageNotification' variant"*, which
is the guard refusing to be satisfied by an untested entry.

The tests I wrote for this fix were another matter. **Both controls passed**:

- The "another member's message must not resolve this" test used a single
  `await Promise.resolve()` before asserting, which is not enough for the
  promise's own continuation to run — so `settled` had not been called yet
  either way. It passed with the matcher deleted.
- The source guard did not cover `SendGroupMessage` at all; its list still had
  not been extended, the same gap found in round fifty-one.

And once added, that guard failed for a third reason: it matched the literal
`awaitWriteResponse('SendGroupMessage'`, while a call needing an extra argument
is written across lines. **A guard that fails on formatting teaches people to
reformat rather than to gate**, so it is now whitespace-tolerant.

Three defects in the verification of one fix, none of them in the fix. Recorded
because the pattern is consistent: **the code under test gets scrutiny, and the
scaffolding around it does not** — which is precisely why every control here has
to be run rather than assumed.

## Round sixty-seven — deleting a group deleted it for one person, 2026-08-28

### 328. Every other member kept the group forever — FIXED

`GroupEndNotification` is the **owner's own confirmation**. Every other member is
told through `GroupDisconnectNotification`, which was handled nowhere and had no
case in the event mapper. So deleting a group removed it only for the person who
pressed the button: everyone else kept it in the sidebar and kept typing into it
— and because the server's group messaging has no membership check, those
messages still went somewhere.

The same notification is how a **kicked** member learns they were removed, so
that was equally silent from their side.

### 329. A failed delete also cleared the owner's sidebar — FIXED

The mapper ignored `GroupEndNotification.success` entirely, so `success: false`
produced the same `group:deleted` as a real one. The group survived on the server
while the only person who could delete it stopped seeing it.

Two independent properties, so two controls: removing the disconnect mapping
fails only the members' test, and dropping the `success` check fails only the
failed-end test.

## Round sixty-eight — two error reports that reached nobody, 2026-08-28

An audit of error surfacing across the whole UI. Its baseline matters: `debugLog`
is a **no-op in production**, so a catch whose only action is `debugLog` is not
logging, it is silence.

### 330. "This is the LAST chance" announced the loss to nobody — FIXED

The unmount flush of a collaborative document carries this comment:

> This is the LAST chance — the debounced write above can retry on the next
> edit, and there are no more edits. A swallowed failure here is exactly the
> case where the user's work is gone, so it is announced rather than discarded.

It announced on `live-document:persist-failed`, an event with **zero listeners**.
The user closes the document believing it saved; the edits are gone.

### 331. "Connected successfully" over a messaging layer that never started — FIXED

`session:startup-error` likewise had no listener. That catch wraps the entire
post-login startup — P2P registration and auto-connect — so if either threw, the
user had just been shown *"Connected to workspace successfully"* while peers
showed offline and messages never arrived, with no error anywhere.

Both are now toasted directly rather than emitted. **Removing the wire beats
adding a second end to it**: an emit with one listener somewhere else is the
arrangement that broke here twice.

### 332. Method note — this is the direction the guard still cannot see

Round thirty-six's guard catches a listener with no emitter. These are the
mirror: an emitter with no listener. Round forty-one recorded that the reverse
direction resisted mechanisation because a third subscription facade
(`workspaceEvents.onWorkspaceEvent`) makes a naive scan report 75 false
positives.

That limitation has now cost two real defects, both of which lose user work.
A third — `service-health`, computed every 10 seconds and emitted to nobody, so
the app knows the local agent is down and tells no one — is recorded, not fixed.
The honest next step is to enumerate the facades and finish the guard, rather
than keep finding these by audit.

### 333. Two audits contradicted each other; the source settled it

One backend audit reported `generate_remote`'s `.expect("Should not fail to find
target")` as a client-reachable panic. An earlier one had explicitly **refuted**
it, reasoning that the `UserIdentifier::ID` path returns `Ok` unconditionally.

Read directly rather than believing either:

```rust
async fn get_session_cid(...) -> Result<u64, NetworkError> {
    Ok(account_manager.find_local_user_information(local_user).await?
        .ok_or(citadel_io::error!(ErrorCode::RemoteUserDoesNotExist))?)
}
```

`.ok_or(...)?` on an `Option` — an unknown CID yields `Err`, `propose_target`
propagates it, and the `.expect` panics inside a spawned per-request task. **No
response is ever sent**, so the browser waits out its own timeout with nothing.
All five LocalDB handlers route through it, and `LocalDBGetKV` is exempt from the
ownership gate, so a stale CID from a browser that outlived an
internal-service restart reaches it directly.

The second audit is right. Recorded as verified-and-unfixed: the repair is to
return the matching `LocalDB*Failure` from each of the five handlers, which is a
Rust change worth doing deliberately rather than at the end of a round.

## Round sixty-nine — the guard was blind to five of six subscription facades, 2026-08-28

### 334. Completing the facade list found eight more dead listeners — RECORDED

Round forty-one recorded that the reverse direction of the event guard "resisted
mechanisation" because a naive scan reported 75 false positives, and blamed a
third subscription facade. That diagnosis was **incomplete in a way that
mattered**: there are six.

- `eventEmitter.on/once`
- `useEventListener` / `useEventListeners`
- `workspaceEvents.on*Event` — a family of **six** methods, not one
  (`onWorkspaceEvent`, `onMemberEvent`, `onNodeEvent`, `onMessageEvent`,
  `onOperationEvent`, `onProtocolEvent`)
- `this.listen` / `this.listenOnce` — the EventListenerManager base class

And a subscription written with a generic type parameter —
`useEventListener<Payload>('x')` — defeated the pattern outright.

The consequence was not only the missing reverse check. **Teaching the guard
those forms immediately surfaced eight dead listeners in the direction it was
already checking**, hidden the whole time because they subscribe through a
facade: `message:received`, `typing:started`, `typing:stopped`,
`protocol:warning`, `notification`, `member:permissions-updated`, `user:login`,
`user:logout`.

Measured, not asserted: the new guard exits 1 on a facade-subscribed dead
listener; the previous version exits 0 on the identical defect.

### 335. And one of those eight is a refutation, not a defect

`typing:started` / `typing:stopped` look damning — typing indicators are sent
unconditionally, so a dead receive path would mean they are transmitted and never
shown.

They are shown. The working path is `messenger.onTyping(...)` in
`useP2PMessages-subscriptions`, a callback registry rather than the event bus.
These two listeners are a redundant second path, not a broken feature.

Recorded that way in `RECORDED_DEAD`, because a debt marker that misstates the
debt is worse than none: someone reading "typing is broken" would go and rebuild
a feature that works.

### 336. Method note — a wrong diagnosis is stickier than a wrong fix

Round forty-one's conclusion ("this cannot be mechanised") was accepted for
twenty-eight rounds, and in that time the un-mechanised direction cost two
defects that lose user work. The conclusion was reached from real evidence — 75
false positives — but the evidence was produced by an incomplete scanner, and
nobody re-derived it.

The cheap check that would have caught it is one command: enumerate the
subscription call shapes actually present in the tree, rather than assuming the
list. That took a single `grep` this round.

## Round seventy — the app knew the agent was down and told nobody, 2026-08-28

### 337. `service-health` polled every 10 seconds to zero listeners — FIXED

`healthCheckService` has computed whether the local agent is reachable every ten
seconds since it was written, and emitted `service-health` to **nobody**. The
user met the outage as scattered, uncorrelated per-operation failures, or as
silence.

The offline banner did not cover it, and could not: `useOnlineStatus` reports the
DEVICE's connectivity, while the agent runs on localhost and can be dead while
the browser is perfectly online. That produces precisely the symptom the banner's
own docstring exists to explain —

> A PWA launched from the home screen has no browser chrome, so there is nothing
> to reveal that the network dropped — the app simply stops working, and a
> failure to reach the workspace looks identical to the app being broken.

— for a cause the banner never mentioned.

The banner now has a third state, wired to the existing poll. Three decisions
worth keeping:

- **It names the agent, not "the server".** This is a local process the user can
  actually restart; "connection lost" would send them to check their wifi.
- **It starts optimistic.** The first poll can be a full interval away, and
  opening with a warning that resolves itself trains people to ignore the banner.
- **It reuses the muted styling, not red.** An unreachable agent is a condition
  to report, not an error the user caused.

### 338. This was the third dead emit wire in three rounds

`live-document:persist-failed`, `session:startup-error`, and now
`service-health` — all emitted, none heard, each found by audit rather than by a
guard. Round sixty-nine established that the reverse direction IS mechanisable
once all six subscription facades are known; this round is the last of the three
known instances, and the argument for finishing that check is now made of three
real defects rather than a hypothesis.

Twenty-two emitters with no listener remain. Most are harmless — an event
published for a consumer that does not exist yet is not a defect — which is
exactly why the reverse check needs the debt-marker treatment rather than a
blanket failure.

## Round seventy-one — the event guard now checks both directions, 2026-08-28

### 339. An emitter nobody hears is now a build failure — GUARDED

Round forty-one declared this direction unmechanisable. Round sixty-nine showed
that was a wrong diagnosis from an incomplete scanner. This round closes it.

The guard now fails on an **UNHEARD EMIT** — an event published with no
subscriber — alongside the dead-listener check it has had since round thirty-six.
The twenty-four existing ones are carried in `RECORDED_UNCONSUMED`, each with the
reason it has no consumer, because most are genuinely harmless: an event
published for a consumer that does not exist yet is not a defect, and a guard
that treats it as one gets disabled.

Three of them are labelled **REAL GAP** so they stay visible rather than
quietly tolerated:

- `revfs:persist-failed` — a failed tree persist announced to nobody, the exact
  shape of the live-document bug fixed in round sixty-eight.
- `outbound-failed` / `outbound-error` — the queue knows a proxied request is
  dead roughly ten seconds before `sendToLeader`'s own timer gives up, and says
  so to nobody.

### 340. Four failure branches, four controls

A guard with four ways to fail needs four negative controls, and running them
found that one of mine was wrong rather than the guard:

| branch | control | result |
|---|---|---|
| new unheard emit | add `emit('nobody:hears-this')` | exit 1 ✓ |
| stale unheard marker | list an event that HAS a listener | exit 1 ✓ |
| dead listener | subscribe to a name nothing emits | exit 1 ✓ |
| stale dead marker | list an event that HAS an emitter | exit 1 ✓ |

The dead-listener control first came back green. The cause was my control: I
aliased the import (`e2.on(...)`), and the guard deliberately does not match a
bare `.on` because Yjs documents and the editor use it too. **The control was
wrong, not the guard** — and only re-running it with the real facade name
distinguished the two.

That distinction is the whole reason to run controls rather than reason about
them: a green control is evidence of nothing until you know it *can* go red.

## Round seventy-two — a stale CID no longer hangs the request for ever, 2026-08-28

### 341. Five LocalDB handlers panicked on an unknown CID — FIXED

`generate_remote` carried `.expect("Should not fail to find target")`. The
expectation is wrong, and the SDK settles it in one line — `get_session_cid` does
`.ok_or(RemoteUserDoesNotExist)?` on an `Option`, so any CID the node does not
know locally yields `Err`.

The `.expect` then panicked inside the per-request spawned task, so **no response
was ever written**: the browser waited out its own timeout with nothing, which is
indistinguishable from a network stall.

Not a theoretical input. The dev backend drops every account on an
internal-service restart while browsers keep their stored CIDs, so the first
stale read afterwards hits it — and `LocalDBGetKV` is exempt from the ownership
gate, so it arrives unfiltered. All five handlers now answer with their matching
`LocalDB*Failure`.

### 342. `check-handlers-cannot-panic.mjs` — GUARDED

A panic in a handler is a request that hangs, which is the worst failure shape
this project has: no error, no log the user can act on, no recovery but a reload.

The guard rejects `.expect(`/`.unwrap()` anywhere under `requests/` and
`responses/`. It came in at **one** allowlisted site, which is what made it
practical — and that one carries the argument for why it is unreachable (the
check and the take share a write lock with no await between them), so the
allowlist is a claim to defend rather than a way to quiet the check.

`#[cfg(test)]` modules are excluded by brace-matched stripping: a panic in a test
is a failing test, which is the point of one. Both branches controlled —
reinstating the exact `.expect` fails it, and a `.unwrap()` inside a test module
does not.

### 343. Two audits' contradiction, resolved in favour of the source

Round sixty-eight recorded this as verified-and-unfixed after one audit reported
it and an earlier one had explicitly **refuted** it. Reading the SDK settled it,
and this round closes it — with a guard, so the class cannot come back the way
this instance did: through a helper nobody re-examined after its callers grew to
five.

## Round seventy-three — a thousand log calls that ship to production, 2026-08-28

### 344. `debugLog` is a no-op in production, and its ARGUMENTS still run — FIXED

`debugLog` compiles to `noop` in production, so the logging looks free. It is
not: the **1,092 call sites remain**, and their arguments are evaluated before
being handed to a function that discards them.

That is worse than dead bytes on a phone's first paint. One call recursively
stringifies the serialized session store on **every write**, in production, to
feed the noop.

esbuild's `pure` list is what lets the minifier drop the call and its arguments
together — and it covered only `console.*`, which never included this. `errorLog`
and `warnLog` are deliberately absent from the list: a render crash is the one
error a user cannot report themselves.

Context that makes this more than tidiness: the landing budget is at 297.8 KB
against a 300 KB limit, so the headroom the budget script exists to protect is
already down to 2.2 KB.

### 345. The comment-stripper used by seven guards was silently broken — FIXED

The test asserting the new `pure` entry failed with *"the pure list is gone from
vite.config.ts"* — for a list sitting right there.

The cause is worth stating exactly. Source guards strip comments before matching
(this register records an assertion that matched the comment explaining its own
code's removal). The idiom everyone copied is
`replace(/\/\*[\s\S]*?\*\//g, '')` — and `vite.config.ts` contains
`globPatterns: ['**/*.{js,css,html,…}']`. That glob contains `/*`. The regex
read it as a comment opener, ran to the next real `*/` further down the file, and
**deleted the entire esbuild block in between**.

Seven files had copied that idiom. It now lives once, in `stripComments`, with a
rule that a block comment's opener is preceded by start-of-line, whitespace or a
bracket — never by another `*`, which is what a glob has. Not a parser, and not
trying to be one: the smallest rule that separates the two for source this
project contains.

### 346. Method note — a minimal fixture that did not reproduce the bug

The first version of the helper's test built a two-line fixture: the glob, then
the code. It passed against the NAIVE implementation, which should have been
impossible.

It reproduced nothing because the phantom comment needs something to CLOSE it.
In the real file a later doc comment supplies the `*/`; in a two-line fixture
there is none, so the naive regex matches nothing and leaves the code alone.

**A fixture reduced past the conditions that produce the bug tests something
else.** The fixture now carries the trailing comment, and reverting the helper
fails both it and the real-config test.

## Round seventy-four — the file manager on a phone, 2026-08-28

A responsive audit of everything the mobile guard structurally cannot reach — it
scans four PRE-AUTH screens of a production build, so the entire authenticated
app is outside it. One surface came back genuinely blocking rather than merely
awkward.

### 347. Peers beyond the first were unreachable on a phone — FIXED

The file-manager storage bar had neither `flex-wrap` nor an overflow container,
and its clipping ancestor is `main`'s `overflow-x-hidden`. With two or more
registered peers at 375px the tail of the peer list was cut off **with no way to
scroll to it**, so a phone user could not switch which peer's storage they were
browsing at all.

It now wraps, and the peer group shrinks and scrolls within its row.

### 348. A fixed 208px folder tree beside the grid — FIXED

`VFSTreeView` was `w-52 shrink-0` with no mobile path, leaving ~167px of a 375px
phone for the file grid: one column of tiles with names truncated to a few
characters, a third of the screen spent on a tree. Every other split in the app
— the main sidebar, Messages — got a mobile path; this one simply squashed.

Hidden below `md`. Nothing becomes unreachable: the grid opens folders and the
path bar navigates up.

### 349. A rigid filter input squeezed the breadcrumbs to nothing — FIXED

The toolbar's right-hand group is `shrink-0` and contained a fixed `w-32` input,
so at 375px the breadcrumb strip was left single-digit pixels — the path could
not be read or navigated. Now `w-full min-w-0 max-w-32`. Its clear button was a
12px box; padded to the 24px floor this project enforces elsewhere.

### 350. A `truncate` that could never fire — FIXED

`P2PChatHeader` had `truncate` on the peer name inside a plain `<div>`. A flex
item defaults to `min-width: auto`, so that div never narrowed below the name's
max-content width and a long peer name rendered underneath the call and settings
buttons. `GroupChatHeader` beside it has carried `min-w-0` in exactly that
position, with a comment, since it was written — the fix-in-one-place pattern
again, now four occurrences deep for this single mechanism.

### 351. Method note — asserting classes when there is no layout

These tests assert the class lists rather than geometry, and say so in the file.
jsdom has no layout engine: `getBoundingClientRect` returns zeros, so a
geometric assertion here would pass against any markup at all — the exact
cannot-fail shape this register keeps recording.

Each fix is controlled independently: reverting any one of the three files fails
exactly one test, which is what distinguishes a pinned mechanism from a snapshot
of the current classes.

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.

## Round seventy-five — the node mutator that skipped the lock, and three walks that never got the guard, 2026-08-27

### 353. `update_node` read the node outside the lock it wrote under

`async_node_ops.rs` is the only one of the node mutators that did not hold
`lock_nodes()` across its read-modify-write. The *write* was safe — the backend's
`update_node` takes that mutex itself — but the read above it was not, and the
gap between them spans two awaits. Two callers editing the same node both read
the original and both write it back: the first one's field silently reverts. A
delete landing in that gap is undone outright, because the write re-inserts the
node the other caller just removed.

Fixed by taking `lock_nodes()` at the top and switching to
`get_all_nodes` / mutate / `save_nodes` — the backend mutator cannot be called
while the guard is held, because tokio's Mutex is not reentrant, and the lock's
own doc comment says so.

**The first test for this was green under its own negative control.** It asserted
"update_node blocks while another caller holds the nodes lock" — which was true
*before* the fix too, since the backend write takes the same mutex. The property
that actually separates the two versions is whether the node is re-read *after*
acquiring. The test now holds the lock, lets an update park on it, changes the
node from underneath, and asserts the change survives.

### 354. Three tree walks with no visited set, two of them called under the lock

`get_descendants` in `tree_validator.rs` guards its walk with a `HashSet`.
`is_ancestor_of`, `get_subtree_max_depth` and `get_path_to_root` in the same file
do not. The first two run inside `validate_mutation`, which callers invoke *while
holding `lock_nodes`* — so one cyclic tree would spin forever with the lock held,
wedging every node operation in the workspace permanently rather than reporting
the corruption. `is_ancestor_of` is, with some irony, the check whose job is to
refuse creating a cycle. The BFS in `get_subtree_max_depth` also grows its queue
without bound as it spins, so the hang takes the process's memory with it.

All three now carry the same guard `get_descendants` always had.

**`tokio::time::timeout` cannot bound these.** The walks are synchronous, so an
unguarded loop never yields and the timeout future is never polled — a test
written that way hangs forever instead of failing. The tests run the validator on
a dedicated OS thread with `recv_timeout`, which is what makes the negative
control terminate (5s) instead of hanging CI.

### 355. `ListNodes` with the root's own id returned an empty workspace

`WORKSPACE_ROOT_ID` is a sentinel, not a stored `DomainNode`, so
`nodes.get("workspace-root")` always missed and fell through to
`unwrap_or_default()` — `Ok([])` on a fully populated tree, with no error.
`get_node` and `get_tree_structure` both special-case the sentinel; this listing
never did. Normalized to the `None` branch, which is what it means.

### 356. Subscriptions whose unsubscribe was discarded

`react-hooks/exhaustive-deps` is `"error"` here, so stale-closure bugs are largely
linted away. What survives is the class the lint rule cannot see: an effect that
registers a listener and returns nothing.

- `ConnectionService.onConnectionChange` returned `void`. Its three subscribers
  all re-run on state changes or remount (`AppLayout` remounts per route), so the
  handler array grew for the whole session; every connection change then ran a
  pile of dead handlers, each doing IndexedDB reads. In the workspace switcher
  each dead handler also held a stale `state.workspace`, so a late-resolving one
  could restore a previous workspace's name. It now returns an unsubscribe —
  which `P2PMessengerManager.onConnectionChange` has always done.
- `MembersTab` and `use-domain-members` wrapped `workspaceEvents.onMemberEvent`
  in `runAsyncSetup(async () => await ...)`, throwing away a return value that was
  synchronous all along. `use-domain-call-members` subscribes to the same event
  and returns its unsubscribe. Another fix that existed in-tree and was never
  carried across.

Leaks like these have no runtime symptom — setState on an unmounted component is
a no-op — which is exactly why they accumulate. `WorkspaceEvents.listenerCount()`
was added so the leak is observable at all; without it there is nothing to assert.

### 357. A flash comment blanked the sender's cursor for every peer

`useCollaborativeEditor` called `provider.setLocalState({...})`, which **replaces**
the entire awareness state — including the `cursor` field TipTap's
`CollaborationCursor` maintains there. Sending a flash comment wiped this user's
cursor and selection for all peers, and the 10s expiry wiped it again. That
expiry was also never cleared, so it fired against a provider `destroy()` had
already torn down. Added `setLocalStateField` to the provider and scoped the
timer to the effect.

### 358. The group thread was regrouped on every keystroke

`groupMessagesByDate(messages)` ran unmemoized in `useGroupChat`, which also owns
`inputValue` — so every character typed re-grouped the whole thread, and
`formatDate` builds three `Date` objects per message. Wrapped in `useMemo`.

### Carried forward

- The file-length cap broke again — on comments this time, three files at 251–254.
  Fixed by keeping each explanation once at the mechanism (the service, the hook)
  and leaving a pointer at the call sites, which is where it belonged anyway.

## Round seventy-six — the file you uploaded, which you were told you could not open, 2026-08-27

### 359. Hosted and Remote were inverted, so a peer-stored file was retrievable by nobody

`RevfsFileState` documents itself precisely: `Hosted` = "I store the encrypted
blob for the peer (can't decrypt)", `Remote` = "Peer stores the encrypted blob
for me (downloadable)". `placeFile` stamped the **uploader** `Hosted`.

`uploadFileToPeer` sends the bytes to the peer, and `downloadFileFromPeer` pulls
them back from the peer — so the uploader is unambiguously the `Remote` side.
Under the inversion the uploader's own file failed the download predicate
forever, and the UI told them it was "Hosted for peer (encrypted, cannot open)"
about the one file only they could open. The peer, stamped `Remote`, pulled from
the uploader's node, where nothing had ever been stored. Neither party could
retrieve it.

**Six tests across the suite asserted the two labels directly**, so they moved
with the bug rather than catching it. They are updated, and the new test asserts
what the user can *do* — the uploader's node passes the download predicate, the
holder's does not, and the two sides disagree — which is a property the labels
cannot be quietly swapped underneath. The quota accounting followed the same
inversion; it now bills the uploader, preserving what "used" has to mean for a
check written as `storageQuota - storageUsed`.

Also extracted `isDownloadableState`: the predicate was written out by hand at
three sites, which is how one of them could drift.

### 360. `peerRmdir` never deleted the bytes its server twin carefully deletes

`serverRmdir` collects the files under a directory *before* removing it and
deletes each one, with a comment explaining that a directory is a tree-only
concept and the backend would otherwise keep every blob forever. `peerRmdir`
sent only the tree op. Deleting a folder of peer-stored files removed it from
both trees while every encrypted blob stayed in the host's storage —
unreferenced, unreclaimable, with no tree entry left to reach it from. The
sweep is now one function both call.

### 361. A `$` in a folder name detached its entire subtree

Path rewriting was `path.replace(oldBase, newBase)` at six sites.
`String.replace` interprets `$$`, `$&`, `` $` `` and `$'` in the *replacement*,
and folder names may contain `$` — the rename input rejects only `.` and `..`.
Renaming a folder to `cost$$report` rewrote its descendants to `cost$report`,
which matched no node name, so `findNode` missed every child: those files could
no longer be opened, moved or deleted. One `rebasePath` helper now, with a test
covering all four replacement patterns.

### Carried forward

- The line cap broke again, on comments again. The rule that keeps holding: when
  an explanation applies to a mechanism, it belongs at the mechanism, and the
  call sites get a pointer. That is shorter *and* the right place.

## Round seventy-seven — the switch that decided nothing, 2026-08-27

### 362. "Remember Credentials" was inert; the password was stored either way

The login form has a "Remember Credentials" switch. It was read into the hook's
component state and went no further: `handleAuthSuccess` wrote
`password: params.password` into the stored session unconditionally, and
`storeCredentials` appeared nowhere in the storage path. A user on a security
product who declined credential storage had their password written to LocalDB
anyway — and auto-reconnect then used it to sign them back in silently.

This is the "controls that operate on nothing" pattern in its sharpest form: not
a cosmetic preference, but the one control on the page that is about a secret.

Fixed by threading the answer through as a required field on `AuthSuccessParams`
— required, with no default, because a missing answer previously meant "yes" by
omission. `StoredSession.password` becomes optional, and the type checker then
named all five places that assumed it: the two call sites, the two direct
reconnect paths, and the auto-reconnect loop. The reconnect paths now refuse with
a message the user can act on ("credentials were not saved. Please sign in
again.") instead of sending an empty password and surfacing an auth failure.

The session record is still stored when credentials are declined — the user is
signed in, and orphan reclaim and the server list both need it. Only the secret
is withheld, and the test walks the whole persisted record to confirm the
password was not copied into some other field.

One note on the test: its first version asserted with `JSON.stringify`, which
throws on the bigint `cid` — this repo's own rule, broken while writing the test
for a different rule. It walks the object now.

### Still open from this pass, recorded not fixed

- **Every Privacy setting and every Appearance setting is inert.** Both tabs
  persist to localStorage and dispatch a change event that nothing subscribes to;
  no field is read anywhere outside the tab that writes it. The identical pattern
  in `call-sound-preferences.ts` *is* consumed — the shape was copied, the wiring
  was not.
- **The Connect page bounce-loop.** It is the destination `WorkspaceLoader` sends
  broken users to, but its only authenticated branch tests `session?.cid`, which
  `ConnectionManager` init deliberately clears on every load. The fallthrough
  navigates into the workspace with no session, the loader times out after 5s and
  sends the user back — silently. The recovery route re-enters the failure.
- **Per-peer file-transfer settings are read back with no default-merge**, so the
  next field added arrives `undefined` for every existing user (`allowRevfsStorage`
  would read as off; `revfsQuota` as `NaN` MB). One spread closes the class.
- **`citadel:file-transfers` is write-only and unbounded** — appended on every
  transfer state change, never read by anything, never pruned, and its write
  failure is swallowed.

## Round seventy-eight — the recovery route that sent you back, 2026-08-27

### 363. The Connect page could not recover anyone

`WorkspaceLoader` sends every user whose connection died to `/connect`. That
page's only authenticated branch tested `session.cid` on the **stored** session —
and `ConnectionManager.initialize` deliberately clears every stored CID on each
load ("Clearing stored CIDs to force fresh connection") and persists that. So
after any page load the branch was dead, and the fallthrough navigated into the
workspace with no session at all: the loader found zero active sessions, its 5s
timer fired, and it redirected back to `/connect`. A silent five-second bounce,
repeatable forever, at exactly the moment the user was already stuck.

What actually recovers someone is the live session list on the internal service —
the same list `useOrphanSessions` claims from, and where a session survives a page
reload. `connectToServer` now looks there first; if nothing matches the chosen
server it asks auto-connect to re-establish one from stored credentials and waits
for it; and only if both fail does it give up — saying so, and routing to sign-in
rather than into a workspace that will bounce the user straight back.

The old claim branch also omitted `setSelectedUser`, unlike every other claim path
in the app, leaving the tab's identity for the loader to guess from
`activeSessions[0]` — wrong in a multi-account browser. The extracted path mirrors
`useOrphanSessions` step for step.

### 364. Escape in "Add workspace" threw you out of the workspace

`ServerConnect` carried a vestigial `window` keydown handler whose Escape branch
fell back to `navigate('/')`, and a Cancel button with the same fallback.
`WorkspaceSwitcher` renders it inside a Radix Dialog **without** `onCancel`, so
pressing Escape — the standard way to close a dialog — closed the dialog and
navigated the whole app to the Landing page. Mouse users hit it via Cancel.

The handler was also redundant: `useDialogOverlay` already routes Escape to
`onDismiss`. Deleted it, and made `onCancel` **required** with no navigation
fallback, so a caller has to say what dismissing means to them. The type checker
then found the one caller that never did.

### 365. The pending-requests surface was unreachable without a mouse

Both routes into the pending-requests modal were click-only divs: the sidebar's
count `Badge`, and a notification `Card`. Neither took focus or appeared in the
accessibility tree. The badge is now a real button with a name that says what it
does; the notification card is recorded below, since giving it a keyboard route
means adding an explicit action rather than making a container with nested
buttons focusable.

The test asserts through `getByRole` and tabs to the control with no pointer —
and keeps the old shape as a live negative control, so if `Badge` ever starts
rendering a button the test that proves the fix stops silently passing for the
wrong reason.

### 366. Enter sent half-composed messages to anyone using an IME

The group composer handled Enter itself with no `isComposing` check, so a user
typing Japanese, Chinese or Korean sent a fragment every time they chose a
character. The P2P composer never had the bug because it submits through a
native `<form>`, which browsers suppress during composition — so there was
nothing to propagate, only a rule to state. `shouldSendOnKey` now states it.

### 367. Smaller a11y items fixed in this pass

- The group-chat **send button** and the peer-discovery **refresh button** had no
  accessible name. Both live in the icon-button guard's documented blind spot:
  its icon-only test does not match `{cond ? <A/> : <B/>}` children, deliberately,
  to avoid false positives. Worth noting the guard's success message overstates
  its coverage.
- Online status in the P2P conversation list was colour-only. `PeerListRow` had
  already been fixed with an `sr-only` span citing WCAG 1.4.1; not propagated.

### 368. Per-peer transfer settings were read back without a default-merge

`getSettings` returned the stored blob verbatim, so any field added after a user
last saved arrives `undefined` — `allowRevfsStorage` would read as off, silently
disabling RE-VFS for that peer, and `revfsQuota` as `NaN` MB. Nothing has shipped
in that state yet; the spread closes the class before the next field does it.

### Still open, recorded not fixed

- The notification card route into pending requests (needs an explicit action
  button; making the card focusable would be nested-interactive).
- `FileTransferBubble` is unconditionally `role="button" tabIndex={0}` around
  nested real buttons, with no name.
- Cmd/Ctrl+B toggles the sidebar with no editable-target guard, colliding with
  the editor's Bold.
- Selection is conveyed only visually in three pickers (Connect's server list
  uses `role="radiogroup"` over `role="button"` children with no `aria-checked`).
- `VFSContentGrid`'s whole scroll container is an unnamed `role="button"`.
- Group-chat edit/reply never moves focus to the composer; the P2P composer does.
- `LoadingModal` has no focus management, and its Cancel path is dead — no caller
  passes `onCancel`.
- Privacy and Appearance settings tabs remain entirely inert.
- `citadel:file-transfers` is still write-only and unbounded.

## Round seventy-nine — the privacy switches that promised and did nothing, 2026-08-27

### 369. Every privacy setting was inert

All six settings lived inside `PrivacySettingsTab`, which wrote them to
localStorage and dispatched a `privacy-settings-changed` event nothing
subscribed to. No field was read anywhere outside the tab that wrote it. On a
product whose pitch is that the user controls their own data, "Send read
receipts: off" still sent receipts, and "Show typing indicators: off" still
showed them. The identical shape in `call-sound-preferences.ts` *is* consumed —
the pattern was copied, the wiring was not.

Three have a real enforcement point in this client and are now honoured:

- **`showTypingIndicators`** — gated in `PresenceManager.sendTypingIndicator`.
- **`showOnlineStatus`** — gated in `sendPresenceUpdate`, deliberately rather
  than in `broadcastPresence`, so both the broadcast and the single-peer path
  obey it (the broadcast loops through the single one).
- **`sendReadReceipts`** — gated on the *ack only*. The local half of "read"
  still happens: the user did read the message, so their unread badge must
  clear. Withholding the receipt must not cost them their own state.

The other three are not enforceable here, and saying so is part of the fix:
`allowDirectMessages` and `showProfileToStrangers` need the **server** to refuse
— a client that declines to display something has not stopped anyone from
sending it — and `notifyOnScreenshot` is not observable from a web page at all.
Those three controls are now disabled with a note saying they are not enforced
yet, and `PRIVACY_ENFORCEMENT` gives a future server-side gate one place to flip.
A disabled control that explains itself is honest; a working-looking switch that
does nothing is not.

The settings moved to `src/lib/privacy-settings.ts` so the send paths have
something to read. Its loader merges over defaults — the lesson from the
file-transfer settings two rounds ago — because `undefined` reads as "off" for a
boolean, which would silently answer a privacy question the user was never asked.

One note on the tests: the first version of the typing test failed for a reason
that was not the code. `savePrivacySettings` wrote to one module instance while
the manager under test held a binding to another, whose in-process cache still
had the previous answer. Both helpers now write storage and reset modules in the
same order, so the value under test is the value the code reads.

### Carried forward

- The read-receipt test takes ~2.7s because importing `messenger-compatibility`
  drags in the WASM client, which fails to load under jsdom and retries. Loud,
  not wrong — but worth remembering if that file grows more importers.

## Round eighty — the camera that was never there, 2026-08-27

Two independent audits reached the same finding the same day from opposite
directions — one hunting silent failures, one hunting call-state divergence.
That agreement is what moved it to the top of this round.

### 370. The camera toggle reported success for a camera that was never acquired

`captureLocalMedia` falls back to audio-only when video fails, and that fallback
is right: a call worth having beats no call. But it returned `ok: true` with no
other signal, so nothing told the user their camera had not started. Then
pressing "Turn camera on" enabled zero video tracks — the loop iterated nothing —
flipped the button to on, and announced `video: true` to every peer, whose tiles
showed a camera badge for a stream that would never arrive.

Two fixes, because there were two lies. The capture result now carries
`degraded` when video was requested and only audio was obtained, surfaced through
the same channel a hard failure already uses. And the toggle refuses to turn a
camera on when there is no track to send, saying so instead. Turning the camera
*off* is still always allowed — that is never a lie, and refusing it would strand
a user whose track vanished with their peers still told video is coming.

### 371. `CallSession.start()` could capture two streams, leaving one running

Recorded as open in an earlier round and confirmed still live. `closed` was the
only guard, and it does not cover a second `start()` arriving while the first is
still awaiting the permission prompt. Both entries assigned `localStream` and
`pump`, so the first stream was overwritten with nothing holding a reference —
never stopped, camera light on until the page reloads. Reachable by
double-clicking Call (the buttons are not disabled until `invite-sent`, which
happens *after* capture) or Accept on an incoming call.

Now one in-flight attempt is shared by every concurrent caller, and cleared when
it settles so a genuine retry is a real attempt rather than a replay of the
previous answer. The test stubs `getUserMedia` to resolve on a signal, which is
the only way to have two starts truly in flight, and asserts on the tracks: the
one stream captured is the one stopped.

`call-session.ts` was exactly at the 250-line cap, so the guard needed room. The
outbound encoder — send codec, encoder handles, congestion — moved to
`send-encoder.ts`. It is a genuine unit: it changes when peers renegotiate, the
rest of the session changes when the user hangs up. All 221 existing call tests
passed through the move unchanged, which is the only evidence a refactor of this
size is worth trusting.

### Still open from the call audit, recorded not fixed

- **Navigating to another conversation mid-call removes the only audio sink.**
  The one `<audio>` element lives in `ParticipantTile`, which mounts only inside
  the call's own conversation. Switch away and the peer's audio stops instantly,
  your microphone keeps transmitting, and nothing on screen says you are in a
  call or offers a hang-up. Needs an always-mounted audio host under `CallLayer`
  plus a persistent in-call pill.
- **Glare (both sides dial at once) leaves the loser with a dead ringing card.**
  The glare branch routes through a terminal `ended`, which trips the provider's
  teardown while the invite is still being adopted, orphaning the manager.
  Accept then captures mic and camera and bails.
- **A call to a session living in a follower tab rings with no card.** The card
  is leader-gated; the ringtone is not. 45 seconds of ringing nobody can answer.
- **UDP death mid-call is never reported.** The backend pump returns silently and
  no unsolicited `MediaSessionClosed` is sent; the call stays "active" forever
  with frozen media.
- **`speaking-changed` has no producer** — the speaking ring and indicator can
  never activate.
- **The thumbnail simulcast tier is built at every layer except the encoder**, so
  group video sends full resolution to everyone.

## Round eighty-one — the thread that vanished when you scrolled up, 2026-08-27

### 372. Loading older group messages replaced the whole thread

`handleMessagesLoaded` took a `prepend` flag defaulting to `false`, and its one
caller never passed it — so the paging branch was dead code and an older page
*replaced* the transcript. Everything newer disappeared from screen until a new
message arrived or the user reloaded. The prepend half was built; the caller was
never wired to it, which is this codebase's most productive bug shape.

The response carries no pagination cursor to correlate on, so the manager records
that a load-older request is in flight and consumes the flag when the response
lands. The merge is by id rather than a concat: a live message can arrive in the
same window, and a non-paginated response can arrive while the flag is set, and
either would otherwise render twice.

### 373. A redelivered message became two messages, permanently

ILM can deliver the same inbound message again after a reload — its delivered-set
is memory-only, so anything still in the persisted inbound map at restart is
delivered afresh. The dedup upstream cannot catch it: the in-memory conversation
window is capped at 100 and comes back **empty** after a reload. The page store
then appended blind, and the render-side merge dedups *across* batches but not
*within* one — so both copies rendered, for ever.

One id check at the store, which is the common exit of every path that can
produce a duplicate. It costs one scan of a page that is already loaded.

### 374. A group's unread badge counted your own messages and could never clear

The server answers the sender with the same `GroupMessageNotification` it
broadcasts — that echo is what confirms a send — and the store incremented on
every one with no sender check. Send three messages into a group and your own
sidebar badge reads 3. Meanwhile `markAsRead` existed on the hook with **zero
callers anywhere**, so there was no path back to zero short of a reload. Both
halves fixed: skip the increment for your own cid, and mark read when the group
is opened, because opening it is reading it.

### 375. A storage failure before send left a bubble on "sending…" for ever

`addMessageToConversation` pushes to memory and then awaits the durable append,
and that await sat *outside* the try that marks a message `failed`. A LocalDB
timeout therefore skipped the send and left the message at `pending` — and the
retry affordance is gated on `failed`, so there was no way to act on it short of
retyping. Now marked and rethrown, so the existing toast-and-keep-the-text
behaviour still runs and the retry button appears.

### On the tests

Two of these tests passed for the wrong reason before they passed for the right
one, both from the same cause: `vi.resetModules()` gives the module under test a
fresh copy of its dependencies, while a top-level import in the test file still
holds the pre-reset instance. The unread-badge test emitted into an emitter the
store was not listening on, so "does not count your own message" passed because
*nothing* was counted. Anything imported at the top of a file that also calls
`resetModules` is a different object from the one the code sees — import it
inside the helper instead.

Three files crossed the 250-line cap. Rather than shave comments, three genuine
units came out: `mark-send-failed.ts` (two near-identical failure blocks that had
drifted, now one), `resend-message.ts`, `message-page-append.ts`, and
`group-message-list.ts` — the last being pure list arithmetic that is now
testable without a manager.

### Still open from the delivery audit, recorded not fixed

These are in the Rust submodules and want a bottom-up commit round of their own:

- **ILM's durable queue is one blob with an unlocked read-modify-write, and a 5s
  LocalDB timeout replaces it with an empty map.** One hiccup during a send
  erases every other pending outbound message, each of whose senders was already
  shown "sent". The audit called the timeout-to-empty-map fallback the single
  most dangerous line in the delivery path, and it is hard to disagree: it turns
  a transient read failure into silent, permanent data loss.
- **The receiver marks a message received before storing it.** If the store
  fails, the mark is not rolled back, so every retransmission is answered "already
  received" and ACKed — the sender clears its queue and the message never existed.
- **ILM message ids restart at 0 after a one-sided state wipe**, and the
  receiver's persisted dedup map swallows the first N real messages.
- Ordering rests on sender wall-clocks; the durable per-conversation `index` is
  written and never used to sort, so clock skew renders a reply above its
  question, deterministically.
- `'sent'` means "queued locally" and nothing ever escalates it, so a
  permanently undeliverable message shows a checkmark for ever.

## Round eighty-two — the queue that a slow read erased, 2026-08-27

This round is in the Rust submodules, so it needed a bottom-up commit sequence:
`intersession-layer-messaging` → `citadel-internal-service` → main repo pointers.

### 376. A 5-second storage timeout replaced the entire pending queue with an empty one

ILM keeps a CID's whole outbound queue in **one blob under one LocalDB key**, and
every operation on it is a read-modify-write over the whole map: get it, change
one entry, write it back. `get_map` answered a read timeout with
`Ok(State::new())` — an empty map — under the comment "initialize a new map as a
fallback".

So one slow LocalDB read during a send replaced the entire pending queue with a
map containing only the message being sent. Every other queued message vanished:
messages to an offline peer, each of whose senders had already been shown "sent",
because the UI marks `sent` exactly when `store_outbound` returns. Nothing
surfaced; there is no path from `sent` to `failed`.

The distinction the code needed was already there and only half-used: genuine
absence arrives as `"Key not found"` and correctly initializes a new map; every
*other* failure already returned `Err`. Only the timeout branch guessed, and it
guessed the one answer that destroys data. A timeout means "we don't know", and
"we don't know" must never be spelled "it was empty".

### 377. Two more places that reported success they had not observed

- `update_map` answered an unacknowledged write with `Ok(())` and the comment
  "assume the update worked" — telling the sender their message was durably
  queued when it may not have been. It now fails, so the caller marks the message
  failed and the user gets a retry. A visible failure beats a checkmark on a
  message that is gone.
- Four copies of the same branch substituted an empty map when the read could not
  reach the agent, and the very next line writes that map back — so a momentary
  connection failure erased the queue as well. All four now propagate. The caller
  can retry; it cannot un-erase.

### 378. A message we failed to store was acknowledged anyway

`mark_received` persists "(source, id) has arrived" and then the code stored the
message, logging and dropping any store failure. No ACK is sent on that branch,
so the sender retransmits — but the retransmission then matched the mark, took
the duplicate branch, and **was** acked. The sender cleared the message from its
queue and the receiver never had it. One failed store meant permanent, silent
loss with the sender's UI showing "sent".

The cause is that `mark_received` answers "is this new?" *and records the answer
as a side effect*, which forces every caller to commit to "received" before it
has anywhere to put the message. Added `has_received`, a read with no side
effect, so the durable write happens first; if it fails, nothing claims the
message arrived.

The test asserts through the wire rather than through the tracker, because the
ACK is what does the damage: an ACK tells the sender it may stop retransmitting,
so an ACK for a message that was never stored is the exact moment the content is
lost. Under the old ordering it fails on "retransmission delivered within
deadline" — the resent copy is swallowed as a duplicate and never reaches the
application.

### The pattern under all three

Every one of these is the same shape: an operation that could not determine an
answer returned the *most convenient* answer instead of failing. Empty map,
assumed success, new map. Each reads as defensive — none of them crashes — and
each converts a transient, recoverable fault into permanent data loss with a
reassuring checkmark on top. Failing loudly at the point of uncertainty is what
makes the layers above able to do their job.

## Round eighty-three — deaf in a call, and the history that re-parsed on every keystroke, 2026-08-27

### 379. Navigating away from a call made you deaf while your microphone stayed live

The only `<audio>` element in the app lived inside `ParticipantTile`, which mounts
only in the conversation the call belongs to. Opening another chat, the file
manager or the directory unmounted every tile — so the peer's audio stopped
instantly, the microphone kept transmitting (the session is provider-global by
design, correctly), and nothing on screen said a call was in progress or offered
a way out. The only hang-up control lives on the stage that just unmounted. A
user could walk away from a live microphone believing the call ended with the
page.

Two halves:

- `CallAudioHost` now owns every remote audio element and is mounted under
  `CallLayer`, above the router, so audio is independent of what the user is
  looking at. The tile no longer plays audio at all — one owner, not two.
- `OngoingCallBar` appears whenever a call is running and its own surface is
  *not* on screen, naming who the call is with and offering Return and Leave.
  `CallStage` registers its presence through a small counter (not a boolean: the
  stage can briefly mount twice while a route transition swaps layouts, and a
  boolean would flip to false on the old one's unmount).

### 380. Every keystroke re-parsed the entire message history

The composer's value lives in the chat root, so each character re-rendered
`P2PChat` and every message bubble below it — and each markdown bubble ran a full
remark parse again on text that had not changed. The list has no windowing and
grows as the user scrolls back, so the cost rises with how much history they have
read. Fine on a fresh account, janky after a month, which is the class that never
shows up in testing.

The parse is now memoized on the message text alone. That holds even while the
surrounding bubble re-renders with fresh inline callbacks, so it needed no change
to any component's API — the bubbles' unstable props are a separate, larger
problem and are recorded below rather than half-fixed here.

### 381. An active call re-rendered the whole conversation once per second

`useCallDuration` ticks a 1 Hz `setState`, and it was called in `use-direct-call`,
which runs at the top of `P2PChat`. So for the entire duration of every call, the
whole conversation and every bubble re-rendered every second — while the machine
was also encoding and decoding video. The clock now lives in `CallControls`, the
one element that displays it; `CallStage` passes `running` instead of a formatted
string, and `GroupCallDock` and `use-direct-call` stopped ticking entirely.

### Recorded from this round's audits, not fixed

The workspace-lifecycle audit found two things worse than anything fixed here,
both needing server work and their own round:

- **Room documents are persisted under the wrong path.** `persist_node_content`
  keys by node *name* with a single path segment, so editing a room writes
  `{base}/{room}/CONTENT.md` instead of `{base}/{office}/{room}/CONTENT.md`. On
  the next restart the room resurrects with its old content — the edits are gone
  from where they were made — and a phantom *office* appears holding the orphaned
  text. The correctly-pathed `persist_room_content` exists and this path never
  calls it. Renames orphan the old directory; deletes never remove one.
- **Structural changes are never broadcast.** `CreateNode`, `DeleteNode`,
  `MoveNode` and renames return to the requester with no broadcast; only
  `NodeContentUpdated` is broadcast. `listNodes` is called exactly once, at login.
  So one user's new room is invisible to everyone else until they re-log, a
  deleted office stays in their sidebar, and they keep typing into its chat —
  which the server accepts, because `SendGroupMessage` never checks the
  `group_id` against a live node.

Also recorded: adding a member to any office or room overwrites their
**workspace-global** role (and the last-admin guard there runs outside the lock,
unlike the other two role writers); "Set as default" sends a field the wire
format does not have, so it always reports success and never does anything; and
adding a member who does not exist creates a phantom user and reports success.

From the performance audit: bubbles have no `React.memo` anywhere and the list
passes five fresh closures per item per render, so the memoized parse is the only
thing currently bailing out; received file blobs and their object URLs are pinned
for the session; file reassembly decodes base64 in one synchronous pass; and the
file manager re-renders wholesale every 2 seconds because its peer poll builds
fresh arrays.

## Round eighty-four — the room edit written where rooms are never read from, 2026-08-27

### 382. Editing a room's document lost the edit and invented an office

`persist_node_content` took a single node **name** and wrote
`{base}/{name}/CONTENT.md`. The boot loader reads offices from
`{base}/{office}/CONTENT.md` and rooms from `{base}/{office}/{room}/CONTENT.md` —
so every room edit landed at a path the loader interprets as an *office*.

Three consequences, all silent:

- The edit went somewhere the room is never read from, so at the next restart the
  room came back with its seed content and the user's work was gone.
- A phantom **office** appeared, named after the room, holding the orphaned text.
- Two rooms with the same name in different offices shared one file, so editing
  one overwrote the other.

The correctly-pathed `persist_room_content` already existed; this path simply
never called it. Fixed by resolving the node's full ancestor chain
(`content_path_segments`) and writing at that path. The walk carries a visited
set — the tree validator guards mutations, but this reads whatever is on disk,
and a corrupt chain must not spin.

An unresolvable chain returns empty and the writer **refuses**, rather than
falling through to a guessed path. That check runs before the base-path lookup on
purpose: an unresolvable node is a data problem worth surfacing whether or not
file persistence is configured, and the segments are computed from the nodes map,
not the filesystem, so it stays quiet on a deployment with persistence off.

The negative control is unusually clear: stop the walk at the node itself and
both `Alpha/Standup` and `Beta/Standup` collapse to `["Standup"]` — the two
rooms sharing one file, exactly as shipped.

### Still open — the other half of this cluster

**Structural changes are never broadcast.** `CreateNode`, `DeleteNode`,
`MoveNode` and renames return only to the requester; only `NodeContentUpdated`
broadcasts, and `listNodes` runs exactly once, at login. One user's new room is
invisible to everyone else until they re-log; a deleted office stays in their
sidebar and they keep typing into its chat, which the server accepts because
`SendGroupMessage` never checks `group_id` against a live node. The client
handlers for these variants already exist — they only ever fire for the
requester. That is the next thing to do here.

## Round eighty-five — the tree only one person could see, 2026-08-27

### 383. Structural changes never reached anyone but the person who made them

Only `NodeContentUpdated` was ever broadcast. `CreateNode`, `DeleteNode`,
`MoveNode` and renames answered the requester and stopped there — and the client
calls `listNodes` exactly once, at login, with no polling and no reload event.

So one user's new room stayed invisible to everyone else until they signed in
again. A deleted office stayed in their sidebar, where they kept opening it and
typing into its chat. A rename showed the old name indefinitely. The delete
confirmation's child count is computed from that stale snapshot, so it could
honestly say "0 children" while cascade-deleting rooms created since login.

The client handlers for all three variants already existed, and the sidebar
builds its tree from `parent_id` rather than each node's `children` array — so
putting the node in the map is enough for it to appear. Nothing on that side
needed changing. The handlers simply never fired for anyone but the requester,
which is exactly why nothing looked broken from the seat that made the change:
the only seat anyone tests from.

A rename is not a content update, so the existing `NodeContentUpdated` broadcast
did not cover it; structural edits now broadcast `Node` separately. A **pure**
content save deliberately does not, and there is a test for that: adding a
structural broadcast on top of every keystroke-save would make each one rewrite
the receiver's whole node entry, clobbering anything local.

### Still open in this cluster

`SendGroupMessage` never checks `group_id` against a live node, so messages into
a deleted room's channel are still accepted and stored under an orphan id. The
broadcast above makes that much harder to reach — clients now learn the room is
gone — but the server should not depend on the client having heard.

### From the visual audit — recorded, next up

The token architecture is in genuinely good shape (light mode is real end to end,
and `index.css` documents measured contrast per surface). What is left is a thin
layer of raw-palette stragglers, and four of them are **invisible controls in
light mode**: the selected role-colour ring is `ring-white` offset against a
white background, the workspace-switcher spinner is `border-white` on a 97%
surface, the editor context menu is hardcoded `#1a1b26` from the pre-token
palette, and the pending-requests badge is raw `bg-red-500 text-foreground`
(≈3.9:1, below AA for its size) while a `destructive` Badge variant already
exists. Also recorded: Cancel buttons use three variants and eight class recipes;
six independent timestamp formatters, two pinned to `en-US`; three modal scrim
darknesses; and bubble max-width differing by content type within one thread.

## Round eighty-six — the design-token guard with an eight-entry hole, 2026-08-27

### 384. Four controls were invisible in light mode

The token architecture here is genuinely good — light mode is real end to end and
`index.css` documents measured contrast per surface. What was left was a thin
layer of pre-migration stragglers, each chosen to look right on a dark surface,
each landing on its own colour in light mode:

- The selected role-colour swatch's ring was `ring-white` offset against
  `ring-offset-background`, which is white in light mode. A white ring on white:
  the only indicator of which colour is selected simply disappeared.
- The workspace-switcher spinner was `border-white` on the sidebar's
  97%-lightness light surface. It was also the app's only hand-rolled border
  spinner among thirty-three `Loader2`s.
- The collaborative-editor context menu was hardcoded `#1a1b26` / `#3a3f5c` /
  `#6E59A5` — the retired brand purple included — so right-clicking in a live
  document produced a dark navy menu from a different design era, which no
  workspace theme could ever touch. (The collaborator-cursor block just above it
  *is* deliberately literal and says why; this one sits on the app surface and
  had no such excuse.)
- The pending-requests badge was `bg-red-500 text-foreground`, about 3.9:1 in
  dark mode — below AA at that size — while a `destructive` Badge variant
  already existed and its sibling in `OrphanSessionIcon` already used it.

### 385. The rule that should have caught them exempted eight paths

`no-restricted-syntax` already bans Tailwind palette classes, with a comment
recording the 647 hardcoded hexes across 130 files that motivated it. But a
second ESLint config block listed eight paths — six files plus `src/lib/call/**`
and `src/lib/group-conversations/**`, two whole trees — and **overrode**
`no-restricted-syntax` for them with only the hex rules, dropping the palette
rules entirely. `MembersSection.tsx` was on that list, which is why its raw red
shipped through a guard designed to stop exactly it.

Six of the eight entries turned out to be already clean; the one remaining
violation was `CreateGroupDialog`'s `bg-green-500` — the same "two greens" the
visual audit flagged, alongside `.notification-dot`'s `#22c55e`. Fixing that one
class and the CSS hex let the **entire exemption block be deleted**, so the guard
now covers the whole source tree. Verified by control: put the green back and
ESLint reports it.

An exemption list is the quiet failure mode of a guard. It is added to unblock
one thing, and every path on it stops being protected without anything ever going
red. Worth checking the others in this repo the same way.

### On the test that reported on itself

The first version of the accompanying test failed against its own fix: it grepped
the source for `bg-red-500`, and the comment explaining what that value was
replaced *with* necessarily quotes what it was replaced *from*. Comments are
stripped before matching now — the repo already had `stripComments` for exactly
this.

The test then also tripped the ESLint rule, because its assertion literals *are*
hardcoded colour classes. That settled the split cleanly: ESLint owns Tailwind
palette classes across the tree, and the test owns the two things ESLint cannot
see — raw hexes in CSS files, and the `ring-white` / `border-white` sites the
rule deliberately exempts because the colour picker needs them against arbitrary
user-chosen hues.

## Round eighty-seven — the install prompt that only the landing page could use, 2026-08-27

### 386. Signing in permanently destroyed the install affordance

Chromium fires `beforeinstallprompt` **once** per page load, early, and it cannot
be requested later — the only way to show an install dialog is to replay the
event you caught. It was stashed in `useState` inside `usePwaInstall`, with the
listener registered in that instance's mount effect, so every consumer had its
own listener and its own copy.

That breaks the ordinary journey precisely. The event fires while the user is on
the landing page. Signing in unmounts Landing, taking its stashed event with it,
and mounts the TopBar consumer *after* the event has already fired. So the
user-menu install entry — added specifically because "installing was only
offered on the landing page" — could never appear for anyone who had signed in.
The only remaining affordance was the omnibox icon, which the code's own comment
calls "easy to miss and absent on some platforms".

The capture now lives in a module-scope store started from `main.tsx` before
React mounts, and the hook subscribes with `useSyncExternalStore`. Same reasoning
the service-worker registration already follows and states: nothing that must not
be missed should depend on a component being mounted at the right moment.

`isAppInstalled` also reads display-mode live rather than caching it at start-up.
Launching an already-installed copy flips display-mode without a reload, and a
cached `false` keeps offering an install to someone already inside the app.

The negative control makes the old behaviour explicit: have the store forget its
event when its last subscriber unsubscribes — which is exactly what a per-hook
`useState` does — and only the "mounts AFTER the event" test fails.

`main.tsx` crossed the line cap, so the rollback recovery screen moved to
`storage-version-recovery.ts`. It is one self-contained thing: the last-resort
screen shown when IndexedDB refuses to open because the stored schema is newer
than this build understands.

### Recorded from the PWA audit, not fixed

- **`interactive-widget=resizes-content` is Chromium-only.** The comment above
  that meta tag describes the bug it fixes — `h-dvh` not shrinking, leaving the
  composer under the keyboard — and WebKit does not implement the key, so that
  bug is still live on iOS, the platform the install work targets. Needs a
  `visualViewport` fallback driving a CSS variable.
- **No `env(safe-area-inset-*)` anywhere.** The top inset is handled by choosing
  the `default` status-bar style, which is sound and documented — but iOS
  reserves only the status bar, so in standalone the composer's bottom edge sits
  in the home-indicator gesture zone.
- **"Updated in another window" tells the user to reload, in a window with no
  reload control.** That toast carries no action, and the re-offer path is gated
  on `registration.waiting`, which is null once another window has already
  activated the new worker. In an installed standalone window there is no ⌘R and
  no URL bar.
- The offline banner is positioned `top-14` for the app header on every route,
  including the header-less landing page — which is exactly the offline
  cold-start screen.

## Round eighty-eight — the iOS half of the PWA, and the guard list that drifted, 2026-08-27

### 387. The keyboard fix was Chromium-only

`index.html` carries `interactive-widget=resizes-content` with a comment naming
exactly what it fixes: without it the layout viewport keeps its full height when
the keyboard opens, so `h-dvh` does not shrink and the chat shell — which is
`overflow-hidden` with the composer as its last flex child — leaves that composer
underneath the keyboard.

But `interactive-widget` is a Chromium-only viewport key. WebKit does not
implement it, so on iOS — the platform whose installed PWA is the product's
primary mobile surface — the bug that meta tag exists to fix was still live.

`keyboard-inset.ts` publishes `visualViewport.height` as `--app-height`, and the
shell uses `h-[var(--app-height,100dvh)]`. Chromium already resizes the layout
viewport, so there the difference stays under the 120px threshold and this never
fires: the two mechanisms do not fight. Same measured-CSS-variable style the
offline banner already uses for its own height.

### 388. Nothing anywhere reserved the bottom safe area

The top inset is handled by choosing the `default` status-bar style, which is
sound and documented — but iOS reserves only the status bar. In standalone the
shell ran to the physical bottom, putting the composer's bottom edge in the
home-indicator gesture zone, where a tap can trigger the system gesture instead.
`pb-[env(safe-area-inset-bottom)]` on the shell; the value is 0 everywhere else.

### 389. "Reload when you are ready" in a window with no reload control

The cross-window update toast carried no action, and an installed standalone
window has no reload button and no URL bar. The re-offer-on-return path cannot
help either: it is gated on `registration.waiting`, which is already null once
another window has activated the new worker. The toast now carries a Reload
action, like the other two.

### 390. The offline banner floated in mid-air on the one screen it matters most

It is `fixed` at `top-14` and mounted globally, above the router — including on
the landing page, which has no header and *is* the offline cold-start screen.
`AppLayout` now publishes `--app-header-height` while mounted, and the banner
uses `top-[var(--app-header-height,0px)]`: below the header where there is one,
at the top where there is not, without the banner knowing about routes.

Its layering test had pinned its regex to `top-14`, so a correct change to the
offset silently extracted `0` for the z-index. The regex matches on
`fixed inset-x-0` now, and a new case asserts the extraction found anything at
all — otherwise every comparison degrades to `0 > n`, which fails for the wrong
reason.

### 391. `npm run preflight` had drifted eleven gates behind CI

Preflight's header states its charter: "Every CI gate that can run without
Docker, in one command," written after three gates were found red by finally
running them by hand. Its list was a hand-maintained array of ten. CI had grown
to twenty-one `node scripts/*.mjs` gates — every one of which runs from a plain
checkout. Eleven checks a developer could have run in one second were only ever
discovered by pushing: the exact failure the file was written to end, re-appearing
one gate at a time, which is what a hand-copied list does.

The list is now **derived from validate.yml**. Adding a gate to CI adds it to
preflight with no second edit. Exclusions are an explicit map with a reason and
are printed as skipped, because an exclusion nobody can see is how a list starts
lying — there is exactly one, `check-production-image`, which drives a browser
against a built image.

Two ways this could become a clean run over nothing, both now fatal: the workflow
being unreadable (says which file), and it being present but reshaped so few
gates parse (says how many it found). Verified by control against a temporary
tree — both exit 1.

Preflight went from 14 checks to 24.

### Recorded from the guard audit, not yet fixed

- **`check-generated-types-fresh` proves copy-sync, not freshness.** It compares
  two committed directories; nothing regenerates the ts-rs output and diffs it.
  If a Rust type changes and nobody re-runs ts-rs, both copies agree and the gate
  passes while client and server disagree on the wire.
- **`check-storage-keys` is still blind to class-field keys** — resolves only
  `const NAME = '...'`, so `private static readonly STORAGE_KEY = '...'` and all
  its call sites are dropped while the summary prints OK. Recorded before; still
  open, and it exempts the very module it was written for.
- **`check-handlers-cannot-panic` exempts a whole file per ALLOWED entry**, so a
  new `unwrap` anywhere in `requests/media/open.rs` passes — and the check named
  "cannot panic" does not look for `panic!`, `todo!` or `unimplemented!` at all.
- **The Windows agent binary is published without ever being executed** — the
  smoke step is `if: runner.os != 'Windows'`.
- Several guards no-op quietly if their input is renamed
  (`check-no-test-features-shipped`, `check-restart-policies`,
  `check-doc-env-vars.sh`), and the 250-line cap plus the env-var gate hang off a
  matrix leg whose own comment warns that renaming it takes the gate with it.

## Round eighty-nine — the specs that could not fail, and two guards that could not see, 2026-08-27

### 392. Post-reconnect messaging was printed PASS/FAIL and gated on nothing

`hard-disconnect-offline.test.ts` gates on account creation, registration,
initial messaging, disconnect, re-login and offline delivery — but not on
`postReconnectMessaging`, which it prints as PASS/FAIL at the end. A run could
print two FAILs and exit 0.

That is the fragile part the whole spec exists for: ILM channel asymmetry means
Alice→Bob can work while Bob→Alice does not. `offline-messaging.test.ts` already
carries this exact fix, under a comment describing this exact bug. It was never
carried across.

### 393. "Initial Messaging: PASS" meant "the send button worked"

Three reconnection specs did:

```
const msg1Sent = await sendMessage(...);
if (msg1Sent) { await verifyMessageReceived(...); }   // result discarded
results.push({ status: msg1Sent ? 'PASS' : 'FAIL' });
```

The verification ran and its answer was thrown away. This is the baseline every
later reconnection phase is measured against, so an undelivered baseline made
each spec meaningless while green — "request send is not response", still live in
three files after being fixed elsewhere.

### 394. A failed reverse-direction send recorded no row at all

`p2p-one-c2s-reconnect.test.ts` pushed its Phase 9c row inside `if (msg3Sent)`,
and `allPassed` only checks rows that exist. So the reverse direction — the one
most likely to break after an asymmetric reconnect — could fail silently while
the forward direction carried the spec to green. Recorded unconditionally now.

Also renamed Phase 10a from "No Session Errors" to "Session errors
(informational)". Its status is hardcoded PASS, and the argument for that is
sound and written down — but a row named "No Session Errors: PASS" that cannot
report anything else reads, in the results table, exactly like a check that ran.

### 395. `check-storage-keys` could not see a key held in a class field

It resolved only `const NAME = '...'`. A key declared
`private static readonly STORAGE_KEY_TRANSFERS = '...'` returned null, so every
one of its call sites was dropped while the summary printed OK — silently
exempting `lib/file-transfer/service.ts`, one of the modules the check exists to
cover. It now reads class fields and resolves `Foo.NAME` / `this.NAME` by member
name. Coverage went from 7 keys read / 8 written to 9 / 10.

### 396. The panic guard exempted whole files and did not know what a panic is

Two holes in one check:

- `ALLOWED` was keyed by **file**, so the argued exception for one `.expect` in
  `requests/media/open.rs` excused every future panic anywhere in that file. An
  argued exception is about one line; it is now keyed by file *and* source text.
- The matcher tested only `.expect(` and `.unwrap()`. A check named "handlers
  cannot panic" did not look for `panic!`, `todo!` or `unimplemented!`, all of
  which abort a handler exactly as hard.

Both verified by control: a second `unwrap` in the allowlisted file, and a bare
`panic!` in a handler, each now fail the run.

### The shape these five share

Every one is a check that reports a clean result over something it never looked
at — a gate that omits a field, a verification whose answer is discarded, a row
that only exists on the happy path, a parser that returns null and moves on, an
allowlist scoped wider than its argument. None of them was ever red. That is the
whole problem: the only signal a guard like this gives is the one it fails to
give.

## Round ninety — two reads that asked nobody's permission, 2026-08-27

### 397. `GetMember` had no authorization check at all

A `User` carries the role, the **full per-domain permissions map** and the
metadata. `GetMember` took a `user_id` from the request and returned that record
to anyone authenticated — no admin check, no self check, nothing. Any account
could enumerate every other account and read the entire enforced permission state
of the workspace, which is the reconnaissance step for every privilege-grant path
in this kernel.

`GetUserPermissions` sits fifteen lines below it and gates exactly this data
correctly (`actor == user_id || is_admin`). The rule existed; this handler simply
never applied it.

### 398. `ListMembers` trusted the `domain_id` in the request

It read the roster of whatever domain the caller named, with no check that they
belong to it — returning full `User` objects for every member. Any account could
read the complete membership, roles and permission maps of every office and room,
including ones they were never added to. Now gated on membership of that domain,
or admin.

Both fixes come with the tests that matter in both directions: a non-member is
refused, and — equally important — reading your own record, an admin reading any
record, and an admin listing the roster all still work. A gate that also breaks
the admin panel is not a fix.

### Recorded from the permission audit, not fixed

**`delete_workspace` ignores the actor entirely.** Its signature takes
`_user_id` — discarded — and the only check is that the supplied master password
matches the stored one. And `create_workspace` stores *root's* password for every
workspace it mints, so possession of the single root master password authorises
deleting **any** non-root workspace, by any authenticated user, member or not.
Two things to fix and they are separable: gate on admin or an explicit
`DeleteWorkspace` permission, and stop reusing one secret across every workspace.

The audit also confirmed the good news worth writing down: `actor_user_id` is
derived from the authenticated session CID and never read from the request body,
so identity itself cannot be spoofed; and the enforced permission oracle is the
*stricter* of the two in the tree — the role-derived RBAC table is dead in the
request path, so no capability is ever handed out implicitly by role.

### Recorded from the deployment audit, not fixed

- **The hosting quickstart produces a server no remote user can reach, and steers
  away from the fix.** `INSTALL.md` says the server binds `127.0.0.1` and that
  publishing means a tunnel or proxy, "not widening the bind address" — but the
  supported topology is each user's own agent dialling the server directly over
  Citadel TCP/QUIC, and the production compose file says the opposite in its own
  comment, with the one-line answer (`WORKSPACE_BIND_ADDR=0.0.0.0:12349`). The
  tunnel profile routes only `:8080` and `/ws`; port 12349 has no route at all.
- **The tunnel setup steps tell the operator to publish the unauthenticated agent
  control plane** — a `/ws*` public-hostname rule to `:12345`, in the same file
  that says in capitals that the UI served there cannot reach an agent by design,
  and that proxying it "would hand it to the internet".
- **`update-avarok-server.sh` cannot work**, on a clean machine or the author's:
  a hardcoded ssh alias and remote path, a build with no `--target` (so it builds
  the ~5.6 GB dev stage), and no `WORKSPACE_MASTER_PASSWORD`, which the server
  exits without.
- `.env.example` documents a `VITE_WS_URL` build step that no longer exists, and
  the env-var gate cannot catch it because it scans only two docs.
- No monitoring guidance, no health surface beyond port-liveness, and no
  secret-rotation story for `WORKSPACE_MASTER_PASSWORD`.

### Also this round — visual consistency

- **Own markdown bubbles were barely legible in light mode.** The bubble is
  `bg-primary text-primary-foreground` — dark purple in *both* themes — but the
  prose wrapper was `prose prose-sm dark:prose-invert`, so in light mode the
  typography plugin painted its own near-black `--foreground` onto that dark
  purple, and links got `--primary`, the bubble's own colour. Own bubbles now
  invert unconditionally; peer bubbles sit on `bg-surface` and correctly follow
  the theme.
- **Bubbles in one thread stopped at two different right edges** — 80% for text
  and markdown, 70% for file transfers and live documents, and a third value for
  group messages. One `BUBBLE_MAX_WIDTH` now.
- **Six independent timestamp formatters, two pinned to `'en-US'`.** A French
  browser got US dates in the files sidebar and native dates in chat. One
  `lib/format-time.ts`, browser locale throughout — a hardcoded locale is not a
  formatting choice, it writes 3/4/2026 to a reader for whom that means March.

## Round ninety-one — a shared secret was the whole gate, 2026-08-27

### 399. `delete_workspace` discarded its actor

The parameter was literally `_user_id`. The only check was that the supplied
master password matched the stored one — and `create_workspace` stores **root's**
password against every workspace it mints, so one shared secret authorised
deleting any non-root workspace, by any authenticated account, member or not.
Every workspace creator holds that secret.

Now gated on admin **or** the workspace's `owner_id`, with the password kept as a
second factor rather than the only one. Owner as well as admin because a
workspace's owner is not necessarily a global admin, and deleting their own
workspace is the ordinary case.

The test uses the *correct* password throughout — that is the point: knowing it
is no longer enough. It also asserts the refused delete deleted nothing, and that
an accepted delete actually deletes, because a gate that quietly no-ops is its
own bug.

### 400. The deployment instructions told operators to publish the agent

`docker-compose.production.yml` opens with a capitalised warning that the UI
served there cannot reach an agent **by design**, explains that the agent's
control plane is unauthenticated and holds every connected user's ratchet keys,
and ships `WS_PROXY_ENABLED=0` fail-closed to enforce it.

Its own tunnel setup steps then instructed adding a public hostname rule
`yourdomain.com/ws* → ws://localhost:12345`. That reaches the agent directly,
bypassing nginx and the switch entirely. The switch closed the door; the setup
steps reopened it one layer down, in the same file.

Removed, with the reasoning in place — and `cloudflared` no longer declares
`depends_on: internal-service`, because waiting on the agent implied a route to
it that must not exist.

### 401. The hosting quickstart produced a server nobody could reach

`INSTALL.md` said the server binds `127.0.0.1` and that publishing it means a
tunnel or reverse proxy "not widening the bind address". But each user runs their
own local agent which dials the server directly over the Citadel protocol — so
unlike an ordinary web app there is nothing an HTTP proxy can do here, the tunnel
profile carries no route to `:12349`, and it could not carry the raw protocol if
it did. An operator following the quickstart got a healthy-looking stack that
every remote user failed to connect to, and the doc pointed away from the one
line that fixes it. The production compose file has said the opposite in its own
comment all along.

### The theme of the last three rounds

Nine findings, and eight of them are a check that exists somewhere in the tree
being absent, weaker, or contradicted somewhere else: a gate applied fifteen lines
below where it was missing, an exemption list wider than its argument, a fix
comment-documented in one spec and never copied to its sibling, a fail-closed
switch undone by the setup steps in the same file. Almost nothing here was
unknown — it was known in one place and not another.

## Round ninety-two — the exemption that was a variant, not a key, 2026-08-27

### 402. `LocalDBGetKV` was exempt from the ownership gate as a whole variant

The gate that stops a connection naming a session it does not own carried one
exemption, and the comment beside it is unusually honest about why: enabling the
gate produced refusals in ordinary two-peer messaging, every one of them was
ILM's messenger backend reading key/value state, and refusing those would break
messaging while every spec still passed. So the read was left allowed and
recorded as an open question rather than hidden.

But the exemption was written as `matches!(command, LocalDBGetKV { .. })` — the
whole **variant**. Any connection could read **any key** of any account whose cid
it could name, and a cid is a `u64` that travels in peer lists and notifications,
not a secret. A malicious page reaching `localhost:12345` — the threat this gate
was built for, and which its own comment describes — could read arbitrary
persistent state.

Every key ILM touches is one of seven fixed names suffixed with `-{cid}`. The
exemption is now scoped to exactly those, which preserves precisely the access
the evidence justified and withdraws the rest. The prefix list lives in the gate
rather than being imported from the connector crate: this is a security boundary
and should fail closed on a key it does not recognise, and if ILM gains a key the
refusal appears in the log naming the variant — which is how the evidence for the
exemption was gathered in the first place.

### 403. LocalDB writes were let through for any account without a mapped session

The gate deliberately lets an **unmapped** cid pass, on the stated grounds that
"the handler owns that error and already reports it". That is true of `download`
and `delete_virtual_file`, which look the cid up in the map and fail. It is not
true of the LocalDB handlers: they resolve through `propose_target`, which by its
own doc only checks that the cid names a locally-known account — not that the
caller owns it.

So for an account that is known but has no mapped session — after a `Disconnect`,
for instance — any connection could set, delete or clear its persistent store, or
read all of it. Those four requests now require the session to be **owned**, not
merely unclaimed.

### On the tests, and a control that proved nothing

The first version tested only `is_ilm_key`. The negative control — widening the
exemption back to the whole variant — left that predicate untouched, so every
test still passed. A control that cannot fail is exactly as useless as a test
that cannot fail, and it was failing silently in the same way.

The decision is now its own function, `is_exempt_from_ownership_gate`, tested
directly. Both controls bite: blanket-exempting the variant fails one test,
dropping the ownership requirement for writes fails two.

The key predicate also had a hole its own test caught: `inbound_messages-` with
nothing after it passed, because `all()` over an empty tail is vacuously true.

### Recorded from the client-library audit — all four old findings confirmed live

An earlier round recorded four problems in `citadel-workspace-client-ts` and
never revisited them. All four are still true in the current tree, verbatim:

- **The caller's `errorHandler` is overwritten**, unconditionally, by
  `WorkspaceSessionManager`'s constructor. The running app passes one and it is
  silently discarded.
- **"Reconnect" is a stub that clears the session.** It logs "Reconnection would
  require stored credentials" and then clears the workspace session — while the
  base class has a real `restart_ws_connection` it never calls. Combined with the
  above, *any* WASM-layer error clears the user's session. This pair is the most
  actively harmful, because it fires inside the one code path the app does use.
- **Responses are matched by response TYPE, not `request_id`**, even though the
  generated types carry one. `connect()` waits for `ConnectSuccess`/`Failure`, so
  the service's routine `SessionAlreadyActive` matches neither and the call hangs
  its full 30s timeout in a normal flow.
- **`open_p2p_connection` / `send_p2p_message` are declared but not exported** by
  the wasm glue, so all three methods that use them throw at runtime.

The audit's most useful structural finding: the app survives because it routes
*around* the broken half of the library — using it as transport only and
reimplementing every correlation and auth flow itself with `request_id` matching.
That is why none of this shows up in the product, and why it will bite the first
consumer of the published surface.

## Round ninety-three — the library that threw the user out of their workspace, 2026-08-27

Two defects recorded rounds ago, confirmed still live, and both firing inside the
one code path this app actually uses.

### 404. The caller's `errorHandler` was overwritten before its first error

`InternalServiceWasmClient` keeps a single handler slot, and
`WorkspaceSessionManager`'s constructor called `setErrorHandler(...)` — so the
`errorHandler` this app passes in its config was silently discarded during
construction, before an error could ever reach it. The base client now supports
additional subscribers through `addErrorListener`, which returns a remover and
does not displace the config handler; the session manager uses that.

The listener list is deliberately *additional*. Deleting the config handler would
have "fixed" the clobber by removing the thing being clobbered, which is the
wrong direction and easy to reach for.

### 405. "Reconnect" cleared the workspace session, on the success path

The scheduled reconnect logged "Reconnection would require stored credentials"
and then cleared the workspace session — unconditionally, not on failure. So any
error from the WASM layer, including a routine message-processing error, threw
the user out of their workspace. Combined with the clobber above, that path was
reached by every error the app's own handler was supposed to see.

It never attempted a reconnection of any kind, while the base client has had a
real `restart_ws_connection` all along — used by its own recovery loop, never by
this. It calls that now, and resets the attempt counter on success.

The session is deliberately **not** cleared on failure either. A CID is permanent
per account and a session survives a transport drop, so discarding local session
state is both wrong and unrecoverable; what a dead transport means is the
caller's decision, and the caller can now actually hear about it.

Also added `dispose()`: the reconnect timer was cancellable only by firing, and
the error listener and session subscription lived for the life of the page.

### On testing a package with no test harness

`citadel-workspace-client-ts` has no test setup, and adding one is a larger
change than these two fixes. The guard is therefore a source assertion written
from the app's suite — it cannot prove the behaviour is right, and it says so in
the file. What it does do is prevent this exact pair returning and name the line
to look at. Both controls bite: restoring `setErrorHandler` fails one test,
restoring the session-clearing stub fails two.

### Still open in that library

- **Responses are matched by response TYPE, not `request_id`**, though the
  generated types carry one. `connect()` waits for `ConnectSuccess`/`Failure`, so
  the service's routine `SessionAlreadyActive` matches neither and the call hangs
  its full 30s timeout in a normal flow; `register()` resolves on any
  `ConnectSuccess`, including one belonging to a concurrent connect for a
  different user. On timeout the temporary handler is never restored.
- **`open_p2p_connection` / `send_p2p_message` are declared in the `WasmModule`
  interface but not exported by the glue**, so the three methods using them throw
  at runtime. `p2pConnections` can therefore never be non-empty.
- **`auth.getSession()` races the background message loop** on the same
  `next_message()` stream, so it either throws or steals a message the handler
  chain then never sees.
- **The entire `MessageDelivered` branch handles a variant no Rust code emits** —
  zero hits across the tree, and absent from the generated union.

The structural point worth keeping: the app survives all of this by routing
*around* the library — using it as transport and reimplementing every correlation
and auth flow itself with `request_id` matching. That is why none of it shows up
in the product, and why it will bite the first consumer of the published surface.

## Round ninety-four — every group link was broken, and one URL crashed the app, 2026-08-27

### 406. Every reload, bookmark and shared `/groups/:id` link bounced with "may have been deleted"

`GroupChatPage` looked its group up on mount with `getGroup`, which reads the
module store **synchronously** — while the restore from IndexedDB is
asynchronous. On a cold load the lookup always ran first, so the page navigated
away with a destructive toast claiming the group was deleted.

Not a race: all effects of a commit run before any microtask from that read can
resolve, so this failed every single time.

The persistence layer was added specifically to fix this — its own comment says
"a bookmarked /groups/:id reported 'This group may have been deleted' for a group
that still existed". The store now rebuilds correctly; nothing ever waited for
it. Half a fix, landed and then not finished.

`areGroupsHydrated()` is set in a `finally`, so it is marked even when the read
finds nothing or throws: "hydration finished" and "there are groups" are
different facts, and a consumer waiting on the first would wait forever if only
the second set it — which the original early `if (stored.length === 0) return;`
did exactly.

**My first negative control for this was wrong, not the code.** I reintroduced
the early return *inside* the new `try`, so the `finally` still ran and nothing
failed. The `finally` is the whole point. Restoring the original shape — early
return with no `finally` — fails two tests.

### 407. `/messages?channel=<anything-not-a-number>` took down the whole app

`Messages.tsx` read the param raw and handed it to `BigInt(...)` **during
render**, so a malformed URL threw a `SyntaxError` mid-render and landed in the
app-wide error boundary — not a per-page fallback.

`WorkspaceView` funnels this same `channel` param through `tryParseCid`, with a
comment calling `params.get('channel')` "the historical crash surface". The fix
existed, in the tree, next door, for the same parameter.

### Recorded from the multi-tab audit — the standout

**The outbound retry engine is never started.** `outbound-queue.ts` defines
`start()`, and `checkTimeouts()` runs only from the poller that `start()` arms —
and nothing in production calls it. So the header's stated contract ("If no ACK
within ACK_TIMEOUT_MS, message is retried… Max 3 attempts") never executes;
`handleTimeout`, `MAX_RETRIES` and the `outbound-failed` event are unreachable.
A follower request dropped at the wrong moment waits the full 30s and fails, with
no retry ever attempted. Sibling `BroadcastChannelService` calls its own
`startPolling()` in `initialize()`; this one was never wired.

And the one recovery path that *does* exist — leader-change replay — error-acks
every pending request instead of recovering it, because module-eval order means
the queue's replay listener runs before the outbound handler sets `isActive`, and
a newly promoted tab's `websocketSendFn` is still null while its socket boots.

Also recorded: a backgrounded leader flaps leadership every ~5s under Chrome's
intensive timer throttling (heartbeat 2s, timeout 5s, clamp ~60s), opening and
closing a WebSocket each cycle; a frozen tab on unfreeze steals leadership back
from the tab holding the live socket, because the "older tab wins" rule assumes
the older tab has the connection; and the legacy broadcast channel still fans
most response types to every tab unfiltered, which is the cross-session bleed the
CID-routing work was built to stop, for every type outside the eight-member set.

### Also recorded from the routing audit, not fixed

- **In-app navigation silently discards an unsaved document edit.** The guard
  arms only `beforeunload`; there is no router blocker, and its own footer
  comment says "any *future* navigation guard". One sidebar click throws the
  buffer away.
- **The auth redirect discards the intended destination**, so signing back in
  from a deep link lands on bare `/workspace`.
- A stale or foreign `nodeId` renders the default demo page titled "Welcome to
  Your Workspace" — indistinguishable from a real page.
- The file manager's location is unlinkable and resets to `/` on reload.

## Round ninety-five — a retry engine nobody started, and an edit nobody asked about, 2026-08-27

### 408. The outbound retry engine was never started

`outbound-queue.ts` documents its contract at the top of the file: "If no ACK
within ACK_TIMEOUT_MS, message is retried. Max MAX_RETRIES attempts. After max
retries, emits 'outbound-failed'." `checkTimeouts` runs only from the poller that
`start()` arms — and `start()` had **no caller anywhere in production**.

So none of it ever ran. `handleTimeout`, `MAX_RETRIES` and the `outbound-failed`
event were unreachable code sitting behind a written promise, and a follower
tab's request dropped at the wrong moment had exactly one recovery trigger — the
leader-change replay — and otherwise waited out the full 30s ACK timeout before
failing. The sibling `BroadcastChannelService` calls its own `startPolling()` in
`initialize()`; this one was simply never wired.

Started from `InstanceChannel.initialize`, where the channel it retries over
comes up. The tests exercise the real timeouts with fake timers — retry, give up
after the documented count, and stop on acknowledgement — plus one that asserts
the **wiring**, because the first three pass perfectly against a queue nobody
ever starts. That is precisely the state this fix found.

### 409. In-app navigation discarded an unsaved document edit without asking

`use-unsaved-mdx-guard` armed `beforeunload`, which covers closing the tab and
nothing else — its own footer comment referred to "any *future* navigation
guard". So the click that loses the most work went unguarded: selecting another
node in the sidebar unmounts the editor, because `BaseOffice` is keyed by node.

A router-level blocker would cover every path at once, and `useBlocker` is the
right tool — but it requires a data router and this app mounts `<BrowserRouter>`.
That migration touches every route and is not something to fold into this round.

So: a shared `hasUnsavedEdits()` the navigation sources consult, keyed by owner
rather than counted so releasing one editor cannot answer for another and a
double release cannot drive a count negative. The sidebar — the dominant loss
path — now asks, reusing the existing `DISCARD_EDIT_PROMPT`.

**The gap is deliberate and worth stating**: browser Back/Forward is a popstate,
which neither `beforeunload` nor a call-site check can intercept. That one still
needs the data router, and until then Back still loses the buffer.

While wiring it I hit a small version of the same class: importing `useConfirm`
without calling it leaves `confirm` resolving to `window.confirm`, silently, with
a compatible-looking signature. The type checker caught it because the app's
dialog takes an object and the browser's takes a string.

### Still open from the multi-tab audit

- **The leader-change replay error-acks every pending request** instead of
  recovering it: module-eval order runs the queue's replay listener before the
  outbound handler sets `isActive`, and a newly promoted tab's `websocketSendFn`
  is still null while its socket boots. With the retry engine now running, a
  timeout retry will at least follow — but the replay path itself still turns a
  recoverable request into a failure.
- **A backgrounded leader flaps leadership every ~5s.** Heartbeat 2s, timeout 5s,
  against Chrome's ~60s intensive-throttling clamp — so a hidden leader misses
  every deadline, the foreground tab promotes and opens a socket, the hidden one
  answers on the untrottled message path and reclaims, and the new socket is torn
  down. Web Locks would be immune to this; timers are not.
- **A frozen tab, on unfreeze, steals leadership back from the tab holding the
  live socket**, because the "older tab wins" tiebreak assumes the older tab has
  the connection — which freezing inverts.
- **The legacy broadcast channel still fans most response types to every tab**
  unfiltered, which is the cross-session bleed the CID-routing work exists to
  stop, for every type outside the eight-member routed set.

## Round ninety-six — the retry engine arms itself now, and one fix I backed out, 2026-08-27

### 408 (revised). The retry engine now arms on first use

Round ninety-five started it from `InstanceChannel.initialize`. That was wrong in
a way the test suite showed within minutes: the channel is constructed in every
module graph, so a poller started there runs wherever the module is imported —
and a privacy test that resets modules went from 2.7s to a 5s timeout.

Self-arming is the better design regardless. `enqueue` starts the poller and
`acknowledge` stops it once the queue drains, so the timeout checker exists
exactly when there is something to time out, an idle app carries no timer, and
no future call site has to remember. A guard that has to be switched on by
someone else is the shape that produced this bug in the first place.

### On the fix I backed out

The multi-tab audit's second finding is real and confirmed: the leader-change
replay **error-acks** every pending request rather than recovering it, because
module-eval order runs the outbound queue's replay listener before the handler's
own `instance:leader-changed` listener sets `isActive`, and a newly promoted
tab's `websocketSendFn` is null until its socket finishes booting.

I built the fix — hold instead of error-ack, flush when ready, with a bounded
queue and a deadline so a request that can never be served still fails rather
than hanging. Then a privacy test started timing out at exactly 5s, and
bisecting showed the handler change caused it. Three attempts to explain that
did not: seeding `isActive` from `instanceManager.isLeader`, deriving the park
deadline from the retry interval, and arming a sweep timer all left it at 5002ms.

So I reverted it. This is a change to the failure semantics of a hot path in
multi-tab coordination, on a branch I cannot exercise against two live tabs, and
I did not understand why it behaved as it did. Shipping a behavioural change to a
recovery path while unable to explain its observed timing is how a recovery path
becomes the thing that needs recovering.

What is recorded, for whoever picks it up: the finding is PROVED, the shape of
the fix is right, and the unexplained part is why a parked request in a
leaderless jsdom graph does not fail at its deadline. That is where to start.

### Recorded from the notification audit — the standout

**The User Directory is a closed loop.** `sendRegistrationRequest` is a
`setTimeout` that hands the request to a simulation guarded on
`recipientId === 'current-user'` — but the request is created with the *target's*
id, so even the simulation does nothing. The user is toasted "Request Sent" and
nothing was ever sent. `canMessageUser` requires a connection only that dead path
can create, so the "Online" tab is permanently empty and "Send Message" always
refuses — **including for peers who are genuinely P2P-connected through the real
flow**. The careful username-vs-CID navigation fix below it is unreachable code.

Also recorded: every DM raises a bell notification even while the user is looking
at that conversation, because `setActiveConversation` is only called by an
adapter nothing mounts; opening the bell in one session marks **other** sessions'
notifications read, because `markAllAsRead` is unscoped while the panel is
scoped; OS-notification permission is only ever requested from a hidden tab, so
it can never be granted on Firefox or Safari; group messages produce no
notification at all, while DMs beep and raise one; and the "Online Status"
privacy toggle suppresses presence *messages* while every surface derives Online
from the connection itself.

### Recorded from the boot audit — the standout

**A first boot whose structure failed to load is permanently stamped "seeded".**
The legacy structure-load failure is non-fatal, so the seed-pending marker is
never armed; the next boot sees neither marker, takes the "predates the markers"
back-fill branch, and marks it seeded. The workspace has no offices, forever,
and every subsequent boot logs "already seeded; skipping". The recommended
`content_base_dir` path is correctly fatal — only the deprecated one swallows it.

And: any stray directory under `content_base_dir` without a `CONTENT.md` is a
**fatal** boot error on every boot, including boots that will never seed — while
the server itself creates exactly that shape if it dies between `create_dir_all`
and `write`. Under `restart: unless-stopped` that is a crash loop until an
operator hand-deletes a directory the loader would never have used.

## Round ninety-seven — a first boot that failed silently, stamped seeded forever, 2026-08-28

### 410. A configured structure that could not be read left the workspace permanently empty

The deprecated `workspace_structure` JSON path logged its load failure at INFO —
"Warning: … Continuing without pre-configured structure" — and carried on. The
recommended `content_base_dir` path was already fatal for the same failure; only
this one swallowed it.

Carrying on is not harmless, and the reason is two correct decisions meeting:

- The seed-pending marker is armed **only** when a structure actually loaded.
  That is deliberate and well argued at its call site: arming it unconditionally
  would let a later deploy that adds a structure inject defaults into a workspace
  that has been live for weeks.
- A boot that finds neither marker takes the "established workspace predates the
  seed markers" back-fill branch and stamps it seeded.

So a first boot that swallowed the load error records neither marker; the next
boot back-fills; the workspace has no offices, permanently, recoverable only by
wiping the backend. The whole failure is announced by one info line containing
the word "Warning".

Now fatal, matching the other branch. A configured structure that cannot be read
is a configuration error, and refusing to boot is the only outcome an operator
can act on.

The resolution moved out of `run_server_with_base_path` into
`resolve_workspace_structure`, because the decision was untestable inside a
function that starts a server. Three cases: unparseable file refuses, missing
file refuses, and — the one that matters as much — **no structure configured
still boots**, since a guard that turns the ordinary case into an error is worse
than the bug.

### Recorded from the document-editing audit — the standouts

- **Office MDX saves are silent whole-document last-writer-wins.** `UpdateNode`
  carries no baseline revision or hash, so the server cannot reject a stale
  write: A opens the editor, B saves, A saves, and B's work is gone with a
  success toast. `BaseOffice` already documents the other half of this ("telling
  the user their view is now stale is recorded in ROBUSTNESS.md") — it is still
  only recorded.
- **`adoptDocument` treats a failed load as "does not exist"** and writes a fresh
  empty document over the stored one. `loadDocumentFromDB` catches every error
  and returns `null`, indistinguishable from absence — the same
  "genuinely-absent vs could-not-read" distinction that was fixed for message
  pages, unfixed here.
- **Every outbound Yjs update carries a pre-batch hash**, because the coalescer
  sends before rebuilding the merkle tree — so the receiver's post-apply
  comparison mismatches on every keystroke batch, and since both peers believe
  they are the creator (`creatorCid` is never threaded through), each mismatch
  broadcasts the entire document. The integrity check can never signal real
  divergence because it fires always.
- **Yjs updates that arrive while the document tab is closed are dropped** — the
  only handler reads the payload to flip an activity dot and discards the bytes.
- **The ACK retry never retransmits**: the retry branch increments a counter and
  sends nothing.

### Recorded from the discovery audit — the standouts

- **Decline never leaves the browser.** `declineRequest` only removes the local
  entry; the backend's `PeerRegisterRespond { accept: false }` has **zero**
  callers anywhere in the UI. The sender resends every five minutes forever, so a
  declined request resurrects indefinitely while the sender sits on a disabled
  "Awaiting Response…" with no cancel.
- **`listAllPeers` still does `Object.values` on a wire Map**, so the Direct
  Messages peer list is permanently empty and its 30s poll *clobbers* peers
  learned from registration events. The normalizer for exactly this exists, is
  used by the function directly below it, and was never propagated here.
- **Receiving a request marks the sender as a registered peer before any accept**,
  so `MessageSender` skips the registration it needs and the message fails.
- **"Add a peer to start messaging" asks for a CID no screen ever displays** —
  the discovery modal deliberately shows only a short handle, and there is no
  copy-CID affordance anywhere.

## Round ninety-eight — two closed loops in the path to a first conversation, 2026-08-28

### 411. The Direct Messages peer list was permanently empty, and its poll erased what it did learn

`listAllPeers` read `peer_information` with `Object.values`. It is a Rust
`HashMap`, which `serde_wasm_bindgen` sends as a JS **Map** — so
`Object.values(...)` yields `[]`: no error, no warning, an empty result that
reads as "there are no peers".

Worse than empty. The service polls every 30 seconds and `updatePeerMaps` clears
the peer map before repopulating it from that answer — so peers learned from
registration events were *discarded* on a timer, taking their preserved usernames
with them. Two surfaces therefore disagreed about whether anyone existed: the
discovery modal, whose fetcher had been fixed, found people; the sidebar, fed by
this, showed zero.

`wire-map.ts` documents this exact class in its header, and `parsePeersResponse`
fifty lines below in the same file already handles the Map shape. The normalizer
existed, the neighbouring function used it, and it was never applied here. Swept
the rest of `src/lib` for the same shape: no others.

### 412. Declining a peer request never left the browser

`declineRequest` removed the local entry and nothing else. The backend has a
purpose-built API for this — `PeerRegisterRespond { accept: false }` — with
**zero callers anywhere in the UI**.

Two permanent consequences, and they compound:

- The sender's outgoing store resends every five minutes forever, and the
  recipient's dedup only checks *live* pending requests — so the declined request
  reappeared on their screen every five minutes, indefinitely.
- The sender sat on a disabled "Awaiting Response…" with no cancel, never
  learning they had been declined.

Neither side had a way forward except the recipient giving in.

The send is best-effort by design and the local removal happens either way: a
decline the user performed and then watched reappear — for a *second* reason —
would be worse than one the sender has not heard about yet, and the sender's own
five-minute resend is the backstop.

Both fixes carry a wiring assertion alongside the unit test, because in both
cases the unit under test was already correct and would have stayed correct with
the caller unchanged. That is exactly the state each of these was found in.

### Still open on this path, from the discovery audit

- **"Request Sent" is claimed before any response**, and a real
  `PeerRegisterFailure` is routed only to `debugLog` — compiled out in
  production. The pending state later vanishes with no explanation.
- **Receiving a request marks the sender as a registered peer before any
  accept**, so `MessageSender` skips the registration it needs and the message
  fails — while the backend defines registered as mutual.
- **"Add a peer to start messaging" asks for a CID no screen displays.** The
  discovery modal deliberately shows a short handle instead, and there is no
  copy-CID affordance anywhere; the error copy's other suggestion is the
  directory, which is the known simulated loop.
- **Accepting can be "confirmed" by an unrelated peer's connect notification**,
  because the matcher accepts any notification naming our own CID.
- The "Invite User" buttons in the empty search state have no `onClick`.

## Round ninety-nine — a request that was pending, treated as a relationship, 2026-08-28

### 413. Receiving a request marked the sender as a registered peer, before any accept

`handlePeerRegisterNotification` fires when someone sends *us* a registration
request. It set `isRegistered = true` and added them to `registeredPeers`.

The backend defines registered as **mutual** — `list_registered` answers from
`GetMutuals` — so this claimed a relationship that would not exist until the user
accepted. And it was not cosmetic: `MessageSender` checks `isPeerRegistered` and
**skips registration** when it is true, so a first message to someone whose
request was merely pending went out against a peer with no mutual registration
and no ratchet, and failed. The sender also appeared among the user's connections
before they had agreed to anything.

`allPeers` still learns the name — the request should render with a username
rather than a bare CID — and the pending-request flow still runs. Auto-connect's
mutual detection keys off `hasOutgoingRegistration`, not this map, so it is
unaffected. The test covers the resend case explicitly: a peer who *is* already
mutually registered must not be downgraded by their sender's five-minute repeat.

### 414. A refused registration reached only `debugLog`

The discovery modal toasted "Request Sent" immediately after `sendMessage`, and
its websocket listener handled only the Success variants. `PeerRegisterFailure`
went to `debugLog` — compiled out in production — so the user was told the
request was sent, the pending state later vanished with no explanation, and they
waited on a request the other side never saw.

Now surfaced, correlated by `request_id`, because the failure payload carries no
`peer_cid` — the name comes from what was recorded at send time, and it is
recorded *before* the send since a failure can arrive before the await resolves.

### Recorded from the routing-core audit — the standout

**Four response handlers match variants the protocol cannot produce.**
`CreateWorkspace`, `AddMember`, `UpdateMemberRole`, `RemoveMember` and
`WorkspaceError` are handled as "runtime-only" response variants; they exist only
as *requests*, and the server never constructs any of them. Everything emitted
inside those branches is therefore dead — including `members:reload`, which means
**no event-driven refresh of the members list happens after an admin adds or
removes a member or changes a role**.

And the reason the listener-emitter CI guard passes over it: the guard is a text
scan, so an emit inside an unreachable branch counts as an emitter. That is the
guard's structural blind spot, and this is a live instance of it. Also recorded:
`SUCCESS_RESPONSES.CreateWorkspace` waits for a variant that does not exist while
the same repo maps it correctly in `service.ts` (two disagreeing type-maps for
one protocol), and `useMessageEventSetup`'s unmount calls
`cleanupAllListeners()`, which wipes the singleton's **entire** registry rather
than its own.

### Recorded from the settings audit — the standout

**The login flow discards every security setting the user chose.**
`SecuritySettings` writes to hook state; `handleLogin` calls
`websocketService.connect(requestId, username, password, undefined)`, and the
auth layer fills the gap with `getDefaultSecuritySettings()`. The chosen values
are then persisted as defaults too, so reconnects use them as well. A user who
selects a higher security level, a post-quantum KEM and a signature algorithm
connects with `Standard/BestEffort/AES_GCM_256` and is told nothing. The
registration flow reads these correctly from a query cache; the login flow reads
neither the cache nor its own state.

Also recorded: the group settings panel's rename and its **entire roles editor**
write throwaway page state behind a "Saving…" button — every role created and
every permission edit evaporates on navigation and never reaches another member;
five of six Appearance controls are inert, and the one that works (font size) is
never re-applied at startup; and the P2P chat settings panel has three switches
with `defaultChecked` and no handler, an encryption-level select with no
`onChange`, and a "Storage Used" figure computed as a constant 15% of quota.

## Round one hundred — the login flow threw away every security choice, 2026-08-28

### 415. Signing in discarded the user's cryptographic settings, and then persisted the defaults

The Security Settings dialog on the sign-in screen writes its values into the
login hook's state. `handleLogin` then called:

```
await websocketService.connect(requestId, username, password, undefined);
```

and `auth-operations` fills that fourth argument with
`getDefaultSecuritySettings()`. So every choice — security level, secrecy mode,
encryption algorithm, post-quantum KEM, signature algorithm — reached the hook's
state and died there. A user who deliberately raised their security connected
with `Standard / BestEffort / AES_GCM_256`, and nothing said otherwise.

The second half is worse than the first: `handleAuthSuccess` was then given
`securitySettings: getDefaultSecuritySettings()`, so the **stored** session
carried defaults too. Every reconnect used them. The choice was not merely
ignored at connect time — it was overwritten, for the life of the account's
stored session.

The registration flow has always mapped these correctly through
`mapSecuritySettings`. The login flow read neither the shared cache registration
uses nor its own state. Both call sites now use the same mapping.

On this product, of all products, a security control that silently does nothing
is the one worst kind of dead control. It is the third the campaign has found on
this screen — after "Remember Credentials", which was also read into state and
never consulted.

The test's fixture is cast rather than typed, deliberately: what is under test is
whether each field is *routed* to the right place in the wire shape, not whether
particular strings are valid enum members. Real alternates would tie it to an
algorithm list generated from Rust; the defaults would let a mapper that ignored
its input pass. It also asserts the mapping produces something different from
the defaults, so "returns defaults regardless" cannot pass.

### Recorded, not fixed — the members list never refreshes

From the routing audit: `members:reload` is emitted **only** inside handlers for
response variants the protocol cannot produce — `AddMember`, `RemoveMember`,
`UpdateMemberRole` and `CreateWorkspace` exist as *requests* only, and the server
never constructs them as responses. So after an admin adds a member, removes one,
or changes a role, no event-driven refresh happens at all.

Two things make this worth its own entry. The dead branches also emit
`member:added` and `member:removed`, whose listeners are equally unreachable. And
the listener-emitter CI guard passes over all of it because it is a text scan:
an emit inside an unreachable branch counts as an emitter. The guard's own
recorded-debt maps are honest about what it tracks; this is a blind spot none of
them covers, and it is worth teaching the guard about reachability or, failing
that, recording the limit in the guard itself.

### Round 101 — the members list refreshes, and the dead handlers are gone

The finding above is now fixed, and the fix is smaller than the finding was.

`members:reload` is emitted from one place: a helper in `member-operations.ts`
that wraps the three member writes and fires **after** `awaitWriteResponse`
resolves. Emitting before confirmation would ask the server for a list that does
not yet reflect the write, and would ask it even when the write was refused; a
test covers exactly that case.

Removing the unreachable handlers had a useful side effect. `handleTypeGapVariants`
claimed to handle `CreateWorkspace`, `AddMember`, `UpdateMemberRole`,
`RemoveMember` and `WorkspaceError` as *responses*. Deleting it broke an existing
test — because `SUCCESS_RESPONSES.CreateWorkspace` listed `'CreateWorkspace'` as
the variant that confirms a create, while the server answers with `'Workspace'`.
Two maps disagreed about the same protocol fact, and the dead handler had been
absorbing the disagreement. Every workspace creation had been waiting out the
full 15s write timeout and reporting failure on a write that succeeded.

The two listeners the dead branches fed — `member:added` and `member:removed` —
are deleted rather than re-emitted. Neither did anything a live `members:reload`
does not already do, and the CI guard flagged them the moment their fake emitters
were gone. That is the guard working as intended once the reachability blind spot
is removed by hand: it cannot see that a branch is unreachable, but it sees
immediately when the branch is deleted.

### Round 102 — the composer that let you send the same message twice

Two independent audits, one on degraded-network UX and one on forms and input
handling, arrived at the same finding first. That is worth noting on its own:
the defect is visible from more than one angle, which is usually a sign it is
being hit in practice.

`sendMessage` does a lot before the message exists anywhere the user can see it:
peer registration is a 10s budget, CheckState another 3s, and on a follower tab
the leader ACK is up to 30s. The composer cleared only after the whole promise
resolved, and the Send button was disabled by nothing but an empty field. So for
that entire window the text sat in the field with Send lit, and the natural
reaction — *did that go? press Enter again* — minted a second `messageId` and
delivered a genuine duplicate.

The group composer has had `if (!inputValue.trim() || sending) return;` since it
was written. The P2P one never got it: the familiar shape where a rule exists in
one place and not the other.

The fix is an in-flight guard plus a change of when the composer clears. Not on
resolve, and not up front either — on a new `onOptimisticAppend` callback fired
the moment the pending bubble is in the transcript. That is the exact instant the
message becomes visible *and* retryable, so clearing then loses nothing; the
failures that happen before it (registration refused, no session CID) leave no
bubble at all, and clearing up front would lose the message outright. Three
negative controls pin all three positions: drop the guard and the duplicate comes
back; clear on resolve and the composer stays full through the send window; clear
up front and the text is lost on a pre-append failure.

The guard also releases at append time rather than at resolution, so the composer
is usable again immediately — a guard held for the full round trip would have
traded a duplicate-send bug for a 30-second lockout.

While in there: the send options type was declared twice, inline, in both the
manager and the sender. It is now one exported `SendMessageOptions`.

### Round 103 — group chat had no authorization at all

From the backend audit, and confirmed by reading every handler: `SendGroupMessage`,
`GetGroupMessages`, `GetThreadMessages`, `EditGroupMessage` and
`DeleteGroupMessage` took `group_id` straight from the request and used it. No
membership check, no existence check. Any authenticated account could read a
channel's entire history, post into it, and — because nothing tied a `group_id`
to a node — store messages under a channel that belonged to no node at all,
including channels whose node had since been deleted. Every posted message was
then `broadcast` to *every* connected session, membership irrelevant.

This is the same class as the `GetMember` / `ListMembers` hole fixed earlier: the
rule existed elsewhere in the tree and chat never adopted it. `update_node` has
checked `check_entity_permission` against its target node for some time.

The gate is now one function, `authorize_group_access`, used by both the request
handlers and the broadcast filter so the two cannot drift. It resolves the node
owning the channel and asks for `ViewContent` on it — the same permission that
governs reading that node's content. Denials are a single constant string,
identical whether the channel is unknown or merely forbidden, so the handler
cannot be used as an oracle for which rooms exist. A test asserts that the two
responses are byte-identical.

Broadcasts now carry an audience. `BroadcastAudience::Group(id)` is filtered in
the per-connection forwarding loop, which is the only place in the kernel that
knows which user a socket belongs to — so it is the only place the check can be
made at all.

**What this does not fix, stated plainly.** `is_member_of_domain` recurses to the
parent, and every account is added to the workspace domain when it connects. The
seeded offices are created with an empty `members` list and depend on exactly
that inheritance. So a gate demanding direct node membership would have taken
chat away from every user in every seeded office, and the gate as written stops
accounts outside the workspace and channels belonging to no node — it does *not*
make one room's chat private from another room's occupants. Room-level privacy
is a membership-model change, not a check, and it is not one to make silently.
A test pins the current inheritance behaviour with a comment saying exactly
that, so nobody reads the other six tests as proof that rooms are private.

### Round 104 — two recovery screens with no way to recover

Both from the degraded-network audit, and the same shape: a state the user
reaches by bad luck, with no exit but a reload or a navigation.

**The connection retry modal disabled the only button that could help.**
`Retry Now` was gated on `attempt >= maxRetries`. With the default budget of ten
and a 2s doubling backoff capped at 300s, those attempts span about eighteen
minutes — so a laptop asleep past that woke into a modal announcing "Failed to
reconnect after 10 attempts", with Cancel as the only enabled control, on a
connection that by then was very likely fine. `maxRetries` bounds the machine's
patience. It was never meant to bound the person's.

Enabling the button was not enough on its own, and the negative control proved
it: with the button enabled but still wired to `retry`, all three tests passed.
`retry` keeps incrementing `attempt` and refuses only once it *passes*
`maxRetries` — so it works exactly once more and is then dead again. The test
now presses twice, which is what discriminates a real fix from a button that
merely looks enabled. Past the budget the press starts a fresh series, which
also lets the automatic countdown pick back up.

**The file manager's error screen had no controls at all.** An icon, a heading,
and the raw error string. The hook has always exposed `refresh` — it was already
threaded into the handlers — but the screen had no route to it and never offered
it. One timed-out tree fetch on a flaky link (a 30s budget) painted a permanent
dead end for a transient blip.

The pattern worth naming: both screens are *about* failure, which is exactly why
nobody looked at them twice. A screen whose whole job is to appear when
something went wrong is the last place a missing exit gets noticed, because
seeing it at all already feels like the bug.

### Round 105 — Enter meant "commit" in five places and "confirm this character" in one

While an IME candidate window is open, Enter confirms the composition. It is not
a commit. The chat composer knew this — it carried the `isComposing` check and a
comment explaining it — and nowhere else did. The rename input, the path bar, the
document-title modal and the hex field each handled Enter themselves and each
went without, so a user typing Japanese, Chinese or Korean saved a half-composed
filename, navigated to a half-composed path, or created a document titled with
whatever they had typed so far.

The rule now lives in one module, `isEnterCommit`, and `shouldSendOnKey` is
defined in terms of it. The shift clause stays with the composer, deliberately:
a multi-line composer treats Shift+Enter as a newline, and a single-line rename
field has no newline to insert.

What matters more than the four call sites is the scan that came with them. A
new `key === 'Enter'` now either routes through the shared rule or names itself
in an exemption list with the reason it cannot be composing — and a second test
fails any exemption whose file no longer handles Enter, so the list cannot decay
into a place where things go to be forgotten. Both halves have negative controls.

This is the fourth or fifth time the campaign has found the same shape: a
correct fix, applied once, in the place where the bug was first noticed. Grepping
for the mechanism rather than the symptom is what finds the rest — and a scan is
what keeps them found.

Also fixed here, from the same audit: `handleCreate` in the live-document modal
had no in-flight guard. The Create button was disabled while creating, but the
Enter path bypassed the button entirely, so two Enters during a slow create made
two documents.

### Round 106 — the agent-down banner was permanently wrong in every tab but one

From the PWA audit, and the worst finding of the three rounds: the health probe
asked `websocketService.isConnected()`, which answers "does THIS tab own a WASM
client". There is one WebSocket per browser — the leader owns the client, every
follower proxies through it with `client = null` by design. So in the app's own
documented multi-tab mode, every tab but one polled every ten seconds and
published *the local agent is unreachable*, for ever, while everything worked.
The user saw a red banner saying "Check that it is running" about an agent that
was running, and the banner's measured height pushed the whole layout down to
make room for it.

`core.ts` already draws exactly this distinction. `canSendRequests` exists
because of it, and its comment describes the identical bug in
`fetchActiveSessions` — a follower gate that "refuses forever", producing a
landing page with no sessions. The rule was written down, in the file, next to
the function. This caller was never brought along. That is now four rounds in a
row where the finding was a correct fix that had been applied in one place.

Two more from the same seam:

The first probe fires immediately, and `startHealthChecks` was called *before*
`await connectionManager.initialize()` — so on every boot it sampled the service
before it could possibly be up and published unhealthy, painting the banner
until the next poll ten seconds later. It now starts in a `finally` after
initialization: after, so the answer means something; in `finally`, because an
initialization that fails is precisely when the banner needs to be right.

And the banner tagged its alarming state with the reassuring state's name:
`offline ? 'offline-banner' : 'reconnected-banner'`, where `agentDown` implies
the device *is* online. Anything asserting on those ids read the two as each
other. Three states, three names.

The unit test that covers the agent-down banner could not have caught any of
this: it mocks the emitter, so it tests what the banner does with a health
verdict, never how the verdict is reached. A test can be entirely correct about
its half and blind to the half that is wrong.

### Round 107 — a settings page where five of six controls did nothing

From the visual-polish audit, and the finding that most damages the product's
credibility: Appearance had six controls. Compact Mode and Animations toggled
root classes — `.compact-mode`, `.reduce-motion` — that no stylesheet defined.
Show Avatars, Group Messages and Sidebar Width were persisted to localStorage
and read by nothing anywhere in the tree. Font Size worked, but only from inside
the tab's own effect, so it took hold while Settings was open and was never
re-applied at boot: a user's 18px choice reverted on every reload until they
went back into Settings.

A settings page where flipping a switch changes nothing is worse than a shorter
one, because it teaches the user not to trust the controls that do work.

Four now work, each with exactly one consumer path. Font Size and the rest are
applied from `lib/appearance-settings.ts`, called by `main.tsx` before render —
that boot call is the entire reason Font Size appeared to forget itself. Sidebar
Width publishes `--appearance-sidebar-width`, which the sidebar provider reads
with the built-in width as its fallback, so that file does not need to know the
preference exists. Show Avatars sets `data-avatars` on the root and the primitive
carries `data-avatar`, so one CSS rule is the whole feature and no component can
forget to opt in. Animations gets the same clamp as `prefers-reduced-motion` —
deliberately a copy of those rules rather than a shared selector list, because
the OS preference must keep working if the class is never set, and a user who
turns animations back on must not thereby override their own OS setting.

Two are deleted. Compact Mode had no spacing system to drive, and Group Messages
switched off a grouping behaviour the app does not implement. Leaving them as
switches that move and change nothing was not an option, and inventing two
features to justify two switches was not the ask.

The scan that came with it took a correction. The first version required every
preference to have a reader elsewhere in the tree, and `fontSize` failed it —
because the reader is the layout engine, not our code. A scan whose premise is
slightly wrong reports a real fix as a defect, which is how scans get relaxed
into uselessness. It now separates preferences with a code reader from those the
browser applies directly, and names the reason for each of the latter; a
completeness test fails if a new field appears in the interface without being
classified either way.

### Round 108 — a Return button that returned nowhere, and a conversation that showed nothing

Two more from the visual audit, both the shape this campaign keeps finding.

The ongoing-call bar sent 1:1 callers to `/messages?peer=<cid>`. The Messages
page reads `?channel=`, and nothing anywhere reads `peer`. So during a call,
leaving the conversation and pressing **Return** landed on "No conversation
selected": the call stage never came back, and the bar kept floating over the
empty state offering the same dead button. Wired from one end — the button
navigated, the page never listened — and nothing fails or warns, so the only way
to find it is to be in a call and press it.

The guard that came with the fix is worth more than the fix. It reads every
`/<route>?<param>=` literal in the tree and requires the destination page to
actually `get()` that param. One route in the table so far; adding another is a
line.

And an empty P2P conversation rendered nothing at all — the loading hints, then
`messages.map` over an empty array. The first conversation a new user opens is
the product's core flow, and it looked like a screen that had failed to load.
The group chat view has had "No messages yet" since it was written. The two
surfaces just diverged, which is the same divergence the audit found in bubble
colours, date separators, composer type and pagination affordance: two chat
grammars in one product, visible to anyone who uses both in a session.

The empty state is suppressed while the first page is still arriving — saying
"no messages yet" about messages that are on their way is its own small lie, and
a test pins it.

### Round 109 — whoever found the port first owned the workspace

From the deployment audit, and the finding most likely to hurt a real operator.

The root workspace is seeded at boot with no owner. On connect, any
authenticated account is added to it, and if it was the first, it was promoted
to Admin — unconditionally. Registration has no invite gate, and `docs/INSTALL.md`
tells anyone hosting for remote users to set `WORKSPACE_BIND_ADDR=0.0.0.0:12349`
and open that port on their firewall. Put those together: on a fresh public
deployment, whoever found the port and registered before the operator became the
administrator of the workspace, and everyone afterwards joined a workspace they
did not control.

The production docs never mentioned it. `README.md` documented the behaviour for
the dev stack; a grep of `INSTALL.md`, `UPGRADING.md` and
`PRODUCTION_DEPLOYMENT.md` for it returned nothing. The operator had no way to
know the clock was running.

The behaviour survives, because a local dev stack genuinely depends on it —
without it every account stays a Member with no editing rights, and typing the
master password to get them is pure friction on a stack nobody can reach. But it
has to be asked for by name now: `WORKSPACE_ALLOW_FIRST_CONNECT_ADMIN`, `1` in
`docker-compose.yml` with the reason, explicitly `0` in
`docker-compose.production.yml`, and off in the binary when nothing says
otherwise. A workspace with the flag off waits for someone to present the master
password through the initialization flow — the documented, already-implemented
path that until now granted nothing the first account did not already have.

Two details the tests pin. Unset means off, because the safe value should be the
one you get by not thinking about it. And a value that means nothing —
`WORKSPACE_ALLOW_FIRST_CONNECT_ADMIN=maybe` — is an error naming the variable
and echoing what was set, not a silent false: `yes`, `on` and `TRUE ` are all
things an operator would write believing they had switched it on, and reading
them as "off" would leave a dev stack with no administrator and nothing to
explain why. A separate test pins the kernel's own default and that it survives
a clone, because the resolver could be perfect and still leave the hole open if
a connection task worked from a clone that had lost the setting.

Recorded, not fixed, from the same audit: there is no version compatibility
check anywhere between the local agent and the central server. The Citadel
handshake carries a semver and only warns on mismatch — with a `TODO: prevent
logins if semvers out of sync` sitting next to a recorded wire-breaking bump
whose own note says cross-version traffic must not interoperate. The workspace
protocol itself is unversioned bare JSON. Every user pulls their own agent image
on their own cadence while the server upgrades centrally, so agent-versus-server
is the unguarded seam, and the failure mode is decrypt garbage rather than a
clean "please update".

### Round 110 — a Reload button that did nothing, then hard-reloaded you next time

From the PWA audit. Two windows, both showing the infinite-duration "Update
available" toast. Window A accepts; `skipWaiting` activates the new worker for
every client, so `registration.waiting` becomes null everywhere. Window B
correctly gets an "Updated in another window" toast — but its *original* toast
is still on screen, and its Reload button is now inert: messaging SKIP_WAITING
to nothing is a silent no-op in workbox, `controlling` never fires again, and
the toast simply dismisses with the page unchanged. The user pressed Reload and
nothing happened.

The dangerous half is what it leaves behind. `weInitiatedUpdate` was set on
click and never cleared, so on the *next* deploy — if another window accepted
first — this window's `onNeedReload` saw the stale flag and hard-reloaded
mid-session without asking, dropping the WebSocket and P2P state that
prompt-mode exists to protect. A dead button that arms an unconsented reload
later.

The fix reuses `applyWaitingUpdate`, which already existed for the crashed-render
recovery path and, unlike the library call, reports whether a worker actually
took control. If it did, `onNeedReload` reloads us and there is nothing to do.
If it did not, the flag is cleared and the window reloads itself — the user
pressed a button and is owed an outcome, and when the new version is already
active elsewhere a plain reload is exactly what picks it up.

Both halves have controls: leave the flag set and the next-deploy test fails;
drop the self-reload and the press goes back to doing nothing.

Also from the same audit: the re-offer raised a fresh infinite-duration toast on
every return to the tab, with no id, so tabbing in and out accumulated a stack of
identical prompts. Both offers now share one toast id, which is what makes a
re-offer replace rather than pile up. The toast wrapper gained `id` for it —
the first thing it has ever needed beyond title/description/action, and worth it
because "raise this again, don't duplicate it" is the general shape of a
re-offer.

### Round 111 — every group operation was leader-tab-only, and accepting an invite corrupted membership in silence

From the multi-tab audit. `websocketService.getClient()` returns the WASM client,
and a follower tab owns none — one WebSocket per browser, the leader holds it,
followers proxy. All six group wire operations went through a `requireClient()`
that threw "WebSocket client not initialized", so in every tab but one, creating
a group, inviting, leaving, kicking, refreshing the list and answering an
invitation all failed.

The invitation case is the one that did damage. `applyGroupInvite` adds the group
locally and then calls `sendGroupRespond`; in a follower that threw into a catch
whose only action is a `debugLog`, which is nothing in production. The user saw
the group in their sidebar and could be messaged over P2P, while the server never
recorded their membership: the creator's roster stayed empty, group calls stayed
disabled because a group's callable roster *is* its members, and the first
outbound send failed on a membership error. No signal anywhere. And group
invitations are CID-routed to the tab owning that session, which is frequently
not the leader — so this is not a rare path.

Deleting a group was worse in a different way. `const client = getClient(); if
(client) { ...send... }` — in a follower the send was skipped **without error**
and the user was navigated away as though it had worked. The group still existed,
for everybody.

Two more from the same family, both fixed here. Peer-registration persistence
called `getClient()`, and on null **resolved successfully** after logging that it
was skipping the write — so an incoming contact request that landed in a follower
was never written to LocalDB and vanished on reload; nothing failed, the request
simply ceased to exist. And `loadUserRegistration`'s fallback threw there, whose
catch raises a HIGH-priority "User Profile Error" system notification: an
alarming, permanent-looking failure produced entirely by asking the wrong
question.

`isWebSocketConnected` on the connection IORouter is deleted rather than fixed.
It forwarded `isConnected()` and had no callers at all — a trap rather than a
bug, waiting for the next person to gate a send on it exactly as four call sites
already had.

**Four times now.** `fetchActiveSessions` returned `[]` without sending, so a
second tab showed no sessions. The health probe pinned a red "Can't reach the
Citadel agent" banner in every follower. The group operations above. The
peer-registration writes. Each was found separately, months apart, and each fix
stopped at the file it was found in — while `core.ts` carried a comment
explaining the whole class the entire time.

So the guard matters more than any of the fixes: a file that reaches for the raw
client either names itself in a leader-only list with the reason its path runs
only there, or it is wrong. A second test fails any exemption whose file no
longer touches the client, and a third flags any file that both consults
`isConnected()` and sends requests. That third one found the dead predicate.

### Round 112 — "Login successful" over messaging that never started

From the error-surfacing audit, and its top finding. `wasmConnectionManager.start`
opens the ILM messenger handle. The comment directly above one of its call sites
states the stakes in capitals: without it, ACKs are never sent for inbound
messages, so outbound messages block waiting for ACKs that will never come.
Messaging is the product.

All three call sites — login, orphan claim, and the shared session-startup
sequence — caught its failure into a `debugLog`, one of them into a bare
`catch (_) { }` with the comment "WASM start best-effort". `debugLog` is stripped
from production builds, so a failure produced no toast, no notification, no
console line and no record of any kind. The login path then announced **"Login
successful — connected to workspace successfully"** and handed the user a
workspace whose messaging was dead. The first thing they would learn was the
silence where a reply should have been.

The old catch's excuse was "P2P may still work without ILM". It might. But the
person who should learn that their messages are not going anywhere is the user,
and they should learn it when it happens.

One helper now owns the decision, with its I/O injected so it is testable without
standing up the WASM client or the notification service. Startup still continues
on failure — that part was a reasonable call — but it returns whether messaging
came up, and the login toast consults it instead of asserting success. A failure
raises a HIGH system notification rather than a toast, deliberately: this is a
standing condition, not an event, and a toast that has already faded cannot
answer "why has nobody replied to me?" ten minutes later.

The controls are the two ways this fix could have been fake. Swallow the failure
into a `return true` and four tests fail. Keep reporting but replace the reason
with "Something went wrong. Please try again." and two fail — because a generic
apology in place of the precise error is the same defect one layer up, and it is
the second-most-common finding in that audit.

### Round 113 — opening a group chat was an infinite loop, and P2P badges never appeared

Two findings from the notifications audit, both about unread counts, both worse
than they look.

**The loop.** `markAsRead` used `prev.map(...)`, which always allocates. The
group store's only no-op guard is identity — `if (next === groups) return` — so
every call, including one that changed nothing, notified every subscriber and
fired an IndexedDB write. The group page calls it from an effect whose deps
include `getGroup`, whose identity derives from `groups`. New array, new
`getGroup`, effect re-runs, call again. Opening any group chat was a perpetual
render-and-write loop, ending in a hot tab or in React's "Maximum update depth
exceeded" depending on scheduling.

Returning `prev` unchanged is therefore load-bearing, not a micro-optimisation,
and the updater is extracted so the test exercises the real one — a restated copy
would keep passing after the hook stopped using it. The test asserts identity
rather than deep equality, because a fresh array with identical contents restarts
the loop exactly as surely as a different one. It also asserts the store's half:
`updateGroups(prev => prev)` must notify nobody and write nothing.

**The badges.** Two unread counters exist: the persisted one on the page
metadata, and the in-memory one on the conversation. Every badge in the app reads
the in-memory one — `use-conversation-peers`, `P2PPeerList`, `MembersSection` —
and *nothing incremented it*. The only writers were resets and decrements. So a
message arriving in a conversation the user did not have open produced no badge
at all, until the next reload copied the persisted count in from storage. The
group store increments live; the P2P side is the half that was never wired.

The predicate is deliberately identical to the persisted side — not the user's
own message, and delivered rather than pending — because two counters that
disagree would change the badge across a reload, which is a subtler and more
confusing bug than the one being fixed. Both controls check that: remove the
increment and two tests fail; count everything and the other two do.

Recorded, not fixed, from the same audit: group messages produce no notification
of any kind (`addMessageNotification` has two callers, one of them dev-only), so
a user in another window learns of group traffic only by looking at the sidebar;
group read receipts render sent/partial/all-read from a `read_by` field nothing
in the tree ever writes; and opening the bell in one session calls the
service-wide `markAllAsRead`, clearing every other session's badges — including
from the logged-out landing page, where the panel shows nothing at all.

### Round 114 — a second call left the first one's camera on, and glare orphaned the loser

Two findings from the calls audit, both at the seam between well-tested layers
rather than inside one.

**Starting a call while already in one was unguarded on the 1:1 path.** The group
entry path has refused a second call since it was written; the chat header gates
its buttons only on whether the peer is connected, so from any *other*
conversation during an active call both call buttons were live. Pressing one
re-entered `CallSession.start` with the `starting` promise already settled — that
guard covers same-session races, not a re-entry after a completed start — which
overwrote `localStream` and `pump` **without stopping either**. The first stream
was orphaned with the camera light on until a page reload, two pumps fed one
encoder, and the original peer never received a CallEnd: they were evicted only
by their own 20-second silence timeout, believing the other side had vanished.

One module now owns "am I busy?", shared by both paths, including the rule that a
*failed* call is not busy — it is over in every way except its error panel still
owing the user a reason, and blocking on it would strand them. The guard reads
the manager's own state rather than the React copy, because the whole failure is
a second start racing the first.

The divergence test earned its place twice. Its first version listed five
statuses and omitted `ringing-in`, and the control that reintroduced the
divergence for exactly that status passed against it. A completeness gap in a
test whose entire job is to catch divergence *is* the divergence.

**Glare orphaned the loser.** When both sides dial each other, the manager ends
its own call and then adopts the incoming one, synchronously. Tearing down on the
first left `managerRef` null while the reducer went on to `ringing-in`: the loser
saw an incoming card whose Accept and Decline both read `managerRef.current` and
silently no-opped, the ring tone played its full 45 seconds because sound keys
off React state rather than the manager, and then the orphan's own deadline fired
`end('unanswered')` — sending CallEnd to the glare *winner* and killing the
surviving call too. Teardown is now deferred by a microtask and re-checked
against the manager's live state, so an adopted call keeps its runtime.

The manager-level glare test passes and always did: it uses a mock
`onStateChanged`, so the provider interaction it broke on was never exercised.
That is the third time this campaign has found a bug living exactly where two
tested layers meet.

Recorded, not fixed: nothing anywhere listens for `track.onended` or
`devicechange`, so a mic or camera unplugged mid-call is invisible — the button
still shows unmuted, peers still see an unmuted tile, heartbeats keep flowing,
and the only recovery is Leave and re-dial with nothing saying so. An incoming
call to a session displayed in a follower tab rings audibly with no card and no
way to answer, because `CallSoundEffects` has no leader gate while `RingingCall`
does. The speaking indicator is inert: `speaking-changed` is in the event union
and handled by the reducer, and nothing dispatches it. And call duration restarts
from 00:00 whenever the stage remounts, because it anchors to effect-run time
rather than to anything in the call state.

### Round 115 — one function taught seven surfaces that a failure means "you have nothing"

From the stale-list audit, which set out to catalogue a class and found instead
that most of it came from a single place.

`fetchActiveSessions` returned `[]` on every failure — a WebSocket init timeout,
a tab that could not send, a GetSessions response that never came, any throw at
all — and `getActiveSessions` then **cached** that empty list as a valid answer.
So one timeout produced "you have no sessions" for the whole cache window,
without re-asking, across the seven surfaces that consult it: the workspace
loader, the orphan-sessions navbar, the account dialog, the login handler twice,
auth-operations, and reconnect. Every downstream `catch` for it was close to dead
code, because the promise never rejected.

The worst consequence was not cosmetic. The workspace loader concluded there were
no sessions, its loading deadline redirected to `/connect`, and on the way it
called `clearSelectedUser()` — **a failed read destroying the tab's session
selection**. The user then re-authenticated a session that was still alive, which
is exactly the SessionAlreadyActive churn the backend notes warn about.

`getActiveSessionsResult` now reports whether the question was actually answered,
`getActiveSessions` keeps the lenient contract its eight callers were written
against, and a failure is never cached. The two surfaces that must not confuse
the two use the result form: the loader concludes nothing when `ok` is false, and
the navbar keeps its last known-good list rather than asserting emptiness — CIDs
are permanent, so stale is strictly better than empty there.

The clear-the-selection decision is now returned rather than performed.
`pickSessionToClaim` says *whether* the stored selection is stale; only the
caller knows whether the list it compared against was a real answer. A test pins
that an empty list never produces `staleSelection`, because that combination is
precisely what a failed query used to produce.

Three side-effects worth recording. Splitting three files under the line cap
produced two genuinely better modules — a pure `withWorkspaceNames` and a
`useWorkspaceDataTimeout` hook — which is the cap doing its job rather than
getting in the way. And the storage-key guard fired on `session_last_accessed_`,
claiming it was read but never written: a false positive caused by my inlining
the key expression, since the guard matches on the literal text. But it was
pointing at something real — four sites built that key by hand, two stringifying
the CID and two interpolating it. There is one module for it now.

### Round 116 — no chat file transfer could move a byte, in three different ways

The file-transfer audit found a feature severed at three separate joints, with
the code around each break meticulously repaired. The dominant pattern in this
campaign, at its most complete.

**Accept and decline sent `cid: 0`**, with the comment "Not used for
message-based". The internal service looks the connection up by exactly that
field — `server_connection_map.get_mut(&cid)` — and nothing is filed under 0, so
every response came back "Connection not found". The send is fire-and-forget, so
nothing checked; and the failure notification carries `cid: 0`, which CID routing
cannot deliver to any tab. The recipient's bubble sat at "Downloading… 0%" and
the sender's at "Waiting for acceptance…" for ever. An earlier fix on this exact
line — translating the announcement UUID to the protocol's `object_id` —
unblocked the request only for it to die one hop later.

**The default "Recommended" async mode sent `cid: null`** for a non-nullable
`u64`. The WASM client deserializes strictly before sending, so the request never
left the browser: every send in that mode landed in its caller's catch, with
nothing on the wire to debug from either side.

**The max-file-size setting was written scoped and read bare.** Settings are
stored under `"{ownCid}:{peerCid}"` so two accounts in one browser do not share a
peer's limits — but both the send-time and the accept-time checks read
`getSettings(peerCid)`, a key nothing writes in a live session. So both always
saw the 100 MiB default and the user's slider limited nothing. The scoping fix
and the accept-limit fix were each correct, and each worked only in isolation.

The scan is the part that generalises: every settings read outside the module
that owns the scoping must go through `scopedSettingsKey`. The existing
accept-size test could not have caught this — it mocks `state.getSettings`
wholesale, so the mock stood exactly where the defect was. That is the second
time in this campaign a test has been perfectly correct about its half and blind
to the half that was wrong.

Recorded, not fixed, and larger than what is fixed here: **no completion or
progress signal is wired on either plane.** The protocol router's `onProgress`,
`onComplete` and `onStatusChange` have zero subscribers, and on the message plane
the `FileTransferComplete` / `Response` / `Chunk` / `Progress` constructors have
no production callers at all — so `handleTransferResponse`, `handleTransferChunk`
and `reassembleFile` are subscribed-but-never-emitted, and the sidebar's Files
list, which filters on `state === 'complete'`, is permanently empty. Even with
the three fixes above, a transfer cannot reach a terminal state from the network.
Also unfixed: native-picker sends never announce, so the recipient has no bubble
to accept from; RE-VFS downloads report failure after succeeding because the
ticks carry the TCP-connection UUID rather than the request id the browser waits
on; peer-scoped RE-VFS uploads toast "Uploaded" on the dispatch ack while the
peer never stores the bytes; a copied node shares the original's backend byte
key, so deleting either destroys both; and concurrent tree operations are
lost-update races, with bulk delete resurrecting nodes whose bytes are already
gone.

### Round 117 — a stranger's broadcast could resolve your save, over your own text

From the workspace-tree audit. `awaitWriteResponse` matches responses by TYPE,
because the workspace protocol carries no request id — a limitation the module
records honestly in its own header, with the reasoning that the UI issues these
one at a time from a modal, so two same-kind writes are never in flight together.

That was true when it was written. Round 85 then gave the server live tree
updates by broadcasting `Node`, `NodeDeleted` and `NodeMoved` to *every other
member*. From that moment the assumption was false, and nothing said so: the
second write in flight was no longer another dialog on this client, it was
everybody else's.

The harm is not a mismatched toast. Alice saves a document the server is about to
refuse; Bob renames any node in the same 15-second window; his broadcast `Node`
resolves Alice's pending write; the editor closes on "success" and the load
effect replaces her buffer with the stored copy. Her text is gone under a green
toast — precisely the data loss the write gate was built to end, reintroduced
from the other side by an unrelated feature.

The `matches` parameter existed for exactly this — its comment says "variants
that are ALSO broadcast" — and was passed only for group messages. It is now
passed for all four node writes, and a scan requires it for any write whose
success variant the server broadcasts. Creation matches on parent and name
rather than id, because the client does not know the id of a node it has not
created yet; that is narrower than "any `Node` at all", which is the point.

**Recorded, not fixed, and the most serious thing this campaign has found:
workspace documents do not render at all in the production build.**
`use-compiled-mdx` calls `@mdx-js/mdx`'s `evaluate()`, which executes the
compiled document through `new AsyncFunction`. The production CSP is
`script-src 'self' 'wasm-unsafe-eval'` with no `'unsafe-eval'`. Development adds
it for HMR — which is why every dev run, every tilt session and every Playwright
test renders documents perfectly. The throw was caught into a `debugLog`, so in
production every document showed its title chrome and a blank body,
indistinguishable from an empty document, with no error anywhere.

Fixed here: the failure is now shown rather than swallowed, so the condition is
visible instead of looking like an empty workspace. Not fixed: the rendering
itself. The obvious remedy is a trap — adding `'unsafe-eval'` would turn every
member-authored document into stored XSS executed in every viewer's browser,
gated only by `EditMdx`, with `NodeContentUpdated` pushing new code to open
viewers live. The real options are compiling to a sandboxed worker or iframe, or
rendering the view path with a non-executing markdown renderer and re-expressing
the four custom components (`Card`, `Alert`, `Badge`, `Table`) as directives.
Both are projects, not rounds, and the choice is a product decision about whether
documents may contain executable JSX at all.

### Round 118 — the completion plane, and why it was never going to work

Two agents implemented this; both were killed mid-test-rewrite by a session
limit, and the work was finished and independently re-verified by hand. Every
claim below was checked against the generated types or the Rust, not taken on
report.

**The root cause was sharper than the audit found.** The audit said the protocol
router's `onProgress` / `onComplete` / `onStatusChange` had zero subscribers.
True — but wiring them would not have helped, because `protocol-types.ts`
hand-wrote `ObjectTransferStatus` and every variant disagreed with the wire. The
generated type (ts-rs output from Rust, in `@avarok/citadel-protocol-types`) is:

```
"TransferBeginning" | { ReceptionBeginning: [string, VirtualObjectMetadata] }
| { TransferTick: [number, number, number] } | { ReceptionTick: [...] }
| "TransferComplete" | "ReceptionComplete" | { Fail: string }
```

The local copy gave every variant an `object_id` the real enum does not carry,
made the completes objects when they are bare strings, and gave the metadata a
`file_size`/`mime_type` that does not exist. `tsc` validated a parser that could
never match a single real notification. The types are now re-exported from the
generated package, so a Rust-side change breaks the build here instead of
silently breaking the parser — which is the only kind of fix that holds.

Because ticks carry no object id, a tick stream is correlated by its envelope
(`cid` / `peer_cid` / `request_id`), not by the payload. That required work on
the Rust side too: `PullObject` / `SendObject` carry no application request id,
so the kernel stamped ticks with the TCP-connection uuid. A new FIFO correlation
registry, keyed by direction and scope, restores the browser's id — FIFO because
it is the strongest join available, and with a TTL longer than the browser's
timeout so a pull whose remote errors (producing no handle at all) expires
rather than sitting at the head of the queue misattributing every later
transfer. The limitation is written down at the top of the module rather than
discovered later.

**Two more severed joints closed.** A decline never reached the sender at all —
the SDK gives a declined sender no notification, and `RespondFileTransfer`
travels only between a browser and its own internal service, so the sender's
bubble sat on "Waiting for acceptance" for ever. Accept and decline now also
send an in-band P2P signal. And a peer-targeted RE-VFS push arrived at the
receiving service as a transfer awaiting an explicit accept that no client ever
issued: a RE-VFS storage write is an internal mechanism, not a user-facing
offer. The receiving service now auto-accepts it, as the server kernel always
has, and the uploader waits for the Sender-side `TransferComplete` rather than
the dispatch ack.

**The copy fix is better than the one I sketched.** I had assumed a copied node
needed its own byte key. The backend cannot duplicate an object and the browser
does not hold the bytes, so that was never available; the honest answer is that
both nodes point at one blob and every delete site refcounts the key. Deleting
either copy now leaves the other intact, and the blob dies with its last
reference.

840 lines deleted against 529 added, most of it the message-plane chunk
machinery — `handleTransferChunk`, `streamFileToRecipient`, `reassembleFile` and
their constructors — which had no production callers and could not have had any:
its first chunk hit a `throwChunkNotSupported()`. It was a decoy, and decoys are
what make the next reader believe the feature exists.

Three negative controls run by hand after the fact, since the agents did not
survive to run their own: renaming the bare-string `ReceptionComplete` fails two
parser tests; removing the terminal-state guard in `applyTransferOutcome` fails
the double-report and declined-resurrection tests; making delete ignore the
refcount fails the copy test. Each failed for its stated reason.

Also fixed here: the new executor crate had no CI coverage, which the repo's own
`crate coverage` gate caught on the next preflight — a guard written in an
earlier round catching me.

### Round 119 — the login form's password was never read

From the auth audit, and the finding I most wanted to be wrong about.

`handleLogin` required a non-empty password, then looked up the active sessions,
matched on `session.username` **alone**, and redirected straight into the
session. The password was never checked against anything. `getActiveSessions` is
agent-wide, so the username did not even have to be one this browser had ever
signed in as: after "Exit to landing", which deliberately leaves the session
alive, anyone who knew a username was in.

The legitimate case it was short-circuiting is handled one step later and by the
right party. Connect goes to the server with the credentials; if a session is
already live the server answers `SessionAlreadyActive`, and the existing handler
turns that into the same redirect. So the shortcut was redundant as well as
wrong, and removing it puts the decision where it can actually be made.

**What that does not fix, stated plainly.** The internal service's own reuse
branch does not verify the password either: `connect.rs` finds a session by
username, asks the SDK whether it is active, re-points that session's
`associated_localhost_connection` to the caller and returns the real CID — all
before any credential is examined. So a `Connect { username: victim, password:
anything }` on that localhost socket still redirects the victim's message stream
to the caller.

I went looking for the obvious fix and it is not available.
`ClientNetworkAccount::validate_credentials` — documented as "used for the login
process" — succeeds only for `ArgonContainerType::Server`. The internal service
is a *client*; its container is the client variant, so calling it there returns
`AccountNotPasswordProtected` for every account. Wiring it in would not have
hardened the check, it would have broken login outright while looking like a
security fix. Recording that is the point: the next person to reach for it
should not lose a day to it.

The deeper reason is that this is not one handler's bug. `Connect`, `GetSessions`
and `ClaimSession` share one missing authorization boundary — every session on
that agent is available to every client of that socket, by design, under the
documented "one local agent per user" model. Hardening `Connect` while the other
two stay open would be theatre. The honest options are an origin/token check on
the localhost socket, or a per-session claim secret; both are decisions about the
trust model, not patches.

Also fixed here: the workspace pre-shared key was stored regardless of the
"Remember credentials" switch, on the line directly below an account password
that was correctly gated — and which carries a comment recording that *it* used
to be stored unconditionally. The PSK is the worse of the two to leave behind,
because it admits any account to that server rather than just this one, and both
are written by plain `JSON.stringify` with no encryption. A user who declined to
be remembered now has neither on disk, and still keeps the session itself:
CIDs are permanent and the navbar claims by CID, not by password.

### Round 120 — the password now reaches the party that can check it

Correction to the previous round, from the person who knows the architecture:
the SDK is what authenticates. The agent hands the username and password to the
SDK, the SDK carries them to the server, and the server decides. That reframes
the finding usefully — the bug is not "the agent fails to verify", it is that
`Connect` has a branch where **the password never reaches the SDK at all**.

When a session for the username is already live, the handler answered
`SessionAlreadyActive` and re-pointed that session's message stream to the
caller, before touching the credentials. So any client of the agent's socket
could name a live username and take over its stream.

Two apparent fixes are traps, and both are recorded because each would cost a
day. `ClientNetworkAccount::validate_credentials` is documented as "used for the
login process" and succeeds only for `ArgonContainerType::Server`; the agent is
a *client*, so wiring it in would reject every correct password while looking
like a security check. And re-running the SDK connect to authenticate is exactly
the second-connect-against-a-live-session that resets the ratchet — which is why
this branch exists in the first place.

So the session records what opened it. `generate_connect_credentials` produces
the client-side hash the protocol itself sends, derived from the CNAC's own
Argon settings and therefore deterministic for a given password and account.
Recorded at connect time, re-derived on a reuse request: proof of knowledge,
with no server round trip and no ratchet.

Stated precisely, because it is not authentication: it proves the caller knows
the same password the *server* already accepted for this session. An absent or
underivable fingerprint is a refusal, never a pass — including for transient
(passwordless) accounts, where a fingerprint would be a constant every caller
can produce. Refusal returns "Invalid username or password" with no CID, the
same answer a wrong password on a fresh account gets, so the handler is not an
oracle for who is signed in on this agent.

**A known gap, recorded rather than implied.** The transient branch has no unit
test — a transient CNAC cannot be built cheaply in one — and I verified that
removing that guard compiles with no test failing. The two guards that *are*
covered were confirmed by control: treating an absent recording as a pass fails
three tests, and dropping the length check before the constant-time loop fails
the prefix test.

Also, and from the same correction: **the login form no longer asks for a server
address.** It never needed one. `connect` takes no address, because the SDK
pinned the account's server in its CNAC at registration and dials that. The
field was collected, stored as session metadata, and used to reach nothing — so
a user who typed the wrong address still signed in to wherever their account
lives, and a user whose account was elsewhere waited out a 30s timeout with the
box on screen implying it was the thing to correct. Registration still asks,
because that is the one moment the address is genuinely needed.

### Round 121 — four accessibility defects whose fix was already in the tree

The accessibility audit's most useful output was not a finding but a lens: its
four worst items were all cases where the correct fix exists in this repo,
commented, a few files away. That is the same shape as rounds 106, 111 and 114.

**The ongoing-call bar announced the clock every second.** `role="status"
aria-live="polite"` on the container, with the call duration rendered inside it
and re-rendered at 1 Hz. A polite live region re-announces on every content
change, so a screen-reader user working anywhere else in the app heard "In call
with Ana 00:41, 00:42, 00:43" for the entire call — the rest of the product
unusable exactly while the mic was hot. `CallControls` hides its copy of the
same value with a comment saying why. The fix stopped there.

**The mute button announced the opposite of the truth.** `aria-pressed={audio}`
paired with `aria-label={audio ? 'Mute microphone' : 'Unmute microphone'}`.
Announced: "Mute microphone, toggle button, pressed" — which a listener reads as
*muted*, while the microphone was live. On a privacy control that is the worst
direction to be wrong in. The name now names the thing and `aria-pressed` names
the state, which is what it is for; the visible tooltip still says what a click
will do, because a sighted user reads it beside the icon rather than as a
sentence. The same pattern was on both password toggles and is fixed there too.

An existing test asserted the defect — *"flips the microphone label with its
state, so it says what it will do"* — and would have moved with the bug forever.
Rewritten to pin the real contract: same name, different state.

**`LoadingModal` was a full-screen scrim with no dialog semantics**, sitting in
the middle of the login and registration flows: no role, no focus move, no trap,
no restore, so focus stayed on the submit control underneath and Tab walked
invisible background controls. `use-dialog-overlay` was written for exactly this
("Visually a modal; to assistive technology, nothing at all") and applied to six
overlays; this one was skipped. Hoisted above the early return with `enabled`,
because hooks cannot be called conditionally.

**Every session's disconnect button was named identically.** Three workspaces
open meant three identical destructive buttons; the same fix, with the same
reasoning, is already at the tab bar's close button and the member list's row
actions.

Two scans came with it, and the first one took three attempts to become real —
which is the part worth recording. Version one flagged `ConnectionRetryModal`,
whose countdown sits *after* the status region closes: a correct file reported as
a defect, and a scan that cries wolf gets relaxed until it catches nothing.
Version two excluded it correctly but then **passed its own negative control**,
because it accepted any `aria-hidden` anywhere in the region — including the
decorative icon's. Only version three, which requires the marker on the element
directly wrapping the value, fails when the fix is removed. A guard whose control
cannot fail it is not a guard, and I nearly shipped one.

### Round 122 — a device unplugged mid-call was invisible to everyone

Nothing in the tree listened for `track.onended`. When a microphone or camera
was unplugged or revoked, the track ended, the capture pump's reader loop
returned silently, and every part of the product went on insisting the call was
healthy: the mic button still read unmuted, peers still saw an unmuted tile, and
heartbeats kept flowing on their own timer so the liveness watchdog never
noticed. A silently dead call that looked fine, with no recovery but Leave and
re-dial and nothing saying so.

The listener belongs on the session, not the pump. The pump's reader returning
`done` is the *symptom*, and it is indistinguishable from ordinary cancellation
— and the canvas fallback path used by Firefox and Safari has no reader at all,
so a track-level listener covers both pump paths for free.

**The `closed` guard is the load-bearing part**, and it is first for a reason.
Per spec `track.stop()` does not fire `ended`, so ordinary teardown should be
silent — but fakes do fire it, and every termination path runs through `close()`,
which sets `closed` before stopping the stream. Without the guard, every normal
hangup would tell the user their microphone had been disconnected. A negative
control pins exactly that.

Two adjacent bugs, found while wiring it and fixed with it. `toggleMic` flipped
`enabled` on whatever audio tracks existed — including ended ones, which stay in
the stream's list — so after a mic was unplugged, pressing unmute was a no-op
that still announced "unmuted" to every peer and left the button reading
unmuted. And `toggleCamera`'s count-based guard, added in an earlier round
precisely to stop a camera toggle from lying, was defeated by the same thing: one
dead track still counts as one track. Both now filter on `readyState === 'live'`.

Peers are told through `setSelfMedia`, which is the existing "mic/camera
toggled" signal — nothing new on the wire, the fix is only that someone now
*sends* it when the device dies. The self-media update is computed from the
manager's own state at call time rather than a captured snapshot, because a hub
unplugged at once ends both tracks and two updates from one stale snapshot would
each undo the other.

Recorded, not fixed: re-acquiring a device mid-call. The pump reads its tracks
once with no per-track restart, `start` is guarded against a second capture, and
a replacement track needs a distinct swap path plus encoder-timestamp continuity
across the gap. That is its own piece of work, and the honest failure message
above — reconnect and rejoin — is complete without it.

### Round 123 — group chat never interrupted anyone, and a deleted page pretended to be a tutorial

**Group messages produced no notification of any kind.**
`addMessageNotification` had exactly two callers — the P2P manager and a
dev-only simulator — so the whole group pipeline moved the sidebar badge and
stopped. No bell entry, no OS notification, no sound, and the backgrounded-tab
path unreachable for groups entirely. Someone working in another window learned
of group traffic only by happening to look at the sidebar.

The three suppression rules are borrowed from the P2P path rather than invented,
because two notification surfaces that disagree about when to interrupt are
worse than one that is slightly wrong: never for your own message (the server
echoes the sender's own message back as the send confirmation, so without this
every message you sent would ring your own bell), never for the group you are
reading, and keyed by group-sender-content so a redelivery cannot stack a second
identical entry.

One rule is deliberately NOT copied. The P2P path suppresses via an "active
conversation" field set only by an adapter nothing in the app constructs — so
its suppression has never worked, and copying the mechanism would have copied
the bug. This reads the URL instead.

**A URL naming a node that is not there rendered the editor demo as the
document.** The fallback chain ended in `getDefaultMDXShowcase()` with no
not-found state before it, so a stale bookmark, a shared link to something since
deleted, or a node deleted by someone else while you were reading it all
silently became "MDX Editor Showcase", titled "Welcome to Your Workspace". If
the reader had been editing, Save then failed for ever against a node that no
longer existed, with retry advice for an unrecoverable state.

The new state is gated on the nodes having loaded: during the initial fetch
`state.nodes` is empty for every id, and announcing "no longer here" about a page
that is simply still arriving would be its own lie.

### Round 124 — documents render again, and are verified before they run

An explicit product decision: render MDX client-side, grant `'unsafe-eval'`, and
compensate with document integrity. Recorded here with the trade-off stated
rather than implied, because the CSP is now weaker for the whole origin.

**What changed.** `script-src` gains `'unsafe-eval'` in production, so
`@mdx-js/mdx` can compile and execute a document — the thing that had been
silently failing for every document in every shipped build. `frame-ancestors`
goes from `'self'` to `'none'` and `X-Frame-Options` from `SAMEORIGIN` to
`DENY`: this is a PWA holding a live authenticated session, and framing it is
only ever clickjacking.

**The compensating control.** The server computes a hex SHA-256 of `mdx_content`
on every write and stores it on the node; the client re-hashes before executing
and refuses on a mismatch. One canonical rule on each side, and both pin the
*published* SHA-256 of `"abc"` rather than comparing each implementation to
itself — two implementations of one hash can only be kept honest against an
external constant. Neither side normalises Unicode, and both say so: normalising
on one side only would make correct documents refuse to render, which is a worse
failure than the one being prevented.

**What it covers, exactly.** Tampering between the server and the renderer — a
corrupted IndexedDB cache, a store-layer bug, another tab writing over the
content, a truncated response. It does **not** stop an attacker who already has
script execution on the page, who can patch the verifier or change content and
hash together; and it says nothing about whether the document was hostile when
it was written, since a member with edit rights gets a perfectly matching hash.
That residual risk is inherent in executing member-authored documents at all,
and is what the sandboxed alternatives would have addressed.

Three states, not two: `verified`, `mismatch`, and `unhashed`. Documents written
before the field existed have no hash, and treating that as a mismatch would
take every old document offline to prevent a tamper that has not happened. The
editor buffer is likewise exempt — while editing, the content is the user's own
typing and matches no stored hash.

The module tests were not enough, and the control proved it: disabling the check
in the hook left all eight of them passing, because they test the hash and not
whether anyone consults it. The wiring test that followed fails correctly.

### Round 125 — a demotion that never reached the person demoted

`UpdateMemberRole` and `UpdateMemberPermissions` answered only the requester —
no broadcast, unlike every node write. And the client's permission-cache clear
is gated on the payload naming the *current* user, which it never is for the
admin doing the demoting. So the entire client-side role-changed pathway could
only ever fire for an admin editing themselves.

A demoted admin therefore kept every gated control until a full reload, with the
server refusing each use as a raw error toast; a promoted member saw nothing new
at all. The 60-second permission TTL does not rescue either, because
`usePermission` refetches only when the domain is absent from the cache.

Both writes now broadcast. `UpdateMemberPermissions` answers with `Success`,
which carries no user id, so its broadcast is the role-shaped notification
carrying the member's current role — what the client needs from it is "your
permissions moved, drop your cache", and the role is how it identifies whose.
A refused change is not broadcast, and a test pins that: announcing a demotion
that did not happen would clear the member's cache and make them re-fetch —
harmless once, and a lie the rest of the time.

**This change re-created the round-117 defect, and I nearly shipped it.** Making
`MemberRoleUpdated` a broadcast means `awaitWriteResponse` — which matches by
type, because the protocol carries no request id — could have another admin's
role change resolve this one. The matcher was added with the broadcast, in the
same commit.

The guard from round 117 did **not** catch this, and that is the part worth
recording. Its `BROADCAST_WRITES` set is hand-maintained: adding a
`kernel.broadcast` on the Rust side does not add a line to a TypeScript test, so
the guard protects what it is told about and nothing else. The set now carries a
comment saying so at the point where someone would add the next one. A guard
that cannot see the change that creates the defect it guards against is worth
having and worth being honest about.

The last-admin guard also earned its place here, by refusing the first version
of this test: demoting the only administrator is correctly impossible, so the
test promotes instead — which covers the half of the finding where a member
handed Admin sees nothing new.

### Round 126 — opening one bell cleared every other session's badges

The notification panel is correctly CID-scoped — it renders only what belongs to
the session it is showing — but its two-second auto-read called the
service-wide `markAllAsRead`. So the OrphanSessionsNavbar's per-session unread
badges, which are the only signal that something happened in a workspace you are
not looking at, were zeroed by a bell opened somewhere else entirely.

Worst on the logged-out landing page, where `sessionCid` is null: the panel
renders "No notifications", and two seconds later every session's badge is gone.

`markAllAsReadForCid` filters with `notificationBelongsTo` — the same predicate
the panel renders with — so "what was shown" and "what was marked read" cannot
disagree. The service-wide sweep survives for the case that genuinely wants it,
with a comment saying it is almost never the right one.

Splitting the file back under the line cap produced three modules that are
better than the methods they replaced. `read-state.ts` turns three near-identical
loops into named predicates — `everything`, `belongingTo(cid)`,
`messagesFrom(sender)` — which is exactly the distinction the defect erased: a
per-session panel calling the everything-everywhere sweep, and the two
indistinguishable at the call site. `unread-counts.ts` gets to say why an
unscoped notification is counted against no session. And extracting the
peer-registration factory surfaced that it is the one notification whose payload
is behaviour rather than text, since its buttons hold callbacks that send on the
wire.

One behaviour was preserved rather than unified, deliberately: the by-sender
sweep never notified the per-notification handlers and the panel sweeps always
did. Unifying them would re-render every subscriber on every read receipt, so
the shared helper takes a flag and the comment says why.

### Round 127 — a whole capability built from both ends and never joined

`MoveNode` was typed in the protocol, permission-gated in the kernel, broadcast
to other members, mapped in `SUCCESS_RESPONSES`, and handled by the client's
node event setup. It had no client method and no UI. Reorganising a workspace
was simply impossible — the most complete instance yet of the shape this
campaign keeps finding, with both ends finished and nothing in between.

The entry point is a picker rather than drag-and-drop, deliberately. Dragging a
tree row onto another is the obvious gesture and it is unreachable by keyboard,
invisible to a screen reader and awkward on touch — and this is the *only* way
to reorganise a workspace, so it has to work for everyone. A picker is also the
only shape that can say why there is nowhere to move something, which a drop
target cannot.

`moveTargets` computes the legal destinations client-side so the picker never
offers one the server will refuse: not itself, not any of its own descendants,
not a parent whose `allowed_child_types` refuses it.

**Two of the three negative controls did not discriminate, and finding that out
was most of the round.**

The descendant rule looked tested and was not: the fixture had no descendant
that would *also* pass the schema rule, so allowing descendants changed nothing
and the control passed. The tree now contains a nested node that accepts the
moving node's own type, so only the descendant check can exclude it.

The cycle guard was worse. Removing it does not throw — it hangs, and a
synchronous loop never yields, so vitest's own timeout cannot fire and the whole
suite stops instead of failing. A wall-clock assertion is equally useless,
because the line never runs. This is the same lesson as round 75's
`tokio::time::timeout` over a synchronous walk, met from the other side.

The answer was to stop relying on a guard whose absence is untestable: the walk
is now bounded by construction, at one iteration per node. With the bound in
place, removing the visited set still terminates and the test still passes —
which is the point. Remove *both* and the suite hangs, which is at least loud.

### Round 128 — the permission editor showed constants and saved them over reality

`PermissionManager` called `getUserPermissions` and discarded the result — even
on success. Nothing ever wrote a response into state, so the matrix always
rendered `getRoleDefaultPermissions()` constants. An admin opening it to review
someone's access was reading fiction.

Saving was worse than showing. The diff was taken against those same client-side
defaults, so pressing Save pushed the defaults-plus-edits over whatever the
server was actually enforcing — a silent reset for anyone with fewer permissions
than the default, a silent escalation for anyone with more. And the save loop
ran over every ROLE in the hierarchy and applied each row's diff to the one user
being edited, so an admin who changed nothing still sent writes.

Three states now, where there was one: loading, loaded, failed. Before this,
"not loaded yet", "failed to load" and "these are the permissions" were
indistinguishable — which is what let the defaults pass as fact for so long.
Save is disabled until the server has answered, and the notice above the matrix
says which of the three it is looking at rather than leaving the reader to
assume.

The diff is now against what the server returned, so an admin who changes
nothing sends nothing.

The answer is matched on **both** user and domain. One editor can be open while
another domain's response arrives, and the response is the only thing that says
which is which — a control confirms that dropping either check lets the wrong
answer populate the matrix.

### Round 129 — bulk delete resurrected what it deleted

Every RE-VFS tree mutation reads the tree, changes it in memory, and writes it
back, with a backend round trip in between. Nothing serialised them. Bulk delete
ran them under `Promise.all`, so every operation captured the same base tree and
the last write resurrected everything the others had removed — locally, as nodes
whose backend bytes were already gone, while the peer received each removal op
separately and dropped them all. Two trees, both wrong, neither aware.

The mechanism to fix it already existed one directory over. `p2p/peer-write-lock`
guards exactly this shape for the message store, and its header describes a
received message that disappeared the same way: delivered, acknowledged, cached,
then written over. It is `lib/serial-queue` now, keyed by an arbitrary string,
used by both — and every RE-VFS mutator is wrapped at the service, which is the
one choke point all sixteen pass through.

**One of the four controls did not discriminate, and chasing it was worth more
than the test.** "Does not cancel the operations queued behind a failure" passed
with the read-side `.catch` removed, and passed again with the write-side one
removed. Each is sufficient on its own for queue continuation; only removing
both fails it. The second catch is not redundant — it stops a rejected promise
sitting in the map with nobody awaiting it, which is an unhandled rejection —
but that is a different property, and the test was silently claiming to cover
something it does not. Both facts are now written where they belong: the
distinction at the code, the limit of the control in the test.

### Round 130 — two chat grammars in one product

From the visual audit, and the first round drawn from nothing but a UI/UX
finding: group chat and P2P chat had drifted into visibly different designs for
the same thing. Group showed date separators; P2P showed none, so a long DM was
an undifferentiated run of messages with no way to tell yesterday from last
month. And the two used different greys for a received bubble — `bg-muted`
against `bg-surface`, 17% versus 22% lightness in dark mode. Anyone who used a
room and a DM in one session saw two products.

Both now use one `DateSeparator` and one grouping rule — the helper was already
generic over `{ timestamp }` and only the group side had ever called it. The
separator names the date to a screen reader and hides the rules either side of
it, which the group view's inline markup did not.

The bubble colour resolves toward P2P's, not group's, because P2P's is the one
carrying a reason: its comment records a light-mode contrast failure at roughly
1.08:1 that produced the current token choice. When two implementations
disagree and only one of them knows why it is what it is, that is the one to
keep.

The tests pin the sharing rather than the appearance, because "looks the same"
is exactly the property that decays with nothing asserting it — and a screenshot
test would fail on every unrelated style change while missing the next
divergence.

Still divergent, recorded rather than swept in: the composer is an
auto-growing textarea in group chat and a single-line input in P2P, and
pagination is a visible "Load older messages" button in one and an invisible
scroll-to-top gesture in the other. Both are behaviour rather than styling, and
both deserve a decision about which is right rather than a coin toss.

### Round 131 — the User Directory was a demo façade

From the search audit, and the finding with the largest gap between what the UI
said and what happened: pressing "Send Request" in the User Directory called
`connectionService.sendRegistrationRequest`, which pushed the request into an
**in-memory array** and scheduled a demo simulation. Nothing touched the socket.
The user was shown "Request Sent — connection request sent to X". X never
received anything, ever. The simulation could not even fire its own fake
notification: it is guarded on `recipientId === 'current-user'`, which is never
true for a real person.

Three more findings turned out to be the same root cause. `canMessageUser`
consults a map written only by that simulation's accept path, so it can never
return true in production — which meant every presence dot was off, the Online
tab was permanently empty, and the "Send Message" branch was unreachable code.
That branch contains a carefully-fixed navigation whose own comment documents
two prior defects; it has never once executed. A previous fix had already
replaced `Math.random()` there with something that looked authoritative and was
constant `false`.

All of it now runs through the real stack: `sendPeerRegistration`, extracted
from the discovery modal's hook so there is one wire path rather than two, and
presence read from `peerRegistrationStore` — the store that actually knows.

A member is identified by username and registration needs a CID, so a member who
has never appeared in the peer list cannot be reached from here. That is now
said plainly rather than answered with a success toast.

Two dead ends removed and one label corrected. Both "Invite" buttons had no
`onClick` and sat in no form — one of them rendered directly under "No users
found", which is the exact moment someone needs it. Inviting a non-member is not
a capability this app has, and a button-shaped dead end at the point of need is
worse than its absence. And "Recent Users — people you've interacted with" was
the first five entries of the member record; nothing tracks interaction or
recency, and there is no last-seen data to sort by.

### Round 132 — the same authentication bypass, one layer further down

Round 119 removed a pre-emptive session claim from the login form: it matched
active sessions on username alone and redirected into one without checking the
password. Its replacement comment says the decision belongs where it can
actually be made — the server.

`websocketService.connect` did the same thing, and prevented exactly that. It
looked up the agent's sessions by username, and when the local store held no
matching CID it claimed the session and **returned without sending Connect**. So
the password reached nobody: not that function, not the agent, not the server,
which was never asked. Round 119 fixed the outer copy; this is the inner one,
found only because a fresh audit walked the path from the other end.

It also broke the login it silently completed. The claim carries its own request
id, so the caller waiting for a `ConnectSuccess` / `ConnectFailure` /
`SessionAlreadyActive` on *its* id waited out the full thirty seconds and told
the user "Connection timeout — check your network", for a login that had
succeeded.

The other branch was worse in a different way: when the session was *not*
orphaned it disconnected first — tearing down a live, working session on the
strength of a request that had proved nothing beyond knowing a username.

Both are gone. Connect always goes to the server with the credentials, and the
server's `SessionAlreadyActive` — which since round 120 verifies the password
against the fingerprint that opened the session — is what the caller claims
from.

### Round 133 — a member list that did not say whose it was

The workspace protocol carries no request id, and the `Members` response carried
no domain either — so a response could not be attributed to the request that
caused it. Four subscribers each accepted any member list that arrived and took
last-writer-wins: the sidebar, the admin members tab, the user-search corpus,
and the group-call roster.

A list fetched for one domain therefore rendered inside another. The admin tab
is the dangerous one: after any confirmed member write, `members:reload` re-lists
whatever node the URL names — so another domain's members could render in an
entity's admin tab, and the role changes and removals below would then name
*that* entity with users taken from somebody else's list.

The response says its domain now, echoed from the request and resolved exactly
as the lookup resolved it. The filter lives in one module, because four copies
of a filter is how three of them come to differ, and it accepts when either side
is unknown: a client against a server predating the field would otherwise empty
every member list in the app. A filter that silently discards everything is
worse than the ambiguity it replaces.

Splitting the admin tab back under the line cap fixed something else recorded in
the onboarding audit. Both of its writes reported "Failed to update member role"
and "Failed to remove member" while sending the server's actual refusal to
`debugLog` — a no-op outside dev. `awaitWriteResponse` produces precise
rejections ("Permission denied: EditTreeStructure required", "Cannot demote the
only administrator") and every one was being discarded for a sentence that says
only that something went wrong, so the user retries forever with nothing telling
them retrying cannot work.

Extracting the hook also surfaced that there are two different `UserRole` types
in this tree, structurally similar and not interchangeable. The hook uses the
tab's, and says so — a local re-declaration would have compiled until one of
them gained a field.

### Round 134 — five findings from the onboarding audit, and a guard that caught me twice

**A member's first create was told to try again, for ever.**
`EntityManagementModal` reported "Failed to create office. Please try again." and
sent the server's actual refusal to `debugLog`, a no-op outside dev. A member
whose first attempt is refused cannot distinguish "you do not have permission"
from a flaky network, so they retry, and retrying can never work. The delete path
was given this fix long ago; create and edit never were — the same shape as the
admin writes fixed in round 133, in a third place.

**The advice attached to it was stale in a way that leads somewhere worse.**
"Initialize the workspace to become an admin" was true before first-connect-admin
became opt-in; now initialization needs the operator's master password, so a
member following that advice reaches a modal they cannot complete. The branch is
also close to unreachable — `GetTreeSchema` returns the same global schema to
everyone with no actor check, and the default schema always permits an Office
under the workspace — so the real refusal comes from the server after submit,
which is now where it is reported.

**The first-run modal identified the workspace by internal id.**
`{workspaceId || workspaceName}` with a caller that always passes an id, so the
single most consequential dialog on a production deployment read "Workspace:
root" and never showed the human name.

**`state.workspaces` was fetched on every workspace load and read by nobody.** A
network round trip per load feeding dead state, and a field in the context type
that made the app look as though it tracked a workspace list. Removed rather than
left as a decoy.

**The agent hint's copy button produced something unrunnable** — `--bind …
--backend …` with no binary name, and nothing anywhere says what the executable
in the archive is called. A copy button that yields a shell error is worse than
none: it looks like the instruction, so the reader stops looking for the real one.

The listener-emitter guard earned its keep twice in one round. Removing the dead
`workspaces:listed` subscriber left an emitter talking to nobody, which it caught
immediately — so the emit is gone too, while the variant is still *handled*,
because returning false would make a caller awaiting confirmation wait out its
timeout. The guard checks both directions, and this is the first time the
unheard-emit half has fired.

### Round 135 — an identifier no screen shows, and names that could not be found

**The Messages empty state pointed at an internal identifier the app never
displays.** "Add a peer to start messaging", beside an input labelled "Enter
peer CID…", and a validation message advising the reader to "copy it from the
peer's account" — a place that does not exist. Nothing anywhere renders a full
CID; only a six-character short handle. So the primary affordance on the
messaging screen asked for a number the user had no way to obtain, under an
acronym they were never told, while the two paths that actually work — the
workspace directory and Discover Peers — were named nowhere near it.

Extracting the form to fit the line cap also surfaced that its failure message
discarded the real one: "Could not add that peer. Check the CID and try again."
where the underlying error had something specific to say. That is the fourth
place this round-133 shape has appeared.

**No matcher folded diacritics.** Every search in the app was
`toLowerCase().includes(...)`, so "jose" did not find "José" and "cafe" did not
find "café" — and the names most likely to carry a diacritic are exactly the
ones a colleague will type without it. Worse in combination: the sorting beside
these lists uses `localeCompare`, so a list could show two neighbours, one of
which the obvious query could not reach.

One folding rule now, used by the user search, the tree filter and the file
grid. It deliberately does not transliterate: "ß" does not become "ss" and "ø"
does not become "o", because those are language-specific and a matcher that is
right for German and wrong for Danish is worse than one that is predictable.

The control caught my own carelessness. My first attempt to remove the folding
did not match the source, so the "control" passed and would have let me claim a
verified test that had never been run against the defect. Removing it properly
fails two.

## Round 136 — the generic failure message, scanned instead of fixed a fifth time

"The catch shows a fixed sentence and sends the server's real reason to
debugLog" had been the finding four separate times: the node delete path, the
admin member writes, the entity create/edit modal, the add-peer form. Each was
fixed where it was found. A fifth point fix would have been the wrong move.

`src/__tests__/failures-say-what-failed.test.ts` scans every catch whose body
reports a failure to the user and asks whether it consults the error it caught.
It found **twenty** files.

Two things about the scan are worth recording, because both were wrong first:

**It passed its own negative control.** The first version asked only whether the
catch mentioned its error anywhere in the body — and reintroducing the defect in
`EntityManagementModal` left the test green, because every one of these defects
does `debugLog('X', 'failed:', error)` beside the fixed sentence. Logging the
reason and showing the user something else *is* the defect; a rule the logging
call satisfies could never have caught any of the four. Fixed by stripping
`debugLog`/`console.*` calls before testing for the reference, after which the
count went from 0 to 20.

**It over-reported.** The body was taken as "everything up to the next catch",
which reads far past the closing brace. `WorkspaceInitializationModal`'s catch
does nothing but log, and the *success* toast four lines below it was being
counted as that catch's failure report. Brace matching fixed it — and the
strengthened exemption test then showed four of the eleven recorded-debt entries
had never been offenders at all. An over-reporting scan is not the safe kind: it
fills the debt list with files that were never wrong.

Fixed: twelve files now report what the server said, via a shared
`describeFailure(error, fallback)` in `src/lib/failure-message.ts`. Seven remain
in `RECORDED_DEBT`, each with the judgement it needs — listed rather than
excused, so a *new* one cannot be added quietly.

The exemption test asserts each exempted file still has an offending catch, so
the list self-cleans. That is what caught the four false entries.

Also: `useWorkspaceSwitcher` crossed the 250-line cap, and the extraction found
untested logic — `pickCurrentWorkspace` decides that this tab's selection
outranks the connection's CID, which is what stops one tab's label changing when
another tab connects. Inline in the hook it was reachable only through a render
with a connection manager and an IndexedDB read behind it, and had no test.
Seven now, including that precedence rule (control: flipping the fallback order
fails two).

## Round 137 — an Owner was an administrator in two places and not in the third

A parallel audit for duplication found the "is this role privileged?" predicate
in seven places, and the copies already disagreed:

| copy | logic |
|---|---|
| TopBar | `'Admin'\|'admin'\|'Owner'\|'owner'` |
| AdminSettingsSection | `'Admin'\|'admin'` plus the object form — **no Owner** |
| WorkspaceSwitcherDropdown | the four literals, no object form |
| MembersSectionModals | lowercase first, then `owner\|admin` |
| permissions-service/cache | `'Admin'\|'Owner'`, exact case only |
| permissions-service | exact case only; `isOwner()` meant Owner-or-Admin |
| MembersTab | `'Admin'`, exact case only |

Three casing conventions, two answers to "does Owner count", and one copy that
understood the object role shape — and it was not the one gating the admin
section. The visible defect: an Owner sees the admin ring in TopBar and the
shield in the workspace switcher, then `AdminSettingsSection` returns null for
them. The same person is an administrator in two places and not in the third.

`lib/role-predicate.ts` is now the one place: `normalizeRole`, `isAdminRole`,
`isOwnerRole`, `isPrivilegedRole`. `permissionsService.isOwner()` answered
Owner-or-Admin under that name; it now answers Owner, and the gating question
has its own honest name, `isPrivileged()`.

The guard (`role-checks-use-the-predicate.test.ts`) found an eighth copy the
audit had missed — `MemberRow`'s last-admin demotion guard — and then its
exemption test rejected the one exemption I wrote: `role-badge.ts` names all
four roles but maps them through a lookup object rather than comparing them, so
exempting it would have shielded a future comparison in a file that had never
made one. Second time in two rounds that the exemption-honesty test caught a
wrong exemption; it is worth writing every time.

Control: reverting TopBar to its literal comparison fails the scan.

## Round 138 — the backend audit, and preflight's own blind half

A parallel audit of the Rust side (which had received far less scrutiny than
the frontend's 137 rounds) produced three fixes worth the name.

**Group edits and deletes bypassed the membership filter.**
`broadcast_to_group` exists because a message in a private room used to be
pushed to every connected session regardless of membership. Round 103 applied
it to `SendGroupMessage` — and to nothing else. `EditGroupMessage`, which
carries the full new content, and `DeleteGroupMessage` both kept the unscoped
`kernel.broadcast`. The correct fix applied in one place, for eleven rounds.
Impact is latent today (`is_member_of_domain` inherits `ViewContent` from the
workspace everyone joins) but it is real for an orphaned channel, and it becomes
a content leak the moment room-level privacy lands — which is the direction
round 103 was heading. `tests/group_notifications_are_scoped.rs` now pins all
three arms; control: reverting either fails it.

**A debug log line could kill the WebSocket read loop.**
`&text[..text.len().min(500)]` in the WASM client slices by byte. A frame
containing `ListRegisteredPeersResponse` whose byte 500 falls mid-codepoint
panics — a registered peer with an emoji or CJK username near that offset is
enough — and the panic lands in the read loop, so the user loses their
connection to their own agent. The correct helper already existed in the file
upload path. The test asserts its fixture actually cuts a codepoint, so it
cannot pass against the bug it names.

**`is_child_allowed` failed open.** It returned true for a parent type no rule
mentions, while its sibling `get_allowed_children` returned nothing for the same
parent — the UI offered no child there and the validator accepted any. An
unruled custom node type was a hole in an otherwise enforced schema. They now
agree, on the closed answer; an empty schema still constrains nothing, which is
what an unconfigured workspace boots as.

**And preflight ran no cargo gates at all.** Its own header names workspace-wide
clippy as one of three gates found red only by running it by hand — and then
omitted it, invisibly: the derived list matches `node scripts/*.mjs` only, so
the cargo steps never entered the list and so never reached the skip report
either. A Rust-only edit passed preflight untouched and failed CI half an hour
later. Both gates were red when this was written: an unformatted file in
intersession-layer-messaging, an orphaned doc comment for a function that does
not exist, four redundant field patterns, and a dead test helper. 24 → 28.

The new gates run with `SKIP_WASM_BUILD=1`, and that is not a convenience.
`citadel-workspace-internal-service` has a build script that runs wasm-pack and
copies the result over the tracked artifacts in `citadel-workspace-client-ts/
pkg/` and `citadel-workspaces/public/wasm/` — so a plain `cargo clippy` silently
replaces the committed WASM the UI imports with a different build (2.4 MB → 3.4
MB, and a `.d.ts` differing by twenty lines). A gate that mutates the tree it is
checking is not one anybody can run before every commit.

**Still open from the audit**, needing a decision rather than a patch: the ILM
ownership gate is cid-blind (an exempt `LocalDBGetKV` naming another account's
cid skips the check); `UpdateNode` broadcasts and returns Ok before the disk
persist, so a disk failure tells the author it saved, shows peers the new text,
and reverts on restart; `remove_workspace` can leave a dangling index entry if
the password-key delete fails; `MoveNode`'s descendant depth recomputation can
wrap on inconsistent stored depths.

## Round 139 — the outside-in audit: deploy, first run, upgrade

**Every launch between a deploy and the user clicking Reload ran old glue
against the new binary.** This is the third wrong answer this repo has shipped
to the same question, and the guard test was enforcing it.

wasm-bindgen glue and its `.wasm` binary are coupled through export tables and
closure-shim indices. The glue lives in hashed chunks the precache versions
atomically; the binary sat at a stable URL, excluded from the precache and
runtime-cached instead. So the binary's strategy alone decided whether the pair
matched, and every strategy answers from a generation independent of the
precache:

| strategy | what it paired |
|---|---|
| `CacheFirst` | old binary with new glue, for up to thirty days |
| `StaleWhileRevalidate` | the very reload applying an update got new glue and the previous binary |
| `NetworkFirst` | with `registerType: 'prompt'` the OLD worker keeps serving OLD glue while the network hands it the NEW binary — every launch until the user accepts, and the mismatched binary poisons the cache for offline starts too |

Each fix corrected the previous direction and opened another. The binary is now
precached *with* the glue: both halves are revisioned by the same worker, so an
old worker serves an old pair and a new worker serves a new pair, and there is
no window in which a page holds one of each. The 3.3 MB install cost buys an
atomic update. `assets/*.wasm` — a hashed duplicate the bundler emits that
nothing ever requests — stays excluded.

`wasm-is-never-served-stale.test.ts` **required** `NetworkFirst`, which is to
say it enforced the current bug. Rewritten to pin the property rather than the
mechanism; controls: dropping `wasm` from `globPatterns` fails it, and
reinstating any runtime `.wasm` rule fails it.

**A user's chosen security settings silently reverted to defaults after five
minutes.** `SecuritySettings` wrote them with `setQueryData(['securitySettings'])`
and `useJoinRegistration` read them back with `getQueryData(...) || defaults`.
Nothing anywhere observes that key — no `useQuery` for it exists — and React
Query garbage-collects an unobserved entry after its default five-minute
`gcTime`. So a user who raised their security level and then spent five minutes
on the profile step (a password manager, a Back and a Next) created their
account with the defaults, permanently, with nothing said. `Landing` had already
lifted the server address out of the cache for exactly this reason, and the fix
was not carried across.

The values now travel by prop. The guard
(`query-cache-reads-have-observers.test.ts`) generalises it: any `getQueryData`
on a key no `useQuery` observes is a read of a value that expires. It found a
second instance immediately — three `getQueryData(['serverConnectForm'])` calls
in `SecuritySettings`, left over from debugging this exact bug, all inside
`debugLog` and therefore invisible in production anyway.

And the three copies of the default security posture — the form's initial state,
the registration fallback, the login hook — are now one constant. Disagreement
between them is a security question, not a tidiness one.

**A failed workspace setup after registration was reported nowhere.** Both
`postAuthSetup` awaits in `WorkspaceLoader` failed into `runAsyncSetup`, whose
catch does nothing but `debugLog` — compiled out of production. The new user saw
"Connected!", then a spinner, then "Workspace data is taking longer than
expected", with no cause and no action, while the login path has toasted the
same failure since it was written. Both now report. The extraction that made
room for it (158 of 268 lines) is `use-auto-claim-session.ts`.

**Refuted, and worth recording as such:** the deployment configs are the most
hardened files in the repo — nginx cache headers correct per asset class,
injection-guarded envsubst, fail-closed `/ws` proxy with rebinding and origin
defenses, no hardcoded localhost in the socket path. The server versions its
persisted state and *refuses to boot* on a newer-than-expected schema. The
IndexedDB migration framework is real, with drift detection. Published images
build glue and binary from one wasm-pack run, so the skew above is purely a
client-cache phenomenon.

**Open from this audit**, needing a decision: IndexedDB cannot downgrade, so the
documented "rollback is the same operation as upgrading" is false for installed
clients the day `DB_VERSION` moves past 1 — `storage-utils.ts` catches
`VersionError` with advice that is wrong in a real rollback and offers no reset.
The internal service's on-disk `agent_data` has no version handling at all,
unlike the server's; an SDK serialization change turns a routine `docker compose
pull` into an agent that cannot read its own accounts, with key loss the only
recovery. A registration that times out at 30s while the server completes tells
the user to "choose a different username" when the right action is Login.

## Round 140 — the green dot had three sources and none of them worked

**Presence was replaced with a better-looking lie.** The dot beside a user's
name began as `Math.random() > 0.5` — a coin flip that contradicted the same
user's status elsewhere on every render. An earlier round replaced it with
`connectionService.canMessageUser(member.id)`, which reads a map keyed on the
literal `'current-user'` whose only writer, `acceptConnectionRequest`, has no
caller outside the demo simulation. So it answered **false for everyone,
forever**, while naming a service that sounds authoritative.

That is the harder version of this defect: a random lie is visibly wrong, a
constant one just looks like nobody is ever online. The real source — the peer
registry's `online_status`, polled and cached — is the same set the sidebar's
peer list has always read. `lib/presence.ts` now consults it, and
`useMemberEventSetup` no longer records every arriving member as offline
regardless of the registry.

The same store was in front of `messagingService.sendMessage` as a gate that
could never pass. It has no callers today, which is the only reason that has
not surfaced; a guard that cannot pass is a landmine for whoever wires it up
next. It now asks the real connection state.
`demo-state-is-not-consulted.test.ts` keeps the demo store out of production
code, and found the leftover "Kathy McCooper" fixture on its first run.

**Two screens told users to do developer things, or nothing at all.**
`PeerDiscoveryModal`'s empty state read "Open another tab and connect as a
different user to test P2P" — instructions for a developer, shipped as an end
user's only guidance. `UserDirectory` rendered *literally nothing* when a tab
had no members, and its Online tab is commonly empty, so the most likely first
visit to that page was a blank panel. Both now use a shared `EmptyState`, and
the directory distinguishes "everyone is offline" from "there is nobody here
yet" — telling a lone user that everyone is offline is a lie about people who do
not exist, and points them at waiting instead of inviting.

**The registration modal greeted a brand-new account with "Welcome back!"**,
said "Verifying your credentials" while creating them, and showed a "Loading
Workspace" step set and replaced in the same tick — a progress bar for work that
had already finished. `Join` is the config's only user, so the copy is now
written for the flow it actually serves.

Controls: reverting the empty state fails three of the four directory tests;
reintroducing `canMessageUser` anywhere outside its module fails the demo guard.

## Round 141 — the exemptions, the ratchet, and the gates wired to nothing

A parallel audit for checks that cannot fail found four worth acting on.

**An exemption's reason is a claim, and a claim survives the removal of the
thing it claims.** `follower-tabs-can-still-act.test.ts` exempted three files
with "guarded by `instanceManager.isLeader`; followers proxy", and verified only
that each still called `getClient`. Delete the `isLeader` branch from
`workspace-operations.ts` and the suite stayed green — the fourth recurrence of
the exact bug it documents. Worse, one of the three claims was simply false:
`session-management.ts` has no `isLeader` anywhere; it returns silently when
there is no client, which is a follower **no-op**, not a proxy.

Exemptions now carry a machine-checkable `requires` pattern alongside the prose,
and the reasons were corrected to what the code actually does. Control: removing
the guard fails the suite by name.

**An exemption without a bound is an allowance.** `check-file-length`'s SKIP
list held seven bare filenames; `components/ui/sidebar.tsx` is at 764 lines,
three times the cap, and nothing would have objected at 1500 — the exempt files
being precisely the ones most likely to keep growing, since nobody is asked to
split them. Each entry now records the length it was exempted at: a file may
shrink, not grow. It also self-cleans — an entry whose file drops under the cap,
or no longer exists, fails the check rather than sitting there shielding a
future violation. Controls: appending one line to `Landing.tsx` fails; an
exemption for a file under the cap fails.

**The generated-types gate could pass with both sides stale.**
`check-generated-types-fresh` diffs the committed bindings against the client's
copy, but the bindings are only rewritten when someone runs the crate's ts-rs
export tests, and nothing checked that the result matched what was committed.
Edit a Rust struct, skip the cargo test, commit — parity is green while the
client is built against a type the server no longer sends. That is not a
cosmetic staleness: no protocol enum has a version field or a `serde(other)`
arm, so an unknown variant fails the whole message and the client drops
responses rather than degrading. CI now regenerates and runs `git diff
--exit-code` on the bindings. The guard's own remediation advice said `cp` only,
which against stale bindings propagates the staleness; it now says regenerate
first.

**Two guards ran nowhere.** `check-stack-reachable` — which exists because
`docker compose up --wait` reports success for a stack the macOS browser cannot
reach — was named only in a README line. `check-submodule-pointers-pushed` is
*correctly* excluded from CI (by the time any job runs, checkout has already
proved the pointers were pushed, so a CI copy could only report success), but
that left it running nowhere at all. Both now have npm scripts, and the pointer
check is a `.githooks/pre-push` hook.

## Round 142 — controls that operated on nothing, and one that operated on the wrong thing

A parallel audit of the UI's state space found four worth fixing now.

**The sidebar's file dialog operated entirely on a path the browser cannot
resolve.** A completed P2P transfer records `downloadPath` — where the
*internal service*, on its own filesystem, wrote the file. The dialog treated it
as a URL: `txt`/`md` rendered the path string as the document body, so a user
asking to read their notes read `/root/.citadel/downloads/notes.txt`; `pdf`
iframed the path against the page origin for a 404 and a blank frame;
spreadsheets and documents iframed `view.officeapps.live.com` with the path as
`src`, which the CSP blocks outright and which Microsoft could not have fetched
anyway; and Download set an anchor `href` to it, another origin-relative 404.
Sender identity was `senderCid.slice(0, 12) + '...'` — a truncated decimal CID,
in the one dialog whose job is to say who sent the file, while `peerDisplayName`
is what every other surface uses.

There is no route from the browser to that file: the agent is a separate
process with its own filesystem, and the direct-P2P path deliberately writes
there rather than streaming bytes into the page. So the dialog now says what is
true — the file arrived, this is what it is, this is where it landed — with the
path copyable, which is the only action that helps. Round 118 made transfer
completions real, so this list populates now and every file-receiving user
reaches it.

**Deleting a message was one click, no confirmation, no undo, in both chats.**
Delete sits directly under Edit in the same dropdown, and the message is
destroyed for every participant. Every other destructive action in this app —
node delete, group delete, kick, removing a saved account, disconnecting — asks
first. Both chats now share one prompt, so they cannot drift into asking
different questions or one of them into asking none, which is how this started.

**"Registered" made the entire received-presence feature unreachable.** The DM
header checked `connected`, then `registered`, then the peer's presence — and
`registered` is true for every peer you can have a conversation with, by
construction, since the conversation exists because the registration does. So
Away, Offline and the user's own custom status text and colour were sent,
received, routed and stored, and displayed nowhere; the one surface designed to
show presence showed protocol vocabulary instead. Registration now only decides
what "we know nothing" looks like.

**Two buttons did nothing.** "Remove Connection" on the profile card rendered
with no `onClick` in any form — round 131's finding (both Invite buttons had no
handler) one branch over in the same component, never propagated. There is no
peer-deregistration flow in the frontend at all, so the honest fix is not to
offer it. And `MemberListItem` had an Unfavourite star with no handler inside a
`variant === 'favorites'` branch nothing ever passes: an unreachable branch
containing a control that does nothing, two ways of being wrong about one
button.

`buttons-do-something.test.ts` scans for the shape. Getting it to discriminate
took two passes — `<DropdownMenuTrigger asChild><Button>` gets its behaviour
from the trigger, and requiring an `onClick` there would push people to add a
no-op one; and `stripComments` leaves `{}` where a JSX comment was, which sat
between several triggers and their buttons. Control: restoring "Remove
Connection" fails it by file and line.

## Round 143 — four checks whose green survived the regression they guard

A parallel audit looked for checks that cannot fail: for each candidate, name a
specific change to production code that breaks the guarded behaviour, and show
the check stays green. Four were worth acting on immediately.

**The first-connect-admin gate was tested at the switch and never at the wire.**
Round 109 closed a real hole: registration has no invite gate, so unconditional
promotion of the first member meant that on a deployment reachable from
anywhere, whoever found the port and registered first became the administrator —
a stranger, by race. The tests that came with it pin the env-var resolver and
that the flag is stored. Reverting the decision to `let is_first_member =
ws_was_empty;` left every one of them green. The integration suite could not
have caught it either: it runs with `WORKSPACE_ALLOW_FIRST_CONNECT_ADMIN=1`,
which makes the gated and ungated versions behave identically.

The decision lived inline in a match arm of the connection handler, reachable
only through a kernel, a backend and a live Citadel session. It is now
`first_member_outcome`, with the truth table pinned. Control: removing the gate
fails two of four tests by name.

**Nothing inspected the Connect payload.** The register path is checked
byte-for-byte; Connect was not. Ship `password: []` from `auth-operations` and
every test in `connect-always-authenticates` stayed green while every login
failed. Four assertions added — the password bytes, that they are non-empty, the
username, and that the caller's chosen security settings reach the wire rather
than the defaults (the Connect half of round 139's eviction bug). Controls: an
empty password fails two, ignoring the chosen settings fails one.

**Media call ownership and generation enforcement had no test reaching it.**
`close_authorised` was extracted and tested when it was written, and the two
guards beside it were not. Removing `owner == uuid` from the send path lets a
stale connection — one whose uuid a reconnect replaced, or a second tab that
never opened a call — inject audio and video frames into somebody else's live
call on the same peer pair. Removing the generation compare in the commit path
installs a session into a call the client has already ended, leaving a pump
decoding frames forever. Both are now `send_authorised` and `open_may_commit`,
tested. Control: neutering both fails four of eight.

**The listener-emitter guard was blind to half the bus, in both directions.** It
matched single-quoted arguments only, so a family declared as
`FILE_TRANSFER_EVENTS = { COMPLETED: 'file-transfer:completed' }` and used as
`emit(FILE_TRANSFER_EVENTS.COMPLETED)` was invisible as an emit AND as a
listen — deleting both emits of `COMPLETED` stops the Files sidebar ever
refreshing, and the guard reported 75 of 75 matched. It now resolves the
constant families before scanning, and fails outright if it finds none, since
finding none is exactly what the blind version looked like. Seeing that half of
the bus for the first time surfaced five file-transfer events with no
subscriber; each fires alongside `state-changed`, which the sidebar does listen
to, so they are recorded with that reason rather than presented as new gaps.
Control: deleting the `COMPLETED` emits now reports a dead listener.

## Round 144 — the app's access-control surface was unusable without sight

A screen-reader audit of the whole tree. The headline is not a subtle
omission — it is that the permission matrix, which is where an administrator
decides who may do what, announced nothing usable at all.

**Every checkbox in the permission matrix was unnamed.** Radix renders a
`Checkbox` as a `<button role="checkbox">` with no text. The matrix is
permissions × four roles, so an admin heard *"checkbox, not checked"* dozens of
times in a row with nothing to distinguish them. Table navigation did not rescue
it: the permission cell was a `<td>` rather than `<th scope="row">`, and the
role headers carried no `scope`. Each checkbox is now named outright — row and
column headers only help a reader that is in table mode, and on this surface
that is not a bet worth taking — and the headers are correct too, so both routes
work.

**The pattern was documented in one file and applied nowhere else.**
`GeneralSettingsTab` carries a comment explaining exactly this ("htmlFor/id, not
proximity. A Switch renders a `<button>` with no inner text…") beside its one
correct call site. Every toggle, slider and select in Privacy, Appearance and
the three chat-settings tabs was named by a `<Label>` sitting next to it, which
is visual only — eighteen controls, including the read-receipt and online-status
switches, which is someone changing their privacy blind. This is the repo's most
productive defect shape occurring in the one place where the correct answer was
already written down.

`controls-have-accessible-names.test.ts` scans both directions: a nameless
control, and an `htmlFor` pointing at an id that does not exist (which looks
more correct than no `htmlFor` and is just as broken). Getting it to
discriminate needed brace-aware attribute parsing — `[^>]*` stops at the first
`>`, and `onCheckedChange={() => …}` contains one, so a control named *after*
its handler read as unnamed.

Also fixed: two dialogs with no accessible name, announced as just "dialog";
the palette radios, whose labels sat in a wrapping `<label>` that cannot name a
`<button>`, so both options were "radio, not checked"; the colour swatches, N
identical empty buttons with selection shown by a ring alone; the markdown and
editor toolbars, where Bold and Italic exposed their on-state as a background
colour and nothing else; the file-transfer progress bar, which had no
`role="progressbar"` and so was silence from start to finish; the typing
indicator, a purely visual pulse; the group chat's `role="log"`, which was
mounted *with* its content (a live region must pre-exist its text or the
insertion is read wholesale or dropped — the direct-message list gets this right
and the group view was written the other way); and two routes with no `<h1>` or
with heading levels running backwards.

One thing the round produced that is worth noting on its own: splitting
`GroupRoleEditor` moved the colour swatches to a new file, and an existing
contrast assertion kept pointing at the old one. Its `not.toMatch` would have
passed forever against a file with no ring in it. The paired `toMatch` is what
caught it — a negative assertion needs a positive one beside it, or it stops
checking silently when the code moves.

## Round 145 — verdicts nobody read, and assertions the code under test swallowed

Continuing the audit of checks whose green survives the regression they guard.

**The CID-routing set was pinned in one direction only.** The fixture-coverage
test asserts every member has a shape fixture — so *adding* a member without one
fails loudly. *Removing* one shrinks the set, every remaining fixture still
extracts correctly (the extractor is type-agnostic), and nothing fails. Deleting
`MediaFrameNotification` would have silently reinstated wrong-tab call delivery,
which is the exact defect the set exists to prevent. The membership is now
written out and compared, so removal fails and addition is a deliberate edit in
two places. Control: dropping a member fails it.

**An assertion inside the code under test's own callback is not an assertion.**
The group-invite dedupe test asserted `toHaveLength(1)` inside the `setGroups`
updater — which `applyGroupInvite` calls from inside its own try/catch, so the
thrown assertion became a "Group Invitation Failed" toast and the test passed.
Removing the dedupe left it green. The result is now captured and asserted after
the call, plus an assertion that no failure was reported on the way — the shape
that hid it. Control: removing the dedupe fails it.

**A verdict printed to the console is not a check.** `chat-settings` computed a
pass expression from ten booleans and printed nine more, among them the
auto-accept toggle — the control for a recorded fix — which could print FAIL
while the suite exited 0. All nine are now in the expression.
`settings-controls` was worse: its persistence check, the entire point of
closing and reopening the modal, existed only as `console.log("Settings
persistence verified: false")` and never reached the results object at all. It
is now a field and it is gated.

**Three specs could not fail.** `peer-group` returned `true` when group creation
produced no id — "Treating as PASS (feature not yet available)" — so deleting
`CreateGroupDialog.tsx` turned a CI leg green; its catch also returned `true` on
a browser crash, which tells us nothing about the feature and is the only signal
anyone reads. `security-settings` returned `true` when the Reinforced option
never appeared, on the reasoning that "the dropdown exists even if we can't
change it" — in a function called `verifySecurityLevel`, where a dropdown whose
options never render is a security setting the user cannot choose. All three now
fail.

> These three may turn an integration leg red. That is the point: the dialog
> they excused exists, and has since the note was written.

**And exemption staleness was checked in one direction.** An entry left
`RECORDED_UNCONSUMED` when it gained a listener, but an entry whose *emitter*
had gone sat there indefinitely — `workspace:created` and `workspace:error` are
both type declarations with no emit anywhere — silently excusing a future
zero-subscriber emit of the same name. Both directions are checked now, and both
dead entries are gone.

## Round 146 — thirteen suites that never ran on the PR that changed their code

**The UI submodule's CI matrix was thirteen legs behind the parent's.** All UI
work lands through submodule PRs, and the submodule's own workflow ran neither
`file-manager`, nor either revfs suite, nor any of the six tree suites, nor
office chat, room chat, peer-group or native-file-picker. Those suites did run —
later, on the parent's pointer bump, against a change already reviewed and
merged.

That is the worst shape a coverage gap can take: the checks exist, they are
green on the PR page, and the missing ones are invisible precisely because
nothing enumerates them. `check-ci-matrices-agree.mjs` now compares the two, in
the one direction that is meaningful (the parent may legitimately run more, since
it owns the Rust side), and refuses to run at all if the parent's matrix drops
below ten legs — a scan that finds nothing looks exactly like a scan that
passes. Preflight is 29 checks. Control: removing a leg from the submodule fails
it by name.

**A test that manufactures its own trigger tests half a mechanism.** The
self-heal suite mocks `instanceManager` wholesale and fires
`instance:registered` by hand to drive the orphan-buffer drain. That covers the
router and nothing of the producer: delete the emit from `registerInstance` and
the buffer is never drained — orphaned CID-routed messages, call media among
them, land on the leader tab — while the suite stays green. (The
listener/emitter guard does catch outright deletion, but not the emit moving
behind a condition that never fires.) `register-instance-announces.test.ts` is
the other half, on the real object, including the two documented contract
points: a null cid still announces, and an unregister must not.

**A fixture that performs production's action proves nothing about production.**
`pump_survives_client_loss_and_returns_receive_half` closes the media lane
itself before spawning the pump — which is exactly what the connection-drop path
does — so deleting `lane.close()` from that path left the test green while every
dropped WebSocket leaked a pump decoding frames into a queue nobody reads. The
close is now `retire_media_lane`, with tests including that one client's
disconnect does not end another's call. Control: removing the close fails one of
four.

## Round 147 — CI went red, and every cause was a check nobody had

Five jobs failed. All five were mine, and each names a seam nothing was
watching.

**A new workspace crate broke both service images and all three Playwright
shards.** `citadel-workspace-executor` was added to `Cargo.toml`, to all three
CI matrices, and to the crate-coverage guard — and to neither Dockerfile. Cargo
loads *every* member's manifest before building *any* crate, so an image that
never builds that crate still dies with `failed to load manifest for workspace
member`. The failure surfaces as a Docker build error inside an integration job,
about as far from the edit as a consequence gets.
`check-dockerfiles-copy-every-crate.mjs` connects the membership list to the
COPY lists, and handles nested members (one arrives with its ancestor's
directory). Control: removing the COPY fails it by name.

**`deploy.sh` could not run on a machine with nothing deployed.**
`PREVIOUS_TAGS="$(previous_images)"` ends in a `grep -o` that finds nothing when
no images are running — normal on a first deploy. Under `set -o pipefail` that
makes the pipeline exit 1, and under `set -e` the assignment aborts the script.
So a first deploy printed `[3/4] Updating services`, exited 1, and restarted
nothing, *after* pulling every image: the one path with no previous version to
roll back to was the one path that could not run. The line below it had the same
shape (`[ -n … ] && echo`, which under `set -e` aborts whenever the test is
false); both are fixed. Its integration test caught this the moment CI ran it —
that test is exactly as good as advertised.

**A guard I added in round 139 read a file that does not exist in CI.** The
precache-cap assertion opened `public/wasm/*.wasm`, which is build output, not
committed. It passed locally against the real binary and threw `ENOENT` on the
runner. The cap floor is now asserted unconditionally and the real size only
when there is a real file — and the test says which it did, rather than quietly
becoming a no-op on the machine that matters.

The pattern is one this campaign keeps finding, this time in my own work: three
lists that must agree — workspace members, Dockerfile COPYs, CI matrices — and
nothing comparing them. Two of the three now have guards.

## Round 148 — eleven byte formatters, not four

The dedup audit reported four implementations of the byte-size format. Writing
the guard found **eleven**, in five different precisions:

| where | rule |
|---|---|
| `file-transfer-helpers` | `toFixed(1)`, "0 Bytes" |
| `transfer-format` | `toFixed(2)`, "0 Bytes" |
| `vfs-content-helpers` | `toFixed(1)`, "0 B" |
| `lib/utils` | `toLocaleString`, adds TB |
| `StorageLimitModal`, `VFSStorageUsage` | `toFixed(value < 10 ? 1 : 0)` |
| `send-operations` | hand-rolled B/KB/MB branches |
| `useFileTransfer`, `FilesSection` | `toFixed(1)`, "0 Bytes" |
| `useChatSettings` | always megabytes, rounded |
| `debug-formatter` | *not a size formatter at all* — it formats byte ARRAYS |

The first two are the same feature: a transfer bubble and the progress line
beside it showed the same file as "1.5 MB" and "1.46 MB". `debug-formatter`'s
was a different function wearing the same name, which is how a grep for the
formatter stops being a way to find them. `useChatSettings`' is deliberate —
it labels a limit the user set in megabytes, and "1 GB" beside a slider marked
in MB reads as a different setting — so it is now `formatSizeLimit`, named for
what it does.

One `formatBytes` in `lib/format-bytes`, one decimal place. It also fixes two
things every copy had: a negative or NaN size rendered as "NaN undefined", and
a byte count showed a fractional part ("1.5 B" is not a size).

Same treatment for `findNodeByPath` (three byte-identical copies, two of them
exported from neighbouring files in the same directory and imported by their
neighbours) and `toInternalServiceRequest` (twice, with the same body *and* the
same doc comment — it is the blessed cast across the WASM nominal-type boundary,
so it exists once precisely so a grep finds every crossing point).

`one-implementation-per-helper.test.ts` allows a re-export — several modules
keep their old name as a front — and forbids a second body. Its second test
keeps each canonical home honest: a home that stopped defining the thing would
make the rule vacuous for that name, silently. Controls: re-forking fails the
first, changing the home's declaration form fails the second.

Also: "Connection Type: P2P Encrypted" in chat settings was a constant under a
label that reads as live status — the same string whether the peer is connected,
offline, or queueing through ILM. Relabelled to the property of the channel it
actually states.

## Round 149 — a mirror with no lock, and an "SSOT" label on the copy nobody read

**The inline-upload byte cap was declared in two languages and nothing bound
them.** `MAX_BYTE_CONTENTS_BYTES` exists in `server-upload.ts` and in the
internal service's `requests/file/upload.rs`, and the TypeScript comment saying
"Keep the two in lockstep" was the entire mechanism. Unlike the permission
parity gate and the credential mirror, nothing failed if the Rust cap moved.

Drift has a specific, expensive symptom: the browser serialises a file it
believes acceptable, ships it, and the service rejects it on arrival — a user
watches an upload complete and then fail, which is the exact round trip the
TypeScript constant exists to prevent. `check-transfer-cap-parity.mjs` reads
both sides as *text* (importing either would pass whatever the other said) and
fails outright if the declaration is renamed, because a scan that finds nothing
looks exactly like a scan that agrees. Controls: changing one side fails it;
renaming it away fails it differently, and says so.

**The CID priority chain existed twice, in the multi-tab hot path.** One copy
was `cid-resolver.ts`, whose own header read "Extracted to avoid duplication
across service methods", and the other was in
`p2p-registration-service/discovery.ts` — same four steps, same 500 ms timeout
under two different constant names, differing only in debug logging. This is
which session a tab is acting as; reorder the chain or add a fallback and one of
the two keeps the old answer. Now `lib/p2p/current-cid.ts`, with both old homes
as re-exports.

**And the "(SSOT)" label was on the copy nobody imported.**
`p2p-auto-connect-service/types.ts` re-exported `DEFAULT_BACKOFF_CONFIG` and
`ONLINE_STATUS_CACHE_TTL_MS` from `p2p-auto-connect/types.ts` under a comment
saying SSOT — while the same numbers were declared again in this directory's
`constants.ts`, which is what every consumer actually imports. Tuning the
labelled copy changed nothing. The values are now derived from `constants.ts`,
the copy that was always in force, and the comment says what is true.

Preflight is 31 checks.
