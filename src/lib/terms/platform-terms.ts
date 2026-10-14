import { PLATFORM_TERMS_DOCUMENT } from './legal-documents';

/**
 * Avarok's platform terms as the wizard can show them BEFORE any session exists (`GetTerms` needs
 * one). The server's copy is the authority: this version is what the user is told they accepted,
 * and the sign-in step records acceptance only when the server's current version is this one.
 * `legal-documents-parity.test.ts` fails when this drifts from `citadel-workspace-types`.
 */
export const SHOWN_PLATFORM_TERMS_VERSION: number = 1;

export const SHOWN_PLATFORM_TERMS_TEXT: string = PLATFORM_TERMS_DOCUMENT.text;
