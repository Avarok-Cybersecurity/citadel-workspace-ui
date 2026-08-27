import { useEffect, useState, type ReactElement } from 'react';
import type { MDXComponents } from 'mdx/types';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import remarkGfm from 'remark-gfm';
import { applyGfmStrikethrough } from './mdx-preprocess';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

/**
 * Compile MDX source to a rendered element.
 *
 * Extracted from BaseOffice so the component stays under the file cap; the
 * behaviour is unchanged, including the pre-pass. A compile failure keeps the
 * LAST good render rather than blanking the page: the source is still in the
 * buffer, and a half-typed `<` should not make the document disappear.
 */
export function useCompiledMdx(
  content: string,
  components: MDXComponents,
): ReactElement | null {
  const [compiled, setCompiled] = useState<ReactElement | null>(null);

  useEffect(() => {
    const compileContent = async () => {
      try {
        debugLog('BaseOffice', 'Compiling MDX content...');
        // remark-gfm handles strikethrough, tables, autolinks, task-lists.
        // Pre-pass escapes JSX-significant chars inside `~~...~~` regions
        // so `~~value < 5~~` doesn't fail MDX parsing before remark-gfm
        // consumes it. See `applyGfmStrikethrough` for details.
        const processedContent = applyGfmStrikethrough(content);
        const result = await evaluate(processedContent, {
          ...runtime,
          remarkPlugins: [remarkGfm],
          useMDXComponents: () => components,
          baseUrl: window.location.origin,
        });
        debugLog('BaseOffice', 'MDX compilation successful');
        setCompiled(result.default({ components }));
      } catch (error) {
        debugLog('BaseOffice', 'Error compiling MDX:', error);
      }
    };

    runAsyncSetup(compileContent);
  }, [content, components]);

  return compiled;
}
