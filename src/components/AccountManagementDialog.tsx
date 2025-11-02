import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { connectionManager } from '@/lib/connection-manager';
import { Trash2, UserCheck, UserX, Clock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AccountManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountManagementDialog({ isOpen, onClose }: AccountManagementDialogProps) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState(connectionManager.getStoredSessionsArray());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ username: string; serverAddress: string } | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  
  const currentConnection = connectionManager.getConnectionInfo();

  const handleRemoveSession = async () => {
    if (!sessionToDelete) return;
    
    try {
      await connectionManager.removeSession(sessionToDelete.username, sessionToDelete.serverAddress);
      setSessions(connectionManager.getStoredSessionsArray());
      
      toast({
        title: 'Account removed',
        description: `${sessionToDelete.username} has been removed from saved accounts.`,
      });
      
      setDeleteConfirmOpen(false);
      setSessionToDelete(null);
    } catch (error) {
      toast({
        title: 'Failed to remove account',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleClearAll = async () => {
    try {
      await connectionManager.removeAllSessions();
      setSessions([]);
      
      toast({
        title: 'All accounts cleared',
        description: 'All saved accounts have been removed.',
      });
      
      setClearAllConfirmOpen(false);
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to clear accounts',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleSwitchAccount = async (username: string, serverAddress: string) => {
    try {
      await connectionManager.switchAccount(username, serverAddress);
      
      toast({
        title: 'Account switched',
        description: `Switched to ${username}`,
      });
      
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to switch account',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const formatLastConnected = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Recently';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] bg-[#282A42] border-[#3D3F5A]">
          <DialogHeader>
            <DialogTitle className="text-white">Manage Accounts</DialogTitle>
            <DialogDescription className="text-gray-300">
              Manage your saved workspace accounts and sessions.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 space-y-4">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No saved accounts found.
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const isConnected = currentConnection?.serverAddress === session.serverAddress &&
                    session.username === session.username;
                  
                  return (
                    <div
                      key={`${session.username}-${session.serverAddress}`}
                      className="flex items-center justify-between p-4 rounded-lg bg-[#1a1b26] border border-[#262C4A]/50"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-purple-600">
                            {session.username[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-white font-medium">{session.username}</h4>
                            {isConnected && (
                              <UserCheck className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                          <p className="text-sm text-gray-400">{session.serverAddress}</p>
                          {session.lastConnected && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              {formatLastConnected(session.lastConnected)}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!isConnected && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
                            onClick={() => handleSwitchAccount(session.username, session.serverAddress)}
                          >
                            Switch
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:bg-red-500/20"
                          onClick={() => {
                            setSessionToDelete({ username: session.username, serverAddress: session.serverAddress });
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {sessions.length > 0 && (
              <div className="flex justify-end pt-4 border-t border-[#262C4A]/50">
                <Button
                  variant="destructive"
                  onClick={() => setClearAllConfirmOpen(true)}
                >
                  Clear All Accounts
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-[#282A42] border-[#3D3F5A]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Account</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to remove {sessionToDelete?.username} from your saved accounts?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleRemoveSession}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen}>
        <AlertDialogContent className="bg-[#282A42] border-[#3D3F5A]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Clear All Accounts</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to remove all saved accounts? This will sign you out and remove
              all stored credentials. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleClearAll}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}