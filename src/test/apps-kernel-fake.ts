/**
 * A contract fake of the kernel's apps handler, for marketplace tests: it keeps listings (some
 * outside the caller's audience), installs and the caller's permissions, and answers each
 * `AppsRequest` with the raw `AppsResponse` the kernel would send -- which then goes through the
 * production reader (wire/apps-answer.ts), so a test exercises the same parsing a real answer
 * takes. Its rules are written out here, not imported from the UI, so it cannot agree with the UI
 * by construction. `apps-operations-contract.test.ts` runs it through the protocol transport too.
 */
import type { AppInstall, AppListing, AppManifest, AppsRequest, Capability, InstallScope } from 'citadel-workspace-client-ts';
import type { AppsTransport } from '@/lib/workspace-service/apps-operations';
import { readAppsAnswer, type AppsAnswer } from '@/lib/citadel-apps/wire/apps-answer';
import { readManifestBytes } from '@/lib/citadel-apps/manifest/manifest-rules';
import { installOf } from './app-manifests';

const INSTALLER_NEEDS: Partial<Record<Capability, string>> = {
  'nodes.read': 'AppInstallAllowNodeRead', 'storage.user': 'AppInstallAllowStorage', 'net.server': 'AppInstallAllowServerNetwork',
  'net.host': 'AppInstallAllowHostNetwork', 'ihttp.serve': 'AppInstallAllowInternalServe', 'ihttp.call': 'AppInstallAllowInternalCall',
  'md.edit': 'AppInstallAllowMdEdit', 'files.read': 'AppInstallAllowFiles',
};

export interface FakeKernelWorld {
  me: string;
  visible: AppListing[];
  /** Listings that exist but whose audience does not admit the caller. */
  hidden: AppListing[];
  installs: AppInstall[];
  permissions: Set<string>;
}

type Raw = unknown;

export class FakeAppsKernel implements AppsTransport {
  readonly requests: AppsRequest[] = [];
  /** Answers to send instead of the modelled one, first in first out (for malformed answers). */
  readonly scripted: Raw[] = [];
  private gate: Promise<void> | null = null;
  private release: (() => void) | null = null;

  constructor(readonly world: FakeKernelWorld) {}

  /** Hold every answer until `resume()`, to see the in-progress states. */
  pause(): void { this.gate = new Promise<void>((r: () => void) => { this.release = r; }); }
  resume(): void { this.release?.(); this.gate = null; }

  async request(request: AppsRequest, isOurs: (answer: AppsAnswer) => boolean): Promise<AppsAnswer> {
    this.requests.push(request);
    if (this.gate !== null) await this.gate;
    const raw: Raw = this.scripted.length > 0 ? this.scripted.shift() : this.answer(request);
    const answer: AppsAnswer = readAppsAnswer(raw);
    if (!isOurs(answer)) throw new Error(`the fake kernel's answer ${JSON.stringify(answer.kind)} was not taken as the answer to ${JSON.stringify(request)}`);
    return answer;
  }

  private manifestOf(listing: AppListing): AppManifest {
    const r: ReturnType<typeof readManifestBytes> = readManifestBytes(Uint8Array.from(listing.manifest_bytes));
    if (!r.ok) throw new Error(`a fake listing does not read: ${r.field}`);
    return r.manifest;
  }

  private find(appId: string): { listing: AppListing; manifest: AppManifest } | null {
    for (const listing of this.world.visible) {
      const manifest: AppManifest = this.manifestOf(listing);
      if (manifest.id === appId) return { listing, manifest };
    }
    return null;
  }

  answer(request: AppsRequest): Raw {
    const w: FakeKernelWorld = this.world;
    if (request === 'ListCatalogue') return { Catalogue: { listings: w.visible } };
    if (request === 'ListInstalls') return { Installs: { installs: w.installs } };
    if (typeof request !== 'object') return { Refused: 'Policy' };
    if ('GetListing' in request) {
      const found: { listing: AppListing } | null = this.find(request.GetListing.app_id);
      return found === null ? { Refused: 'Unavailable' } : { Listing: { listing: found.listing } };
    }
    if ('Install' in request) return this.install(request.Install);
    if ('Uninstall' in request) {
      const id: string = request.Uninstall.install_id;
      if (!w.installs.some((i: AppInstall) => i.id === id)) return { Refused: 'Unavailable' };
      w.installs = w.installs.filter((i: AppInstall) => i.id !== id);
      return { Uninstalled: { install_id: id } };
    }
    if ('SetDisabledForMe' in request) return { DisabledForMe: { install_id: request.SetDisabledForMe.install_id, disabled: request.SetDisabledForMe.disabled } };
    if ('Update' in request) return { UpToDate: { install_id: request.Update.install_id } };
    if ('RequestInstall' in request) return 'InstallRequested';
    return { Refused: 'Policy' };
  }

  private install(req: Extract<AppsRequest, { Install: unknown }>['Install']): Raw {
    const found: { manifest: AppManifest } | null = this.find(req.app_id);
    if (found === null) return { Refused: 'Unavailable' };
    const m: AppManifest = found.manifest;
    const scope: InstallScope = req.scope;
    const kind: string = scope === 'Workspace' ? 'workspace' : 'SelfOnly' in scope ? 'self' : 'Node' in scope ? 'node' : 'NodeTree' in scope ? 'node_tree' : 'users';
    if (!(m.scopes as string[]).includes(kind)) return { Refused: 'ScopeNotSupported' };
    const needed: string = kind === 'self' ? 'AppInstall' : 'AppInstallScoped';
    if (!this.world.permissions.has(needed)) return { Refused: { PermissionRequired: needed } };
    for (const c of req.granted) {
      if (!m.capabilities.some((r: { cap: Capability }) => r.cap === c)) return { Refused: { NotRequested: c } };
      const p: string | undefined = INSTALLER_NEEDS[c];
      if (p !== undefined && !this.world.permissions.has(p)) return { Refused: { CapabilityNotGrantable: c } };
    }
    const leftOut: { cap: Capability } | undefined = m.capabilities.find((r: { cap: Capability; optional: boolean }) => !r.optional && !req.granted.includes(r.cap));
    if (leftOut !== undefined) return { Refused: { RequiredCapabilityLeftOut: leftOut.cap } };
    if (req.pinned_publisher_key !== m.publisher.mldsa65_public_key) return { Refused: 'BadSignature' };
    const install: AppInstall = installOf(m.id, scope, { version: m.version, granted: req.granted, installed_by: this.world.me });
    this.world.installs = [...this.world.installs, install];
    return { Installed: { install } };
  }
}
