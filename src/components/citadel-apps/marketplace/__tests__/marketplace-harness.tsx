/**
 * The marketplace under test: the real AppsModal over the contract fake of the kernel, a static
 * catalogue served from a string, and a viewer whose permissions the test names.
 */
import { render, type RenderResult } from '@testing-library/react';
import type { AppListing } from 'citadel-workspace-client-ts';
import { AppsModal } from '../AppsModal';
import type { MarketplaceDeps, MarketplaceViewer } from '../marketplace-types';
import type { AppsModalRequest } from '@/lib/citadel-apps/apps-modal-store';
import type { Tri } from '@/lib/citadel-apps/scope-options';
import { FakeAppsKernel, type FakeKernelWorld } from '@/test/apps-kernel-fake';

export const ROOT: string = 'workspace-root';

export interface Harness {
  kernel: FakeAppsKernel;
  deps: MarketplaceDeps;
  copied: string[];
}

export function catalogueText(listings: readonly AppListing[]): string {
  return JSON.stringify({
    format: 1, catalogue_version: 1,
    entries: listings.map((l: AppListing) => {
      const bytes: Uint8Array = Uint8Array.from(l.manifest_bytes);
      const m: { id: string; version: string } = JSON.parse(new TextDecoder().decode(bytes)) as { id: string; version: string };
      return { id: m.id, version: m.version, manifest_url: 'https://acme.example/m.json', manifest_base64: btoa(String.fromCharCode(...bytes)), signature: l.signature };
    }),
  });
}

export function harness(world: Partial<FakeKernelWorld>, globalCatalogue: string | Error): Harness {
  const kernel: FakeAppsKernel = new FakeAppsKernel({ me: 'alice', visible: [], hidden: [], installs: [], permissions: new Set(['AppInstall']), disabled: new Set(), ...world });
  const copied: string[] = [];
  const deps: MarketplaceDeps = {
    transport: kernel,
    fetchText: async (): Promise<string> => { if (globalCatalogue instanceof Error) throw globalCatalogue; return globalCatalogue; },
    copyText: async (t: string): Promise<void> => { copied.push(t); },
  };
  return { kernel, deps, copied };
}

export function viewerHolding(held: ReadonlySet<string>, over: Partial<MarketplaceViewer> = {}): MarketplaceViewer {
  return {
    me: 'alice', rootId: ROOT, nodeId: 'n-1', nodeName: (id: string): string | null => (id === 'n-1' ? 'Engineering' : null),
    authority: { holds: (p: string): Tri => (held.has(p) ? 'yes' : 'no') },
    reach: () => ({ people: 7, pagesBelow: 3 }), members: ['alice', 'bob', 'carol'], serverAddress: null, origin: 'https://work.example',
    ...over,
  };
}

export function openModal(h: Harness, viewer: MarketplaceViewer, request: AppsModalRequest = { kind: 'browse' }): RenderResult {
  return render(<AppsModal open onOpenChange={() => {}} request={request} deps={h.deps} viewer={viewer} />);
}
