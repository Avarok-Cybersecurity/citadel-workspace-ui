import React, { useState, useEffect } from 'react';
import { 
  ConnectionRequest, 
  ConnectionRequestStatus, 
  ConnectionService,
  ConnectionType,
  UserConnectionPreferences
} from '@/lib/connection-service';
import { 
  Bell, 
  Check, 
  X, 
  Settings, 
  UserPlus, 
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/date-utils';
import { useWorkspace } from '@/lib/workspace-context';

interface ConnectionRequestsProps {
  className?: string;
}

export const ConnectionRequests: React.FC<ConnectionRequestsProps> = ({ 
  className = ''
}) => {
  const [pendingRequests, setPendingRequests] = useState<ConnectionRequest[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserConnectionPreferences>({
    autoAcceptRegistrations: false
  });
  const connectionService = ConnectionService.getInstance();
  const { state } = useWorkspace();

  useEffect(() => {
    // Load initial requests
    setPendingRequests(connectionService.getPendingRequests());
    
    // Load user preferences
    setPreferences(connectionService.getUserPreferences());
    
    // Set up handlers for new requests and status changes
    const handleNewRequest = (request: ConnectionRequest) => {
      setPendingRequests(prev => [...prev, request]);
      
      // Show a toast notification
      toast({
        title: 'New Connection Request',
        description: `${getMemberName(request.requesterId)} wants to connect with you`,
        className: 'bg-[#343A5C] border-purple-800 text-purple-200',
      });
    };
    
    const handleStatusChange = (request: ConnectionRequest) => {
      // If the request was accepted, rejected, or canceled, remove from pending
      if (request.status !== ConnectionRequestStatus.PENDING) {
        setPendingRequests(prev => prev.filter(r => r.id !== request.id));
      }
    };
    
    connectionService.setNewConnectionRequestHandler(handleNewRequest);
    connectionService.setConnectionStatusChangeHandler(handleStatusChange);
    
    // Cleanup handlers on unmount
    return () => {
      connectionService.cleanup();
    };
    // Mount only: connectionService/getMemberName are stable singletons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Get member name from the workspace state
  const getMemberName = (userId: string): string => {
    const member = state.members[userId];
    return member?.displayName || userId;
  };
  
  // Get member avatar from the workspace state
  const getMemberAvatar = (userId: string): string | undefined => {
    const member = state.members[userId];
    return member?.avatarUrl;
  };
  
  // Accept a connection request
  const handleAccept = async (requestId: string) => {
    try {
      await connectionService.acceptConnectionRequest(requestId);
      
      toast({
        title: 'Connection Accepted',
        description: 'You are now connected with this user',
        className: 'bg-green-800 border-green-700 text-green-100',
      });
    } catch (error) {
      console.error('Failed to accept connection:', error);
      toast({
        title: 'Error',
        description: 'Failed to accept connection request',
        variant: 'destructive',
      });
    }
  };
  
  // Reject a connection request
  const handleReject = async (requestId: string) => {
    try {
      await connectionService.rejectConnectionRequest(requestId);
      
      toast({
        title: 'Connection Rejected',
        description: 'The connection request has been rejected',
        variant: 'default',
      });
    } catch (error) {
      console.error('Failed to reject connection:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject connection request',
        variant: 'destructive',
      });
    }
  };
  
  // Update user preferences
  const handlePreferencesChange = (newPreferences: Partial<UserConnectionPreferences>) => {
    const updatedPreferences = {
      ...preferences,
      ...newPreferences
    };
    setPreferences(updatedPreferences);
    connectionService.setUserPreferences(updatedPreferences);
    
    toast({
      title: 'Preferences Updated',
      description: 'Your connection preferences have been updated',
      className: 'bg-[#343A5C] border-purple-800 text-purple-200',
    });
  };
  
  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className="relative text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <Bell className="h-5 w-5" />
            {pendingRequests.length > 0 && (
              <span className="absolute top-0 right-0 h-4 w-4 rounded-full bg-red-500 text-xs flex items-center justify-center text-white">
                {pendingRequests.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-80 p-0 bg-[#343A5C] border-gray-700 text-white shadow-lg" 
          align="end"
        >
          <CardHeader className="px-4 py-3 border-b border-gray-700 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Connection Requests</CardTitle>
              <CardDescription className="text-gray-400">
                {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#444A6C] border-gray-700 text-white">
                <DropdownMenuLabel>Options</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  Connection Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent className="px-0 py-0 max-h-80 overflow-auto">
            {pendingRequests.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <UserPlus className="h-8 w-8 mx-auto mb-2 text-gray-500" />
                <p>No pending connection requests</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="p-4 hover:bg-[#444A6C] transition-colors">
                    <div className="flex items-start space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={getMemberAvatar(request.requesterId)} />
                        <AvatarFallback className="bg-purple-900">
                          {getMemberName(request.requesterId).charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-white truncate">
                            {getMemberName(request.requesterId)}
                          </p>
                          <Badge className="bg-blue-500">
                            {request.type === ConnectionType.P2P_REGISTRATION ? 'Registration' : 'Connection'}
                          </Badge>
                        </div>
                        {request.message && (
                          <p className="text-sm text-gray-300 mt-1">
                            "{request.message}"
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatRelativeTime(request.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-gray-300 hover:text-white hover:bg-gray-700"
                        onClick={() => handleReject(request.id)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Decline
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => handleAccept(request.id)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </PopoverContent>
      </Popover>
      
      {/* Connection Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-[#343A5C] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle>Connection Settings</DialogTitle>
            <DialogDescription className="text-gray-400">
              Configure your connection preferences
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium text-white">Auto-accept Registrations</h4>
                <p className="text-sm text-gray-400">
                  Automatically accept P2P registration requests from other users
                </p>
              </div>
              <Switch 
                checked={preferences.autoAcceptRegistrations}
                onCheckedChange={(checked) => handlePreferencesChange({ autoAcceptRegistrations: checked })}
              />
            </div>
            
            <div className="flex items-start space-x-2 p-3 bg-[#444A6C] rounded-md">
              <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-300">
                <p className="mb-1">P2P registration requests require manual acceptance unless auto-accept is enabled.</p>
                <p>P2P connection requests are always auto-accepted.</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => setSettingsOpen(false)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConnectionRequests;
