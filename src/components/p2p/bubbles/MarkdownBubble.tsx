import ReactMarkdown from 'react-markdown';
import { AlertCircle, MoreVertical, Reply, Edit2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { getBubbleStyles } from './types';
import { BubbleFooter } from './BubbleFooter';
import { getInitials } from '@/components/chat/shared';
import type { BaseBubbleProps } from './types';

// Custom components for markdown rendering in chat bubbles
const markdownComponents = {
  // Headers - smaller for chat context
  h1: ({ children }: any) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-semibold mb-1.5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,

  // Paragraphs
  p: ({ children }: any) => <p className="text-sm mb-2 last:mb-0">{children}</p>,

  // Lists
  ul: ({ children }: any) => <ul className="list-disc list-inside text-sm mb-2 pl-2">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside text-sm mb-2 pl-2">{children}</ol>,
  li: ({ children }: any) => <li className="mb-0.5">{children}</li>,

  // Links
  a: ({ href, children }: any) => (
    <a href={href} className="text-purple-300 hover:text-purple-200 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),

  // Code
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="bg-black/30 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
    ) : (
      <code className="block bg-black/30 p-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap mb-2">
        {children}
      </code>
    ),
  pre: ({ children }: any) => (
    <pre className="bg-black/30 p-2 rounded text-xs font-mono overflow-x-auto mb-2">{children}</pre>
  ),

  // Block quotes
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-purple-400/50 pl-2 italic text-sm opacity-90 mb-2">
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: () => <hr className="border-t border-white/20 my-2" />,

  // Bold and italic (handled automatically by markdown)
  strong: ({ children }: any) => <strong className="font-bold">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,

  // Strikethrough
  del: ({ children }: any) => <del className="line-through opacity-70">{children}</del>,
};

export function MarkdownBubble({
  message,
  isOwn,
  onRetry,
  showSenderName,
  showSenderAvatar,
  senderName,
  onEdit,
  onDelete,
  onReply,
}: BaseBubbleProps) {
  const isFailed = message.status === 'failed';
  const bubbleStyles = getBubbleStyles(isOwn, isFailed);
  const displayName = senderName || 'Unknown';
  const hasActions = onEdit || onDelete || onReply;

  // Show avatar only for non-own messages in group mode
  const shouldShowAvatar = showSenderAvatar && !isOwn;

  return (
    <div className={`group flex gap-2 max-w-[80%] ${isOwn ? 'flex-row-reverse' : ''}`}>
      {/* Avatar for non-own messages */}
      {shouldShowAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className="bg-purple-600 text-white text-xs">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={`flex flex-col ${isOwn ? 'items-end' : ''}`}>
        {/* Sender name (group mode) */}
        {showSenderName && !isOwn && (
          <span className="text-xs text-gray-400 mb-1 px-1">
            {displayName}
          </span>
        )}

        <div className={`rounded-lg px-3 py-2 ${bubbleStyles}`}>
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
          {/* Inline failure indicator */}
          {isOwn && isFailed && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-red-300">
              <AlertCircle className="h-3 w-3" />
              <span>Failed to send</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="underline hover:text-white transition-colors ml-1"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          <BubbleFooter message={message} isOwn={isOwn} onRetry={onRetry} />
        </div>
      </div>

      {/* Message Actions Dropdown */}
      {hasActions && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? 'start' : 'end'}>
              {onReply && (
                <DropdownMenuItem onClick={onReply}>
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </DropdownMenuItem>
              )}
              {isOwn && onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {isOwn && onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-400 focus:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
