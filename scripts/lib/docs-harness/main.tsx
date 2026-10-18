/**
 * The shipped document host on a bare page: DocumentHost opening a blank Citadel Docs document
 * with the real cdoc worker and wasm, and no agent or workspace. `?offset=<css px>` shifts the
 * host right by that much (fractional values included), standing in for whatever the app's
 * sidebar and header widths add. Not part of the app: serve.mjs builds it on its own.
 */
import { createRoot, type Root } from 'react-dom/client';
import '@/index.css';
import '@/styles/brand-tokens.css';
import { DocumentHost } from '@/components/documents/DocumentHost';
import { loadCdocRuntime } from '@/lib/cdoc/runtime-loader';
import { browserDocumentFiles } from '@/lib/document-files';

const root: HTMLElement | null = document.getElementById('root');
if (root === null) throw new Error('the harness page has no #root');
const offset: number = Number(new URLSearchParams(window.location.search).get('offset') ?? '0');
if (!Number.isFinite(offset)) throw new Error('offset must be a number of CSS px');
const app: Root = createRoot(root);
app.render(
  <div className="h-screen" style={{ paddingLeft: offset }}>
    <DocumentHost
      nodeId="harness" appId="docs" title="Harness" permissions={{ edit: { enabled: true, reason: null } }}
      documentSource={{ kind: 'blank' }} loadCdocRuntime={loadCdocRuntime} commentAuthor="Harness"
      files={browserDocumentFiles} original={null}
    />
  </div>,
);
