/**
 * Why a zone's app is closed: the reason follows what the zone shows next (pure), and AppZone hands
 * the runtime that reason in the same commit that removed or replaced the app, by construction of
 * React's effect order (a parent's layout effect before a deleted child's passive cleanup).
 */
import { describe, expect, it } from 'vitest';
import { act, render, waitFor, type RenderResult } from '@testing-library/react';
import type { AppInstall, Capability } from 'citadel-workspace-client-ts';
import { AppZone } from '../AppZone';
import { AppZoneContext, zoneClaims, type AppZoneEnvironment, type AppZoneHandle, type AppZoneMount, type AppZoneRuntime, type ZoneHost } from '../app-zone-environment';
import { closeReasonFor } from '../zone-close-reason';
import type { ZoneView } from '../zone-state';
import { listedApps, type ListedApp } from '@/lib/citadel-apps/listing-model';
import { recordDisabledForMe } from '@/lib/citadel-apps/disabled-for-me';
import { recordPeerConsent } from '@/lib/citadel-apps/peer-for-me';
import type { CloseReason } from '@/lib/citadel-apps/sdk/generated/CloseReason';
import { installOf, listingOf } from '@/test/app-manifests';

const KANBAN: ListedApp = listedApps([listingOf({ id: 'com.acme.kanban', name: 'Kanban', version: '1.4.0' })])[0];
const RUNNING: AppInstall = installOf('com.acme.kanban', 'Workspace', { id: 'i1' });
const RAN_WITH: readonly Capability[] = ['canvas', 'ihttp.p2p.serve'];

describe('the close reason for what a zone shows next', () => {
  it('names the install gone, the person no longer reached, another release, or just the zone going', () => {
    const cases: [ZoneView, CloseReason][] = [
      [{ kind: 'ready', app: KANBAN, install: RUNNING, allowed: RAN_WITH }, 'unmount'],
      [{ kind: 'ready', app: KANBAN, install: { ...RUNNING, manifest_sha256: '2'.repeat(64) }, allowed: RAN_WITH }, 'version_update'],
      [{ kind: 'ready', app: KANBAN, install: { ...RUNNING, id: 'i2', manifest_sha256: '2'.repeat(64) }, allowed: RAN_WITH }, 'unmount'],
      [{ kind: 'ready', app: KANBAN, install: RUNNING, allowed: [...RAN_WITH, 'ihttp.p2p.call'] }, 'unmount'],
      [{ kind: 'ready', app: KANBAN, install: RUNNING, allowed: ['canvas'] }, 'access_revoked'],
      [{ kind: 'loading' }, 'unmount'], [{ kind: 'not-available' }, 'unmount'],
      [{ kind: 'install', name: 'Kanban' }, 'uninstall'], [{ kind: 'ask-admin', name: 'Kanban' }, 'uninstall'],
      [{ kind: 'disabled', name: 'Kanban', install: RUNNING }, 'access_revoked'], [{ kind: 'suspended', name: 'Kanban' }, 'access_revoked'],
      [{ kind: 'needs-consent', name: 'Kanban', version: '2.0.0' }, 'version_update'], [{ kind: 'outdated', name: 'Kanban', installed: '1.0.0' }, 'version_update'],
    ];
    for (const [next, want] of cases) expect([next.kind, closeReasonFor({ install: RUNNING, allowed: RAN_WITH }, next)]).toEqual([next.kind, want]);
  });
});

interface Recorded { readonly mounts: AppInstall[]; readonly closes: CloseReason[] }

function recordingRuntime(): AppZoneRuntime & Recorded {
  const mounts: AppInstall[] = [];
  const closes: CloseReason[] = [];
  return {
    mounts, closes,
    mount: (_host: ZoneHost, zone: AppZoneMount): AppZoneHandle => {
      mounts.push(zone.install);
      return { close: async (reason: CloseReason): Promise<void> => { closes.push(reason); } };
    },
  };
}

function env(installs: AppInstall[], runtime: AppZoneRuntime, claims: Pick<AppZoneEnvironment, 'claim' | 'release'>): AppZoneEnvironment {
  return {
    nodeId: 'n-2', me: 'alice', ancestors: ['workspace-root'], mayInstall: 'yes', runtime,
    data: {
      listing: async () => ({ ok: true, value: KANBAN }),
      installs: async () => ({ ok: true, value: installs }),
      setDisabledForMe: async (_id: string, d: boolean) => ({ ok: true, value: d }),
    },
    openLink: (): void => undefined, linkUrl: (): string => '', copyText: async (): Promise<void> => undefined, ...claims,
  };
}

const page = (e: AppZoneEnvironment): JSX.Element => <AppZoneContext.Provider value={e}><AppZone app="com.acme.kanban" zone="board" height={300} /></AppZoneContext.Provider>;

