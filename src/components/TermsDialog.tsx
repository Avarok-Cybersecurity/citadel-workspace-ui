import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface TermsText {
  heading: string;
  version: number;
  text: string;
}

interface TermsDialogProps {
  documents: readonly TermsText[];
  onClose: () => void;
}

/** Reads terms. The text is shown as written, never interpreted as markup. */
export function TermsDialog({ documents, onClose }: TermsDialogProps): JSX.Element {
  return (
    <Dialog open onOpenChange={(open: boolean): void => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="terms-dialog">
        <DialogHeader>
          <DialogTitle>Terms</DialogTitle>
          <DialogDescription>What you agree to when you join.</DialogDescription>
        </DialogHeader>
        <TermsSections documents={documents} />
      </DialogContent>
    </Dialog>
  );
}

/** The terms as written, one titled section each; never interpreted as markup. */
export function TermsSections({ documents }: { documents: readonly TermsText[] }): JSX.Element {
  return (
    <>
      {documents.map((doc: TermsText): JSX.Element => (
        <section key={doc.heading} aria-label={doc.heading} className="space-y-1">
          <h3 className="text-sm font-semibold">{doc.heading} <span className="font-normal text-muted-foreground">(version {doc.version})</span></h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{doc.text}</p>
        </section>
      ))}
    </>
  );
}
