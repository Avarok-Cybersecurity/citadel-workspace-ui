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

if (dead.length === 0 && staleMarkers.length === 0) {
  const n = listened.size - RECORDED_DEAD.size;
  console.log(`Every one of ${n} subscribed events has an emitter (${RECORDED_DEAD.size} recorded-dead).`);
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
