import React, { useState, useRef, FormEvent, useEffect } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useRetry } from '../../hooks/use-retry';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Alert, AlertDescription } from '../ui/alert';
import { MessagingService } from '../../lib/messaging-service';

interface RetryableMessageSenderProps {
  recipientId: string;
  placeholder?: string;
  className?: string;
}

/**
 * A message input component with built-in retry mechanism
 * Will automatically retry failed message sends with exponential backoff
 * Also handles typing indicator functionality
 */
export const RetryableMessageSender: React.FC<RetryableMessageSenderProps> = ({
  recipientId,
  placeholder = 'Type a message...',
  className = ''
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagingService = MessagingService.getInstance();

  // Use the retry hook for sending messages with retry capability
  const {
    isLoading,
    error,
    retry,
    execute
  } = useRetry(
    async ({ content, recipient }: { content: string, recipient: string }) => {
      return await messagingService.sendMessage(recipient, content);
    },
    {
      maxRetries: 3,
      retryDelay: 1000,
      onSuccess: () => {
        // Clear input after successful send
        setInputValue('');
        inputRef.current?.focus();
      },
      onRetry: (attempt) => {
        console.info(`Retrying message send (attempt ${attempt})...`);
      }
    }
  );

  // Monitor typing activity to send typing indicators
  useEffect(() => {
    // When the user starts typing
    const handleTypingStarted = async () => {
      if (!isTyping) {
        setIsTyping(true);
        try {
          // Send typing indicator via messaging service
          await messagingService.sendTypingIndicator(recipientId, true);
        } catch (error) {
          console.error('Failed to send typing indicator:', error);
        }
      }

      // Reset the typing timer
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      // Set a timer to stop typing indicator after inactivity
      typingTimerRef.current = setTimeout(async () => {
        setIsTyping(false);
        try {
          // Stop typing indicator via messaging service
          await messagingService.sendTypingIndicator(recipientId, false);
        } catch (error) {
          console.error('Failed to clear typing indicator:', error);
        }
      }, 3000); // 3 seconds of inactivity to consider stopped typing
    };

    // If there's text and the user is typing
    if (inputValue.length > 0) {
      (async () => {
        await handleTypingStarted();
      })().catch(console.error);
    } else if (isTyping) {
      // If the input is cleared, stop typing immediately
      setIsTyping(false);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      // Send typing:stopped event via messaging service
      messagingService.sendTypingIndicator(recipientId, false)
        .catch(error => {
          console.error('Failed to clear typing indicator:', error);
        });
    }

    // Clean up timer on unmount
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [inputValue, isTyping, recipientId, messagingService]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    // Store the message content before clearing
    const content = inputValue;

    // Clear typing indicator immediately when sending
    setIsTyping(false);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    try {
      // Stop typing indicator via messaging service
      await messagingService.sendTypingIndicator(recipientId, false);
    } catch (error) {
      console.error('Failed to clear typing indicator:', error);
    }

    // Execute the send operation
    await execute({ content, recipient: recipientId });
  };

  return (
    <div className={className}>
      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription className="flex items-center justify-between">
            <span>Failed to send message: {error.message}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => retry()}
              disabled={isLoading}
              className="ml-2"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex space-x-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          ref={inputRef}
          className="flex-1 bg-[#444A6C] border-gray-700 text-white placeholder:text-gray-400"
        />
        <Button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          size="icon"
          className="bg-purple-500 hover:bg-purple-600 disabled:bg-purple-800 disabled:opacity-50"
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
};
