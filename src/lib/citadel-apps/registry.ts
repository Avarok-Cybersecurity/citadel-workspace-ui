/**
 * The Citadel Apps a document can be created in: the one list the app picker, the tree's
 * icon for a document node and (later) the file manager's extension mapping all read.
 *
 * There is deliberately no default app. A document records the app it opens in, and a
 * fallback here would silently turn "this node names no app" into "this node is a Docs
 * document", which is the distinction `node-app-metadata` exists to keep.
 */
import type { ComponentType } from 'react';
import { FileText, FileType, Sigma } from 'lucide-react';

export const CITADEL_APP_IDS = ['docs', 'pdf', 'latex'] as const;

export type CitadelAppId = (typeof CITADEL_APP_IDS)[number];

export interface CitadelApp {
  id: CitadelAppId;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Extensions, without the dot, of the files this app opens. */
  fileExtensions: readonly string[];
  /** Whether a document can be created in it yet; unavailable apps are listed as coming soon. */
  available: boolean;
}

export const CITADEL_APPS: readonly CitadelApp[] = [
  {
    id: 'docs',
    name: 'Citadel Docs',
    description: 'Rich documents: headings, lists, tables and comments.',
    icon: FileText,
    fileExtensions: ['cdoc'],
    available: true,
  },
  {
    id: 'pdf',
    name: 'Citadel PDF',
    description: 'View, annotate and sign PDF files.',
    icon: FileType,
    fileExtensions: ['pdf'],
    available: false,
  },
  {
    id: 'latex',
    name: 'Citadel LaTeX',
    description: 'Typeset papers and equations from LaTeX source.',
    icon: Sigma,
    fileExtensions: ['tex'],
    available: false,
  },
];

export function isCitadelAppId(value: unknown): value is CitadelAppId {
  return typeof value === 'string' && (CITADEL_APP_IDS as readonly string[]).includes(value);
}

/** The app with this id. Every id has an entry, so this cannot miss. */
export function citadelApp(id: CitadelAppId): CitadelApp {
  const app: CitadelApp | undefined = CITADEL_APPS.find((a: CitadelApp): boolean => a.id === id);
  if (!app) throw new Error(`Citadel App '${id}' has no registry entry`);
  return app;
}
