import { useEffect, useState, type ReactElement } from 'react';
import type { MDXComponents } from 'mdx/types';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import remarkGfm from 'remark-gfm';
import { applyGfmStrikethrough } from './mdx-preprocess';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { verifyDocument , type IntegrityVerdict } from '@/lib/mdx-integrity';

/**
 * Compile MDX source to a rendered element.
 *
 * Extracted from BaseOffice so the component stays under the file cap. A
 * compile failure keeps the LAST good render rather than blanking the page: the
 * source is still in the buffer, and a half-typed `<` should not make the
 * document disappear. `renderError` is reported alongside it so a document that
 * has NEVER rendered can say so instead of showing an empty body.
 */
export interface CompiledMdx {
  compiled: ReactElement | null;
  renderError: string | null;
}

export function useCompiledMdx(
  content: string,
  components: MDXComponents,
  /**
   * The hash the SERVER stored for this content, if any.
   *
   * Rendering executes the document, so the bytes have to be the bytes the
   * server stored. `null`/`undefined` means the server has no hash for it —
   * documents written before the field existed — which renders normally; a hash
   * that is present and different does not. See lib/mdx-integrity.ts for what
   * this covers and, more importantly, what it does not.
   */
  expectedHash?: string | null,
): CompiledMdx {
  const [compiled, setCompiled] = useState<ReactElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const compileContent = async (): Promise<void> => {
      try {
        debugLog('BaseOffice', 'Compiling MDX content...');
        // remark-gfm handles strikethrough, tables, autolinks, task-lists.
        // Pre-pass escapes JSX-significant chars inside `~~...~~` regions
        // so `~~value < 5~~` doesn't fail MDX parsing before remark-gfm
        // consumes it. See `applyGfmStrikethrough` for details.
        const verdict: IntegrityVerdict = await verifyDocument(content, expectedHash);
        if (verdict.status === 'mismatch') {
          debugLog('BaseOffice', 'MDX integrity mismatch', verdict);
          setCompiled(null);
          setRenderError(
            'This document was not displayed because it does not match what the ' +
              'server stored. Reload to fetch a fresh copy.',
          );
          return;
        }

        const processedContent: string = applyGfmStrikethrough(content);
        const result = await evaluate(processedContent, {
          ...runtime,
          remarkPlugins: [remarkGfm],
          useMDXComponents: () => components,
          baseUrl: window.location.origin,
        });
        debugLog('BaseOffice', 'MDX compilation successful');
        setCompiled(result.default({ components }));
        setRenderError(null);
      } catch (error) {
        // Shown, not only logged. `debugLog` compiles to a no-op outside dev,
        // so a document that cannot render was indistinguishable from an empty
        // one: title chrome, blank body, no error anywhere.
        //
        // That silence is why nobody noticed that MDX rendering fails for EVERY
        // document in the production build. `evaluate()` runs the compiled
        // document through `new AsyncFunction`, and the production CSP is
        // `script-src 'self' 'wasm-unsafe-eval'` with no `'unsafe-eval'` — dev
        // adds it for HMR, which is why every dev, tilt and Playwright run
        // renders fine. See docs/ROBUSTNESS.md: the fix is NOT to add
        // 'unsafe-eval', which would turn member-authored documents into stored
        // XSS executed in every viewer's browser.
        debugLog('BaseOffice', 'Error compiling MDX:', error);
        setRenderError(
          error instanceof Error && /unsafe-eval|Content Security Policy|CSP/i.test(error.message)
            ? 'This document could not be displayed: the app is not permitted to render document content in this build.'
            : 'This document could not be displayed. Its content may be malformed.',
        );
      }
    };

    runAsyncSetup(compileContent);
  }, [content, components, expectedHash]);

  return { compiled, renderError };
}
