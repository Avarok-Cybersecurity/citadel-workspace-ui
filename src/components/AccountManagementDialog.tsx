import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { connectionManager } from '@/lib/connection';
import { Trash2, UserCheck, Clock, Wifi } from 'lucide-react';
import type { ActiveSession } from '@/types/session-types';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import { DeleteConfirmDialog, ClearAllConfirmDialog } from './AccountConfirmDialogs';
import { shortPeerHandle } from '@/lib/peer-display';

interface AccountManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Put focus back where it was. Called once the content has closed. */
  onRestoreFocus?: () => void;
}

export function AccountManagementDialog({ isOpen, onClose, onRestoreFocus }: AccountManagementDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [storedSessions, setStoredSessions] = useState(connectionManager.getStoredSessionsArray());
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ username: string; serverAddress: string } | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);

  const currentConnection = connectionManager.getConnectionInfo();

  useEffect(() => {
    if (isOpen) {
      const loadActiveSessions = async (): Promise<void> => {
        try {
          const active: ActiveSession[] = await connectionManager.getActiveSessions();
          setActiveSessions(active);
        } catch (error) {
          debugLog('AccountManagementDialog', 'Failed to load active sessions:', error);
        }
      };
      runAsyncSetup(loadActiveSessions);
      setStoredSessions(connectionManager.getStoredSessionsArray());
    }
  }, [isOpen]);

  const handleRemoveSession = async (): Promise<void> => {
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

  const handleClearAll = async (): Promise<void> => {
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

  const handleSwitchAccount = async (username: string, serverAddress: string): Promise<void> => {
    try {
      await connectionManager.switchAccount(username, serverAddress);
      toast({ title: 'Account switched', description: `Switched to ${username}` });
      onClose();
    } catch (error) {
      toast({ title: 'Failed to switch account', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const formatLastConnected = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const diff: number = Date.now() - timestamp;
    const hours: number = Math.floor(diff / (1000 * 60 * 60));
    const days: number = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Recently';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="sm:max-w-[600px] bg-card border-surface"
          // Radix's own close-autofocus lands on `<body>` here, because this
          // dialog has no `DialogTrigger` to return to -- the button that opens
          // it is an ordinary Button next door. Measured: closing with Escape or
          // with Close both left `document.activeElement` on the body, so a
          // keyboard user was dropped at the top of the document.
          //
          // Restored HERE rather than in the caller's `onClose`, because the
          // content stays mounted for its exit animation: a focus call made when
          // the dialog closes is undone ~300ms later when the content unmounts.
          // This event is the moment Radix itself would have moved focus, which
          // is exactly the moment that works.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onRestoreFocus?.();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground">Manage Accounts</DialogTitle>
            <DialogDescription className="text-foreground/80">
              Manage your saved workspace accounts and sessions.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {activeSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-success-emphasis" />Active Sessions ({activeSessions.length})
                </h3>
                {activeSessions.map((session) => {
                  const isCurrentSession = currentConnection?.cid === session.cid;
                  return (
                    <div key={session.cid} className="flex items-center justify-between p-4 rounded-lg bg-background border border-success/30">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10"><AvatarFallback className="bg-success">{session.username[0].toUpperCase()}</AvatarFallback></Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-foreground font-medium">{session.username}</h4>
                            {isCurrentSession && <UserCheck className="h-4 w-4 text-success-emphasis" />}
                            <span className="text-xs text-success-emphasis bg-success/20 px-2 py-0.5 rounded">Active</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{session.server_address}</p>
                          <p className="text-xs text-muted-foreground">Session {shortPeerHandle(session.cid)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isCurrentSession && (
                          <Button variant="outline" size="sm" className="border-success text-success-emphasis hover:bg-success/20" onClick={() => handleSwitchAccount(session.username, session.server_address)}>Switch</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {storedSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />Saved Accounts ({storedSessions.length})
                </h3>
                {storedSessions.map((session) => {
                  const isConnected = currentConnection?.serverAddress === session.serverAddress && currentConnection?.username === session.username;
                  const hasActiveSession = activeSessions.some(a => a.username === session.username && a.server_address === session.serverAddress);
                  return (
                    <div key={`${session.username}-${session.serverAddress}`} className={`flex items-center justify-between p-4 rounded-lg bg-background border ${hasActiveSession ? 'border-success/30' : 'border-surface/50'}`}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary">{session.username[0].toUpperCase()}</AvatarFallback></Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-foreground font-medium">{session.username}</h4>
                            {isConnected && <UserCheck className="h-4 w-4 text-success-emphasis" />}
                            {hasActiveSession && <span className="text-xs text-success-emphasis bg-success/20 px-2 py-0.5 rounded">Active</span>}
                          </div>
                          <p className="text-sm text-muted-foreground">{session.serverAddress}</p>
                          {session.lastConnected && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Clock className="h-3 w-3" />{formatLastConnected(session.lastConnected)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isConnected && (
                          <Button variant="outline" size="sm" className="border-primary-accent text-primary-accent hover:bg-primary-accent/20" onClick={() => handleSwitchAccount(session.username, session.serverAddress)}>Switch</Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label={`Delete saved account ${session.username} on ${session.serverAddress}`} className="text-destructive hover:bg-destructive/20" onClick={() => { setSessionToDelete({ username: session.username, serverAddress: session.serverAddress }); setDeleteConfirmOpen(true); }}>
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
                <p className="text-muted-foreground mb-4">No accounts found. Join a workspace to get started.</p>
                <Button
                  variant="outline"
                  className="border-primary-accent text-primary-accent hover:bg-primary-accent/20"
                  onClick={() => {
                    onClose();
                    // Use a URL query param rather than a window event so the
                    // signal survives navigation timing (Landing's useEffect
                    // listener wouldn't be mounted yet if the dialog is opened
                    // from a non-landing route).
                    navigate('/?join=1');
                  }}
                >
                  Create Account
                </Button>
              </div>
            )}

            {storedSessions.length > 0 && (
              <div className="flex justify-end pt-4 border-t border-surface/50">
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
