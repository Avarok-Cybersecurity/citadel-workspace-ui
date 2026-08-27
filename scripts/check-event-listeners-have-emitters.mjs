#!/usr/bin/env node
/**
 * A listener and an emitter are two ends of one mechanism. This campaign has
 * repeatedly found only one end built: a handler subscribed to a name nothing
 * emits reads as working code, runs no code, and shows no error.
 *
 * Asserting the name in a test proves nothing — the broken version has a name
 * too. The only assertion with discriminating power is that the listened-for
 * name appears on the emitting side, which is what this script checks across
 * the whole tree.
 *
 * Test files are excluded from BOTH sides on purpose: an event emitted only by
 * its own test is exactly the failure being hunted, so counting the test as an
 * emitter would hide it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Known-dead listeners with an open finding already recorded against them.
 * An entry here is a debt marker, not an exemption: it keeps CI green while the
 * feature behind it is unbuilt, and the reason must name the finding.
 */
const RECORDED_DEAD = new Map([
  // Revealed only once this guard learned the `workspaceEvents.on*Event` and
  // `this.listen` facades — they were invisible to it until then, which is why
  // eight arrived at once rather than one at a time.
  ['typing:started', 'a redundant second path; typing DOES work via messenger.onTyping() in useP2PMessages-subscriptions'],
  ['typing:stopped', 'as typing:started — the working path is the onTyping callback, not this event'],
  ['message:received', 'the live inbound path is the P2P messenger; this listener predates it'],
  ['protocol:warning', 'no producer; the protocol-warning banner is driven by its own component state'],
  ['notification', 'notification-service listens to its own bus name; every real producer calls addNotification directly'],
  ['member:permissions-updated', 'no producer — permission changes are read back via GetUserPermissions'],
  ['user:login', 'EventListenerManager base-class example subscriptions; no producer anywhere'],
  ['user:logout', 'as user:login'],
  ['group:member-kicked', 'ROBUSTNESS.md #206 — kicks are never distinguished from leaves; no emitter exists yet'],
  ['instance:registry-update', 'ROBUSTNESS.md #230 — knownInstances feeds one debugLog and is always empty'],
]);


/**
 * Events that are EMITTED and heard by nobody.
 *
 * The mirror of RECORDED_DEAD. Most are harmless — an event published for a
 * consumer that does not exist yet is not a defect — which is why this is a
 * debt-marker list rather than a blanket failure. The ones marked REAL GAP are
 * findings with user-visible consequences, kept here so they are visible rather
 * than quietly tolerated.
 *
 * Three emit wires with no listener have already cost real defects: a live
 * document's final save, a failed session startup, and the local agent being
 * unreachable. Each was found by an audit, months apart, because nothing checked
 * this direction.
 */
const RECORDED_UNCONSUMED = new Map([
  ['revfs:persist-failed', 'REAL GAP — a failed tree persist is announced to nobody, same shape as live-document:persist-failed'],
  ['outbound-failed', 'REAL GAP — the queue knows a proxied request is dead ~10s before sendToLeader times out; nobody hears it'],
  ['outbound-error', 'REAL GAP — as outbound-failed'],
  ['group:message:new', 'published beside group:message-received, which is the one the store reads'],
  ['group:message:edited', 'the edit path settles through awaitWriteResponse, not this event'],
  ['group:message:deleted', 'as group:message:edited'],
  ['group:message:single', 'no consumer; single-message fetch is unused by the UI'],
  ['group:messages:loaded', 'useGroupChat reads the pagination result directly'],
  ['instance:state-changed', 'diagnostic; the UI reads instanceManager directly'],
  ['member:loaded', 'the members list is driven by members:loaded (plural)'],
  ['node:types:loaded', 'node types are read synchronously from the store'],
  ['operation:deleted', 'no consumer; deletions are reflected by the node:* events'],
  ['server:shutdown', 'no consumer — a shutdown notice the UI never shows'],
  ['workspace:created', 'the create flow awaits its response; this is a duplicate signal'],
  ['workspace:error', 'errors surface through operation:error, which IS consumed'],
  ['p2p:channel-ready', 'readiness is polled by the auto-connect service, not awaited'],
  ['p2p:conversations-cleaned', 'diagnostic after a stale-conversation sweep'],
  ['p2p:open-conversation', 'no consumer — deep-linking into a conversation is not wired'],
  ['p2p:peer-registered-with-us', 'the peer list refreshes on its own poll'],
  ['p2p:presence-updated', 'presence renders from the messenger callback registry'],
  ['p2p:registration-declined', 'no consumer — a decline is not surfaced anywhere'],
  ['p2p:raw-message', 'consumed by the Yjs provider through its own subscription path'],
  ['broadcast-workspace-response', 'internal to the broadcast-channel service'],
  ['yjs:document-update', 'the provider wires its own document listeners'],
]);

