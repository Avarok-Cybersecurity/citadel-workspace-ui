/**
 * P2PMessageInput Component
 *
 * Renders the message input area with markdown toolbar, preview,
 * file attachment button, and type selector.
 */

import React, { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Paperclip } from 'lucide-react';
import { MarkdownToolbar } from './MarkdownToolbar';
import { TypeSelectorBar } from './TypeSelectorBar';
import ReactMarkdown from 'react-markdown';
import type { MessageType } from '@/types/message-protocol';

interface P2PMessageInputProps {
  inputMessage: string;
  messageType: MessageType;
  showMarkdownPreview: boolean;
  canSendMessages: boolean;
  onInputChange: (value: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onSubmit: () => void;
  onFileClick: () => void;
  onFormat: (format: string, prefix: string, suffix: string) => void;
  onTogglePreview: () => void;
  onMessageTypeChange: (type: MessageType) => void;
}

export const P2PMessageInput = forwardRef<HTMLInputElement, P2PMessageInputProps>(
  function P2PMessageInput(
    {
      inputMessage,
      messageType,
      showMarkdownPreview,
      canSendMessages,
      onInputChange,
      onInputFocus,
      onInputBlur,
      onSubmit,
      onFileClick,
      onFormat,
      onTogglePreview,
      onMessageTypeChange,
    },
    ref
  ) {
    const isMarkdownMode = messageType === 'markdown';
    const isLiveDocMode = messageType === 'live_document';

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    };

    const getPlaceholder = () => {
      if (isMarkdownMode) return 'Type markdown message...';
      if (isLiveDocMode) return 'Document content (optional)...';
      return 'Type a message...';
    };

    return (
      <div className="border-t border-surface/50 bg-background">
        <MarkdownToolbar
          visible={isMarkdownMode}
          onFormat={onFormat}
          showPreview={showMarkdownPreview}
          onTogglePreview={onTogglePreview}
        />

        {isMarkdownMode && showMarkdownPreview && inputMessage.trim() && (
          <div className="p-4 border-b border-surface/50 bg-background">
            <p className="text-xs text-muted-foreground mb-2">Preview:</p>
            <div className="prose prose-sm dark:prose-invert max-w-none bg-surface rounded-lg p-3 max-h-32 overflow-y-auto">
              <ReactMarkdown>{inputMessage}</ReactMarkdown>
            </div>
          </div>
        )}

        <div className="p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onFileClick}
              disabled={!canSendMessages}
              className="text-muted-foreground hover:text-foreground hover:bg-foreground/10"
              title="Send file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              ref={ref}
              value={inputMessage}
              onChange={(e) => onInputChange(e.target.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              placeholder={getPlaceholder()}
              disabled={!canSendMessages}
              className="flex-1 bg-surface border-surface text-foreground placeholder-gray-400 focus:border-primary"
            />
            <Button
              type="submit"
              size="icon"
              // Icon-only, so it needs a name of its own: axe reports
              // `critical button-name` without it and a screen reader
              // announces nothing at all.
              aria-label="Send message"
              disabled={!canSendMessages || (!inputMessage.trim() && !isLiveDocMode)}
              className="bg-primary text-primary-foreground"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </div>

        <TypeSelectorBar
          selectedType={messageType}
          onTypeChange={onMessageTypeChange}
          disabled={!canSendMessages}
        />
      </div>
    );
  }
);
