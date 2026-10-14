import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LEGAL_DOCUMENTS, type LegalDocument, type LegalDocumentId } from '@/lib/terms/legal-documents';

/** Short names for the index and footers; the documents' own titles are long. */
const SHORT_NAME: Readonly<Record<LegalDocumentId, string>> = {
  terms: 'Terms of Use',
  'customer-terms': 'Customer Terms',
  privacy: 'Privacy Notice',
  dpa: 'Data Processing Addendum',
  subprocessors: 'Subprocessors',
};

/** The five documents, as links between the public pages. `current` is marked for assistive tech. */
export function LegalLinks({ current, className }: { readonly current?: LegalDocumentId; readonly className?: string }): JSX.Element {
  return (
    <nav aria-label="Legal documents" className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {LEGAL_DOCUMENTS.map((doc: LegalDocument): JSX.Element => (
          <li key={doc.id}>
            <Link
              to={doc.path}
              aria-current={doc.id === current ? 'page' : undefined}
              className={cn('inline-flex min-h-6 items-center text-sm underline-offset-4 hover:underline', doc.id === current ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {SHORT_NAME[doc.id]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
