/**
 * The page's ArtifactVerifierPort. SHA-256 is the platform's (WebCrypto; a digest, not the
 * signature scheme). ML-DSA-65 is Rust only (citadel-app-signature), and this build's wasm
 * client exports no app-signature check yet, so the check is passed in: `noAppSignatureCheck`
 * until it does, which refuses every load as `verifier_failed` rather than run an app nobody
 * checked.
 */
import type { ArtifactVerifierPort } from '../host/verify-artifact';

export type AppSignatureCheck = ArtifactVerifierPort['verifyAppSignature'];

export class NoAppSignatureVerifier extends Error {
  constructor() {
    super('this build has no app signature verifier; apps are not started unchecked');
    this.name = 'NoAppSignatureVerifier';
  }
}

export const noAppSignatureCheck: AppSignatureCheck = (): Promise<boolean> => Promise.reject(new NoAppSignatureVerifier());

export function pageArtifactVerifier(subtle: SubtleCrypto, verifyAppSignature: AppSignatureCheck): ArtifactVerifierPort {
  return {
    sha256Hex: async (bytes: Uint8Array): Promise<string> => {
      // A copy: WebCrypto takes an ArrayBuffer-backed view, never a shared one.
      const digest: ArrayBuffer = await subtle.digest('SHA-256', new Uint8Array(bytes));
      return Array.from(new Uint8Array(digest), (b: number) => b.toString(16).padStart(2, '0')).join('');
    },
    verifyAppSignature,
  };
}
