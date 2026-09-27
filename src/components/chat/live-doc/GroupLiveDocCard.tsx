/** A live document shared in an office or room chat, as its message shows it. */
import React from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface OpenLiveDoc { id: string; title: string }

export function GroupLiveDocCard({ doc, onOpen }: { doc: OpenLiveDoc; onOpen: (doc: OpenLiveDoc) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-3" data-testid="group-live-doc">
      <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{doc.title}</p>
        <p className="text-xs opacity-80">Live document: everyone in this chat can edit it</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => onOpen(doc)} data-testid="group-live-doc-open">
        Open
      </Button>
    </div>
  );
}
