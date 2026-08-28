import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export const ProtocolWarning: React.FC = () => {
  const { state } = useWorkspace();
  const [visible, setVisible] = useState(false);

  // Show warning when it appears, hide after 10 seconds
  useEffect(() => {
    if (state.protocolWarning) {
      setVisible(true);
      
      // Auto-dismiss after 10 seconds
      const timer = setTimeout(() => {
        setVisible(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [state.protocolWarning]);
  
  if (!state.protocolWarning || !visible) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-md">
      <Alert className="bg-warning/15 border-warning/30 shadow-lg">
        <AlertTriangle className="h-4 w-4 text-warning-emphasis" />
        <AlertTitle className="text-warning-emphasis">Protocol Warning</AlertTitle>
        <AlertDescription className="text-warning-emphasis">
          <p>{state.protocolWarning.message}</p>
          <p className="text-xs mt-1 font-mono">Request type: {state.protocolWarning.requestType}</p>
        </AlertDescription>
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-2 right-2 text-warning-emphasis hover:bg-warning/15 hover:text-warning-emphasis"
          aria-label="Dismiss warning"
          onClick={() => setVisible(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    </div>
  );
};
