/**
 * Chat Markdown, rendered: one renderer for every conversation that carries Markdown messages
 * (P2P bubbles and group chats alike). Moved verbatim out of p2p/bubbles/MarkdownBubble.tsx.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import { memo , type ReactNode , type NamedExoticComponent } from 'react';
import { documentAnchor } from '@/components/shared/DocumentLink';

/**
 * The markdown parse, memoized on the text alone.
 *
 * The composer's value lives in the chat root, so every keystroke re-renders
 * the whole loaded history — and each markdown bubble ran a full remark parse
 * again, for text that had not changed. The cost grows with how far back the
 * user has scrolled, which is exactly the class that looks fine on a fresh
 * account and janks after a month.
 *
 * `content` is a string, so this memo holds even while the surrounding bubble
 * re-renders with fresh inline callbacks — no change to the bubble's API.
 */
export const RenderedMarkdown: NamedExoticComponent<{ content: string; }> = memo(function RenderedMarkdown({ content }: { content: string }): JSX.Element {
  return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
});

type ChildrenProps = { children?: ReactNode };

// Custom components for markdown rendering in chat bubbles
const markdownComponents: Components = {
  // Headers - smaller for chat context
  h1: ({ children }: ChildrenProps): JSX.Element => <h1 className="text-lg font-bold mb-2">{children}</h1>,
  h2: ({ children }: ChildrenProps): JSX.Element => <h2 className="text-base font-semibold mb-1.5">{children}</h2>,
  h3: ({ children }: ChildrenProps): JSX.Element => <h3 className="text-sm font-semibold mb-1">{children}</h3>,

  // Paragraphs
  p: ({ children }: ChildrenProps): JSX.Element => <p className="text-sm mb-2 last:mb-0">{children}</p>,

  // Lists
  ul: ({ children }: ChildrenProps): JSX.Element => <ul className="list-disc list-inside text-sm mb-2 pl-2">{children}</ul>,
  ol: ({ children }: ChildrenProps): JSX.Element => <ol className="list-decimal list-inside text-sm mb-2 pl-2">{children}</ol>,
  li: ({ children }: ChildrenProps): JSX.Element => <li className="mb-0.5">{children}</li>,

  // Links. This used to force target="_blank" on everything, which meant a peer
  // linking you to a page in your own workspace opened a SECOND copy of the app
  // in a new tab — a fresh WASM client and a fresh agent connection — rather
  // than moving you there. DocumentLink sends internal links to the router and
  // keeps the new tab (and its noopener) for links that really do leave.
  a: documentAnchor,

  // Code. Every `code` is styled as a span, and the <pre> of a fenced block
  // undoes that for the code inside it. This branched on an `inline` prop,
  // which react-markdown 9 no longer passes -- so every inline span took the
  // block branch and sat on a line of its own.
  code: ({ children }: ChildrenProps): JSX.Element => (
    <code className="bg-black/30 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
  ),
  pre: ({ children }: ChildrenProps): JSX.Element => (
    <pre className="bg-black/30 p-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap mb-2 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),

  // Block quotes
  blockquote: ({ children }: ChildrenProps): JSX.Element => (
    <blockquote className="border-l-2 border-primary-accent/50 pl-2 italic text-sm opacity-90 mb-2">
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: (): JSX.Element => <hr className="border-t border-border my-2" />,

  // Bold and italic (handled automatically by markdown)
  strong: ({ children }: ChildrenProps): JSX.Element => <strong className="font-bold">{children}</strong>,
  em: ({ children }: ChildrenProps): JSX.Element => <em className="italic">{children}</em>,

  // Strikethrough
  del: ({ children }: ChildrenProps): JSX.Element => <del className="line-through opacity-70">{children}</del>,
};
