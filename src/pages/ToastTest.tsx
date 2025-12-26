import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function ToastTest() {
  const { toast } = useToast();

  const showDefaultToast = () => {
    toast({
      title: "Default Toast",
      description: "This is a default toast notification",
    });
  };

  const showDestructiveToast = () => {
    toast({
      title: "Destructive Toast",
      description: "This is a destructive toast notification",
      variant: "destructive",
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
      <h1 className="text-2xl font-bold text-white mb-8">Toast Test Page</h1>
      
      <div className="flex gap-4">
        <Button onClick={showDefaultToast}>
          Show Default Toast
        </Button>
        
        <Button onClick={showDestructiveToast} variant="destructive">
          Show Destructive Toast
        </Button>
      </div>
      
      <div className="mt-8 text-sm text-gray-400">
        <p>Click the buttons to test toast notifications.</p>
        <p>The destructive toast should have a red background.</p>
      </div>
    </div>
  );
}