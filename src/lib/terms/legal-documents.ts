/**
 * The five legal documents, bundled so they can be read before any session exists and without a
 * server. Each .md under documents/ is a byte copy of citadel-workspace-types/src/<name>.md, the
 * authority; legal-documents-parity.test.ts fails when one drifts.
 */
import platformTerms from './documents/platform_terms.md?raw';
import customerTerms from './documents/customer_terms.md?raw';
import privacyNotice from './documents/privacy_notice.md?raw';
import dpa from './documents/dpa.md?raw';
import subprocessors from './documents/subprocessors.md?raw';
import { headingOf, type LegalHeading } from './legal-text';

export type LegalDocumentId = 'terms' | 'customer-terms' | 'privacy' | 'dpa' | 'subprocessors';

export interface LegalDocument extends LegalHeading {
  readonly id: LegalDocumentId;
  /** The public page, which the documents themselves link to under https://work.avarok.net. */
  readonly path: string;
  readonly text: string;
}

function document(id: LegalDocumentId, text: string): LegalDocument {
  return { id, path: `/legal/${id}`, text, ...headingOf(text) };
}

/** In the order the index lists them. */
export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  document('terms', platformTerms),
  document('customer-terms', customerTerms),
  document('privacy', privacyNotice),
  document('dpa', dpa),
  document('subprocessors', subprocessors),
];

export function legalDocument(id: string | undefined): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc: LegalDocument): boolean => doc.id === id);
}

function required(id: LegalDocumentId): LegalDocument {
  const doc: LegalDocument | undefined = legalDocument(id);
  if (doc === undefined) throw new Error(`The bundled legal documents lack ${id}`);
  return doc;
}

export const PLATFORM_TERMS_DOCUMENT: LegalDocument = required('terms');
export const CUSTOMER_TERMS_DOCUMENT: LegalDocument = required('customer-terms');