describe('an app zone closes its app with the reason of the commit that removed it', () => {
  it('the zone going away closes it as an unmount', async () => {
    const runtime: AppZoneRuntime & Recorded = recordingRuntime();
    const view: RenderResult = render(page(env([RUNNING], runtime, zoneClaims())));
    await waitFor(() => expect(runtime.mounts).toHaveLength(1));
    view.unmount();
    expect(runtime.closes).toEqual(['unmount']);
  });

  it('disabled for this person while it runs: closed as access revoked, not as an unmount', async () => {
    const runtime: AppZoneRuntime & Recorded = recordingRuntime();
    render(page(env([RUNNING], runtime, zoneClaims())));
    await waitFor(() => expect(runtime.mounts).toHaveLength(1));
    act(() => recordDisabledForMe(RUNNING.id, true));
    try {
      await waitFor(() => expect(runtime.closes).toEqual(['access_revoked']));
    } finally {
      act(() => recordDisabledForMe(RUNNING.id, false));
    }
  });

  it('another release of the same install: the old one is closed as a version update and the new one mounted', async () => {
    const runtime: AppZoneRuntime & Recorded = recordingRuntime();
    const claims: Pick<AppZoneEnvironment, 'claim' | 'release'> = zoneClaims();
    const view: RenderResult = render(page(env([RUNNING], runtime, claims)));
    await waitFor(() => expect(runtime.mounts).toHaveLength(1));
    const updated: AppInstall = { ...RUNNING, version: '1.5.0', manifest_sha256: '2'.repeat(64) };
    view.rerender(page(env([updated], runtime, claims)));
    await waitFor(() => expect(runtime.mounts).toHaveLength(2));
    expect(runtime.closes).toEqual(['version_update']);
    expect(runtime.mounts[1].manifest_sha256).toBe(updated.manifest_sha256);
  });

  it('this member’s answers change while it runs: it starts again, closed as an unmount when it gains and as access revoked when it loses', async () => {
    // peer-ports.ts reads the answers once, as the instance starts: answered one plane at a time, the
    // first answer started it holding that plane alone, and the later ones never reached it.
    const pool: AppInstall = installOf('com.acme.kanban', 'Workspace', { id: 'answers-change', granted: ['canvas', 'ihttp.p2p.serve', 'ihttp.p2p.call'] });
    const runtime: AppZoneRuntime & Recorded = recordingRuntime();
    render(page(env([pool], runtime, zoneClaims())));
    act(() => recordPeerConsent(pool.id, { serve: true, call: false, topics: false, at_ms: 1n }));
    await waitFor(() => expect(runtime.mounts).toHaveLength(1));
    act(() => recordPeerConsent(pool.id, { serve: true, call: true, topics: false, at_ms: 2n }));
    await waitFor(() => expect(runtime.mounts).toHaveLength(2));
    expect(runtime.closes).toEqual(['unmount']);
    act(() => recordPeerConsent(pool.id, { serve: false, call: true, topics: false, at_ms: 3n }));
    await waitFor(() => expect(runtime.mounts).toHaveLength(3));
    expect(runtime.closes).toEqual(['unmount', 'access_revoked']);
  });

  it('the next instance starts only once the last one finished closing (control: closed, it starts)', async () => {
    // A restarted instance joins the topics the last one is leaving; a leave landing after the join took the member out.
    const pool: AppInstall = installOf('com.acme.kanban', 'Workspace', { id: 'waits-for-close', granted: ['canvas', 'ihttp.p2p.serve', 'ihttp.p2p.call'] });
    const mounts: AppInstall[] = [];
    const finish: (() => void)[] = [];
    const runtime: AppZoneRuntime = {
      mount: (_host: ZoneHost, zone: AppZoneMount): AppZoneHandle => {
        mounts.push(zone.install);
        return { close: (): Promise<void> => new Promise<void>((resolve: () => void) => { finish.push(resolve); }) };
      },
    };
    render(page(env([pool], runtime, zoneClaims())));
    act(() => recordPeerConsent(pool.id, { serve: true, call: false, topics: false, at_ms: 1n }));
    await waitFor(() => expect(mounts).toHaveLength(1));
    act(() => recordPeerConsent(pool.id, { serve: true, call: true, topics: false, at_ms: 2n }));
    await waitFor(() => expect(finish).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });
    expect(mounts).toHaveLength(1);
    act(() => { for (const done of finish.splice(0)) done(); });
    await waitFor(() => expect(mounts).toHaveLength(2));
  });

  it('control: an answer that changes nothing it holds does not start it again', async () => {
    const pool: AppInstall = installOf('com.acme.kanban', 'Workspace', { id: 'answers-same', granted: ['canvas', 'ihttp.p2p.serve'] });
    const runtime: AppZoneRuntime & Recorded = recordingRuntime();
    render(page(env([pool], runtime, zoneClaims())));
    act(() => recordPeerConsent(pool.id, { serve: true, call: false, topics: false, at_ms: 1n }));
    await waitFor(() => expect(runtime.mounts).toHaveLength(1));
    // `call` and `topics` were never granted, so allowing them changes nothing this install holds.
    // act() flushes the commit and its effects, so a restart would already have happened here.
    act(() => recordPeerConsent(pool.id, { serve: true, call: true, topics: true, at_ms: 2n }));
    expect([runtime.mounts.length, runtime.closes]).toEqual([1, []]);
  });
});