// Emitter forms: eventEmitter.emit('x'), io.emitEvent('x'), and the
// `name: 'x'` literal used by the group-events translator, whose names are
// emitted later through a dynamic `emit(event.name, ...)`.
const EMIT_PATTERNS = [/\bemit(?:Event)?\(\s*'([^']+)'/g, /\bname:\s*'([^']+)'/g];
// Listener forms — ALL SIX subscription facades on this bus.
//
// Round forty-one recorded that the reverse direction (an emitter nobody hears)
// could not be mechanised because a naive scan reported 75 false positives. The
// cause was this list being incomplete: `workspaceEvents.on*Event` is a family
// of six, `this.listen` is the EventListenerManager base class, and a generic
// type parameter — `useEventListener<Payload>('x')` — defeated the pattern
// entirely. With all of them recognised the false positives drop to zero.
//
// Deliberately NOT a bare `.on(` — Yjs documents, awareness and the editor use
// that too, and their event names are not on this bus.
const GENERIC = String.raw`(?:<[^>()]*>)?`;
const LISTEN_PATTERNS = [
  new RegExp(String.raw`eventEmitter\.(?:on|once)${GENERIC}\(\s*'([^']+)'`, 'g'),
  new RegExp(String.raw`useEventListener${GENERIC}\(\s*'([^']+)'`, 'g'),
  new RegExp(String.raw`\.on[A-Z]\w*Event${GENERIC}\(\s*'([^']+)'`, 'g'),
  new RegExp(String.raw`this\.listen(?:Once)?${GENERIC}\(\s*'([^']+)'`, 'g'),
];
const LISTEN_ARRAY = new RegExp(String.raw`useEventListeners${GENERIC}\(\s*\[([^\]]*)\]`, 'g');

const isTest = (p) => p.includes('__tests__') || /\.test\.[tj]sx?$/.test(p);

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); }
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

const emitted = new Set();
const listened = new Map(); // name -> [file, ...]

for (const file of files) {
  if (isTest(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const re of EMIT_PATTERNS) for (const m of src.matchAll(re)) emitted.add(m[1]);
  for (const re of LISTEN_PATTERNS) {
    for (const m of src.matchAll(re)) {
      if (!listened.has(m[1])) listened.set(m[1], []);
      listened.get(m[1]).push(relative(SRC, file));
    }
  }
  for (const m of src.matchAll(LISTEN_ARRAY)) {
    for (const n of m[1].matchAll(/'([^']+)'/g)) {
      if (!listened.has(n[1])) listened.set(n[1], []);
      listened.get(n[1]).push(relative(SRC, file));
    }
  }
}

const dead = [];
const staleMarkers = [];
for (const [name, sites] of listened) {
  if (emitted.has(name)) {
    if (RECORDED_DEAD.has(name)) staleMarkers.push(name);
  } else if (!RECORDED_DEAD.has(name)) {
    dead.push([name, sites]);
  }
}

// The reverse direction: an emitter nobody hears.
const unconsumed = [];
const staleUnconsumed = [];
for (const name of emitted) {
  // Only bus-shaped names. The `name: 'x'` emitter form also matches theme
  // presets and MDX template titles, which are not events.
  if (!name.includes(':') && !name.includes('-')) continue;
  if (listened.has(name)) {
    if (RECORDED_UNCONSUMED.has(name)) staleUnconsumed.push(name);
  } else if (!RECORDED_UNCONSUMED.has(name)) {
    unconsumed.push(name);
  }
}

for (const name of unconsumed) {
  console.error(`\nUNHEARD EMIT: '${name}' is emitted but nothing subscribes to it.`);
  console.error(`  Either subscribe to it, stop emitting it, or add it to`);
  console.error(`  RECORDED_UNCONSUMED with the reason it has no consumer yet.`);
}
for (const name of staleUnconsumed) {
  console.error(`\nSTALE MARKER: '${name}' is in RECORDED_UNCONSUMED but now HAS a listener.`);
  console.error(`  Remove the entry so a future regression fails.`);
}

if (dead.length === 0 && staleMarkers.length === 0 && unconsumed.length === 0 && staleUnconsumed.length === 0) {
  const n = listened.size - RECORDED_DEAD.size;
  console.log(
    `Every one of ${n} subscribed events has an emitter, and every emit has a ` +
    `listener (${RECORDED_DEAD.size} recorded-dead, ${RECORDED_UNCONSUMED.size} recorded-unheard).`
  );
  process.exit(0);
}

for (const [name, sites] of dead) {
  console.error(`\nDEAD LISTENER: '${name}' is subscribed but nothing emits it.`);
  for (const s of sites) console.error(`    ${s}`);
  console.error(`  The handler will never run. Either emit it from the producing side,`);
  console.error(`  delete the subscription, or add it to RECORDED_DEAD with the finding.`);
}
for (const name of staleMarkers) {
  console.error(`\nSTALE MARKER: '${name}' is in RECORDED_DEAD but now HAS an emitter.`);
  console.error(`  The debt was paid — remove the entry so a future regression fails.`);
}
process.exit(1);
