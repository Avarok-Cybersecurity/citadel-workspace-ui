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

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.
