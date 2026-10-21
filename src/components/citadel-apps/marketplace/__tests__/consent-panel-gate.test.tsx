/**
 * The consent panel's Install button on a clock: closed before 600 ms however the pointer moves,
 * closed after 600 ms while the pointer has not moved, open once both hold, closed again when the
 * tab is hidden, and closed whatever happens while a required permission cannot be granted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConsentPanel } from '../ConsentPanel';
import { listedApps, type ListedApp } from '@/lib/citadel-apps/listing-model';
import { consentRows, type ConsentRow } from '@/lib/citadel-apps/consent-model';
import type { Tri } from '@/lib/citadel-apps/scope-options';
import { cap, listingOf } from '@/test/app-manifests';

const APP: ListedApp = listedApps([listingOf({ capabilities: [cap('canvas'), cap('net.server', true, ['api.acme.com', 'sync.acme.com:8443'])] })])[0];
const ROWS: ConsentRow[] = consentRows(APP.manifest, new Set(), { holds: (): Tri => 'yes' }, 'root');

const panel = (problem: string | null = null): ReturnType<typeof render> => render(
  <ConsentPanel app={APP} scopeSentence="Just you" rows={ROWS} onToggle={() => {}} trust={{ kind: 'first-time' }} problem={problem} onInstall={() => {}} onBack={() => {}} />,
);
const install = (): HTMLButtonElement => screen.getByTestId('apps-consent-install') as HTMLButtonElement;
const after = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const move = (): void => { act(() => { fireEvent.pointerMove(window); }); };
const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

describe('the consent gate', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { setVisibility('visible'); vi.useRealTimers(); });

  it('a move inside the first 600 ms opens Install at 600 ms, not before', () => {
    panel();
    move();
    after(599);
    expect(install().disabled).toBe(true);
    after(1);
    expect(install().disabled).toBe(false);
  });

  it('control: 600 ms on screen without a pointer move stays closed', () => {
    panel();
    after(5000);
    expect(install().disabled).toBe(true);
    move();
    expect(install().disabled).toBe(false);
  });

  it('a focus-moving key counts as presence; a letter does not', () => {
    panel();
    after(700);
    act(() => { fireEvent.keyDown(window, { key: 'a' }); });
    expect(install().disabled).toBe(true);
    act(() => { fireEvent.keyDown(window, { key: 'Tab' }); });
    expect(install().disabled).toBe(false);
  });

  it('hiding the tab closes it and starts the 600 ms again', () => {
    panel();
    move();
    after(700);
    expect(install().disabled).toBe(false);
    setVisibility('hidden');
    expect(install().disabled).toBe(true);
    setVisibility('visible');
    move();
    after(599);
    expect(install().disabled).toBe(true);
    after(1);
    expect(install().disabled).toBe(false);
  });

  it('a permission that cannot be granted keeps it closed; control above opens without one', () => {
    panel('You cannot allow this app to read pages.');
    move();
    after(1000);
    expect(install().disabled).toBe(true);
    expect(screen.getByTestId('apps-consent-problem').textContent).toBe('You cannot allow this app to read pages.');
  });

  it('lists each host on its own, the hash, and what it can never do', () => {
    panel();
    expect(screen.getAllByTestId('apps-consent-host').map((h: HTMLElement) => h.textContent)).toEqual(['api.acme.com', 'sync.acme.com:8443']);
    expect(screen.getByTestId('apps-consent-hash').textContent).toBe(APP.manifest.artifact.sha256);
    expect(screen.getByTestId('apps-consent-never').textContent).toContain('Change roles or who may do what');
    expect(screen.getByTestId('apps-consent-trust').textContent).toContain('first');
  });
});
