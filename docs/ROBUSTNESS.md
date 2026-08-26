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

## Method notes worth keeping

- **Grep the mechanism, not the symptom.** The last-admin guard was written
  against operations that *sound like* demotion and missed the third writer of
  `user.role`. Searching the assignment finds all three.
- **A passing test you have not watched fail is not evidence.** Six assertions
  this session passed against the surface they were written to reject.
- **Assert the property the fix changes**, not the symptom the user reported.
  Symptoms sit downstream of state a test does not control.
