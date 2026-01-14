import React, { useEffect, useState } from 'react';

interface TypingIndicatorProps {
  isTyping?: boolean;
  peerName?: string;
  className?: string;
}

/**
 * Component that shows a typing indicator when a peer is typing
 */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  isTyping = false,
  peerName = 'Someone',
  className = ''
}) => {
  const [visible, setVisible] = useState(false);
  
  // Add a slight delay before showing the indicator to avoid flickering
  // for very brief typing events
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    if (isTyping) {
      timeout = setTimeout(() => {
        setVisible(true);
      }, 500);
    } else {
      setVisible(false);
    }
    
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isTyping]);
  
  if (!visible) return null;
  
  return (
    <div className={`flex items-center space-x-2 text-gray-400 text-sm py-2 px-3 ${className}`}>
      <span>{peerName} is typing</span>
      <div className="flex space-x-1">
        <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.5s' }} />
        <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.5s' }} />
        <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.5s' }} />
      </div>
    </div>
  );
};
