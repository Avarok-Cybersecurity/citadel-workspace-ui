import React, { useState, useEffect } from 'react';
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
import { connectionManager } from '@/lib/connection';
import { Trash2, UserCheck, Clock, Wifi } from 'lucide-react';
import type { ActiveSession } from '@/types/session-types';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { DeleteConfirmDialog, ClearAllConfirmDialog } from './AccountConfirmDialogs';

interface AccountManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountManagementDialog({ isOpen, onClose }: AccountManagementDialogProps) {
  const { toast } = useToast();
  const [storedSessions, setStoredSessions] = useState(connectionManager.getStoredSessionsArray());
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ username: string; serverAddress: string } | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);

  const currentConnection = connectionManager.getConnectionInfo();

  useEffect(() => {
    if (isOpen) {
      const loadActiveSessions = async () => {
        try {
          const active = await connectionManager.getActiveSessions();
          setActiveSessions(active);
        } catch (error) {
          debugLog('AccountManagementDialog', 'Failed to load active sessions:', error);
        }
      };
      runAsyncSetup(loadActiveSessions);
      setStoredSessions(connectionManager.getStoredSessionsArray());
    }
  }, [isOpen]);

  const handleRemoveSession = async () => {
    if (!sessionToDelete) return;
    try {
      await connectionManager.removeSession(sessionToDelete.username, sessionToDelete.serverAddress);
      setStoredSessions(connectionManager.getStoredSessionsArray());
      toast({ title: 'Account removed', description: `${sessionToDelete.username} has been removed from saved accounts.` });
      setDeleteConfirmOpen(false);
      setSessionToDelete(null);
    } catch (error) {
      toast({ title: 'Failed to remove account', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleClearAll = async () => {
    try {
      await connectionManager.removeAllSessions();
      setStoredSessions([]);
      toast({ title: 'All accounts cleared', description: 'All saved accounts have been removed.' });
      setClearAllConfirmOpen(false);
      onClose();
    } catch (error) {
      toast({ title: 'Failed to clear accounts', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleSwitchAccount = async (username: string, serverAddress: string) => {
    try {
      await connectionManager.switchAccount(username, serverAddress);
      toast({ title: 'Account switched', description: `Switched to ${username}` });
      onClose();
    } catch (error) {
      toast({ title: 'Failed to switch account', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const formatLastConnected = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
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

          <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {activeSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-400" />Active Sessions ({activeSessions.length})
                </h3>
                {activeSessions.map((session) => {
                  const isCurrentSession = currentConnection?.cid === session.cid;
                  return (
                    <div key={session.cid} className="flex items-center justify-between p-4 rounded-lg bg-[#1a1b26] border border-green-500/30">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10"><AvatarFallback className="bg-green-600">{session.username[0].toUpperCase()}</AvatarFallback></Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-white font-medium">{session.username}</h4>
                            {isCurrentSession && <UserCheck className="h-4 w-4 text-green-500" />}
                            <span className="text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded">Active</span>
                          </div>
                          <p className="text-sm text-gray-400">{session.server_address}</p>
                          <p className="text-xs text-gray-500">CID: {session.cid.toString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isCurrentSession && (
                          <Button variant="outline" size="sm" className="border-green-500 text-green-400 hover:bg-green-500/20" onClick={() => handleSwitchAccount(session.username, session.server_address)}>Switch</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {storedSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" />Saved Accounts ({storedSessions.length})
                </h3>
                {storedSessions.map((session) => {
                  const isConnected = currentConnection?.serverAddress === session.serverAddress && currentConnection?.username === session.username;
                  const hasActiveSession = activeSessions.some(a => a.username === session.username && a.server_address === session.serverAddress);
                  return (
                    <div key={`${session.username}-${session.serverAddress}`} className={`flex items-center justify-between p-4 rounded-lg bg-[#1a1b26] border ${hasActiveSession ? 'border-green-500/30' : 'border-[#262C4A]/50'}`}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10"><AvatarFallback className="bg-purple-600">{session.username[0].toUpperCase()}</AvatarFallback></Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-white font-medium">{session.username}</h4>
                            {isConnected && <UserCheck className="h-4 w-4 text-green-500" />}
                            {hasActiveSession && <span className="text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded">Active</span>}
                          </div>
                          <p className="text-sm text-gray-400">{session.serverAddress}</p>
                          {session.lastConnected && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Clock className="h-3 w-3" />{formatLastConnected(session.lastConnected)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isConnected && (
                          <Button variant="outline" size="sm" className="border-purple-500 text-purple-400 hover:bg-purple-500/20" onClick={() => handleSwitchAccount(session.username, session.serverAddress)}>Switch</Button>
                        )}
                        <Button variant="ghost" size="icon" className="text-red-400 hover:bg-red-500/20" onClick={() => { setSessionToDelete({ username: session.username, serverAddress: session.serverAddress }); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeSessions.length === 0 && storedSessions.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">No accounts found. Join a workspace to get started.</p>
                <Button
                  variant="outline"
                  className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
                  onClick={() => {
                    onClose();
                    // Dispatch custom event to trigger join overlay from landing page
                    window.dispatchEvent(new CustomEvent('open-join-workspace'));
                  }}
                >
                  Join Workspace
                </Button>
              </div>
            )}

            {storedSessions.length > 0 && (
              <div className="flex justify-end pt-4 border-t border-[#262C4A]/50">
                <Button variant="destructive" onClick={() => setClearAllConfirmOpen(true)}>Clear Saved Accounts</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} username={sessionToDelete?.username} onConfirm={handleRemoveSession} />
      <ClearAllConfirmDialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen} onConfirm={handleClearAll} />
    </>
  );
}
