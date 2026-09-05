#!/usr/bin/env node
// A claimed session that is never activated looks exactly like a working one.
//
// `session:activated` is the sole trigger for session-startup-sequence:
// resetConnectionState, startMessagingForSession, the P2P registration service,
// connectToAllRegisteredPeers, and session:startup-complete. A path that claims
// a session for this tab and does not emit it leaves the ILM messenger handle
// open for the PREVIOUS account and opens no P2P channels for the new one.
//
// The sidebar workspace switcher did exactly that. `postAuthSetup` still loaded
// the tree, offices and members, so the switch looked healthy and the toast said
// "Connected!" -- while outbound messages blocked on ACKs nobody would send and
// nothing inbound arrived. It is the most common multi-account action here.
//
// The rule: a module that calls `claimSessionForThisTab` must also emit
// `session:activated`, or be named below with the reason it does not.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');

// Paths that claim without activating, each for a stated reason.
const EXEMPT = new Map([
  ['src/lib/sessions/claim-session.ts', 'the claim primitive itself; its callers activate'],
  ['src/components/sign-out-session.ts', 'claims in order to tear the session DOWN'],
  [
    'src/components/hooks/session-already-connected.ts',
    'hands off to a caller that activates',
  ],
  ['src/components/ui/use-auto-claim-session.ts', 'claims on behalf of an already-active session'],
]);

function* files(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === '__tests__' || e === 'node_modules') continue;
      yield* files(p);
    } else if (/\.tsx?$/.test(e)) yield p;
  }
}

/**
 * Comments stripped before matching.
 *
 * Without this, a file that only MENTIONS `session:activated` in prose --
 * including the comment explaining why the emit is there -- counts as
 * emitting it. My own negative control on this gate came back green for
 * exactly that reason: I had removed the emit and left the paragraph above
 * it, and the grep was satisfied.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const claimers = [];
for (const f of files(SRC)) {
  const text = stripComments(readFileSync(f, 'utf8'));
  if (!/\bclaimSessionForThisTab\s*\(/.test(text)) continue;
  const rel = relative(root, f);
  claimers.push({ rel, activates: /session:activated/.test(text) });
}

if (claimers.length === 0) {
  console.error('Found no module calling claimSessionForThisTab; this check verified nothing.');
  process.exit(1);
}

const missing = claimers.filter((c) => !c.activates && !EXEMPT.has(c.rel));
const staleExempt = [...EXEMPT.keys()].filter(
  (k) => !claimers.some((c) => c.rel === k),
);

if (missing.length || staleExempt.length) {
  if (missing.length) {
    console.error('These claim a session for this tab and never activate it:\n');
    for (const m of missing) console.error(`  ${m.rel}`);
    console.error(
      '\nEmit `session:activated` after the claim, or add the path to EXEMPT\n' +
        'in this script with the reason it does not need to.',
    );
  }
  for (const s of staleExempt) {
    console.error(`\nEXEMPT names ${s}, which no longer claims a session. Remove it.`);
  }
  process.exit(1);
}

console.log(
  `OK: all ${claimers.length - EXEMPT.size} activating claim sites emit ` +
    `session:activated (${EXEMPT.size} exempt, each with a reason).`,
);
