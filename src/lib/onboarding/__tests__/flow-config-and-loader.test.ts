/**
 * The small pieces around the flow: where it opens after Stripe, what survives
 * the round trip, whether a deployment offers it at all, and the lazy
 * Turnstile loader.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DRAFT_KEY, clearDraft, loadDraft, saveDraft, stepFromUrl } from '../create-flow';
import { canCreateWorkspaces, readControlPlaneBase } from '../control-plane-config';
import { TURNSTILE_SCRIPT_URL, type TurnstileApi } from '../turnstile';

describe('the step Stripe sends the visitor back to', () => {
  it.each([
    ['', 'name'],
    ['?slug=acme&session_id=cs_1', 'provisioning'],
    ['?slug=acme&cancelled=1', 'cancelled'],
    ['?session_id=cs_1', 'name'],
    ['?slug=acme', 'name'],
  ])('%s -> %s', (query: string, step: string) => {
    expect(stepFromUrl(new URLSearchParams(query)).step).toBe(step);
  });
});

describe('the draft kept across Checkout', () => {
  beforeEach(() => clearDraft());

  it('comes back for the same slug and not another', () => {
    saveDraft({ displayName: 'Acme', slug: 'acme', plan: { tier: 'team', interval: 'year', seats: 4, storageBlocks: 2 } });
    expect(loadDraft('acme')?.plan).toEqual({ tier: 'team', interval: 'year', seats: 4, storageBlocks: 2 });
    expect(loadDraft('other')).toBeUndefined();
  });

  it('ignores anything malformed', () => {
    sessionStorage.setItem(DRAFT_KEY, '{"displayName":"x","slug":"acme","plan":{"tier":"gold"}}');
    expect(loadDraft('acme')).toBeUndefined();
    sessionStorage.setItem(DRAFT_KEY, 'not json');
    expect(loadDraft('acme')).toBeUndefined();
  });
});

function metaDoc(content: string | undefined): Document {
  const doc: Document = document.implementation.createHTMLDocument('t');
  if (content !== undefined) {
    const meta: HTMLMetaElement = doc.createElement('meta');
    meta.name = 'citadel-control-plane';
    meta.content = content;
    doc.head.appendChild(meta);
  }
  return doc;
}

describe('whether this deployment creates workspaces', () => {
  it('is off unless the deployment says where the control plane is', () => {
    expect(canCreateWorkspaces(metaDoc(undefined))).toBe(false);
    expect(canCreateWorkspaces(metaDoc(''))).toBe(false);
    expect(canCreateWorkspaces(undefined)).toBe(false);
    expect(readControlPlaneBase(metaDoc('/api'))).toBe('/api');
    expect(readControlPlaneBase(metaDoc(' /api/ '))).toBe('/api');
  });

  it('accepts a same-origin path only', () => {
    expect(readControlPlaneBase(metaDoc('https://evil.example/api'))).toBeUndefined();
    expect(readControlPlaneBase(metaDoc('//evil.example/api'))).toBeUndefined();
    expect(readControlPlaneBase(metaDoc('api'))).toBeUndefined();
    expect(readControlPlaneBase(metaDoc('/api?x=<script>'))).toBeUndefined();
  });
});

describe('the Turnstile loader', () => {
  const fakeApi: TurnstileApi = { render: () => 'w', reset: () => {}, remove: () => {} };
  // A fresh module per test: the loader keeps its promise for the page's life,
  // which is the behaviour under test, so one test's load must not be another's.
  let loadTurnstile: typeof import('../turnstile').loadTurnstile;
  beforeEach(async () => {
    vi.resetModules();
    ({ loadTurnstile } = await import('../turnstile'));
  });

  afterEach(() => {
    delete window.turnstile;
    document.head.querySelectorAll('script').forEach((s) => s.remove());
  });

  function injected(): HTMLScriptElement[] {
    return [...document.head.querySelectorAll('script')].filter((s) => s.src === TURNSTILE_SCRIPT_URL);
  }

  it('injects the explicit-render script once, lazily, and resolves on load', async () => {
    expect(injected()).toHaveLength(0);
    const first: Promise<TurnstileApi> = loadTurnstile();
    const second: Promise<TurnstileApi> = loadTurnstile();
    expect(injected()).toHaveLength(1);
    window.turnstile = fakeApi;
    injected()[0].dispatchEvent(new Event('load'));
    expect(await first).toBe(fakeApi);
    expect(await second).toBe(fakeApi);
  });

  it('forgets a failed load, so "Try again" really tries again', async () => {
    const failed: Promise<TurnstileApi> = loadTurnstile();
    injected()[0].dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow(/could not be loaded/);
    expect(injected()).toHaveLength(0);

    const retry: Promise<TurnstileApi> = loadTurnstile();
    expect(injected()).toHaveLength(1);
    window.turnstile = fakeApi;
    injected()[0].dispatchEvent(new Event('load'));
    expect(await retry).toBe(fakeApi);
  });
});
