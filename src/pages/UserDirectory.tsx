import React, { useState, useEffect } from 'react';
import { useWorkspace } from '@/lib/workspace-context';
import { UserSearch, UserData } from '@/components/user/UserSearch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Mail, UserPlus, Clock, Star, Filter, UserX, User, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { MessagingService } from '@/lib/messaging-service';
import { ConnectionService, ConnectionRequestStatus, ConnectionType } from '@/lib/connection-service';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { formatRelativeTime } from '@/lib/date-utils';
import { UserRole } from '@/types/workspace-entities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const UserDirectory = () => {
  const { state } = useWorkspace();
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState('all'); // 'all', 'online', 'favorites'
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const navigate = useNavigate();
  const messagingService = MessagingService.getInstance();
  const connectionService = ConnectionService.getInstance();
  
  // Get current user - in a real implementation, this would come from auth context
  const currentUserId = 'current-user';
  
  // Get all members from workspace state
  const allMembers = Object.values(state.members || {}).map(member => ({
    id: member.id,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    email: member.email,
    role: member.role,
    isOnline: Math.random() > 0.5, // Simulate online status
    lastActive: Date.now() - Math.floor(Math.random() * 10000000) // Simulate last active
  }));
  
  // Filter members based on tab
  const filteredMembers = allMembers.filter(member => {
    if (tab === 'online') return member.isOnline;
    if (tab === 'favorites') return Math.random() > 0.7; // Simulate favorites (replace with real data)
    return true; // 'all' tab
  });
  
  // Check if user is connected
  const isUserConnected = (userId: string): boolean => {
    return connectionService.canMessageUser(userId);
  };
  
  // Handle sending a message to a user
  const handleSendMessage = (userId: string) => {
    // Check if connected before navigating to messages
    if (isUserConnected(userId)) {
      navigate(`/messages?user=${userId}`);
    } else {
      toast({
        title: 'Connection Required',
        description: 'You need to establish a connection with this user before sending messages.',
        variant: 'destructive',
      });
    }
  };
  
  // Handle inviting a user to connect
  const handleInviteUser = (userId: string) => {
    setSelectedUser(allMembers.find(member => member.id === userId) || null);
    setRequestMessage(`I'd like to connect with you on Citadel Workspace.`);
    setRequestDialogOpen(true);
  };
  
  // Send connection request
  const sendConnectionRequest = async () => {
    if (!selectedUser) return;
    
    setSendingRequest(true);
    try {
      await connectionService.sendRegistrationRequest(selectedUser.id, requestMessage);
      
      toast({
        title: 'Request Sent',
        description: `Connection request sent to ${selectedUser.displayName}`,
        className: 'bg-[#343A5C] border-purple-800 text-purple-200',
      });
      
      setRequestDialogOpen(false);
    } catch (error) {
      console.error('Failed to send connection request:', error);
      toast({
        title: 'Error',
        description: 'Failed to send connection request',
        variant: 'destructive',
      });
    } finally {
      setSendingRequest(false);
    }
  };
  
  // Handle user selection from search
  const handleUserSelect = (user: UserData) => {
    setSelectedUser(user);
  };
  
  // Get role badge class
  const getRoleBadgeClass = (role?: UserRole) => {
    switch (role) {
      case UserRole.Owner:
        return 'bg-purple-500 hover:bg-purple-600';
      case UserRole.Admin:
        return 'bg-blue-500 hover:bg-blue-600';
      case UserRole.Member:
        return 'bg-green-500 hover:bg-green-600';
      case UserRole.Guest:
        return 'bg-gray-500 hover:bg-gray-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };
  
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">User Directory</h1>
        <p className="text-gray-400">
          Find and connect with people in your workspace
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - User search and directory */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-[#343A5C] border-gray-700 text-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>Find People</CardTitle>
              <CardDescription className="text-gray-400">
                Search for users by name or email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserSearch 
                onUserSelect={handleUserSelect} 
                enableInvite={true} 
                exclude={[currentUserId]}
                initialFocus={true}
              />
            </CardContent>
          </Card>
          
          <Card className="bg-[#343A5C] border-gray-700 text-white shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Workspace Directory</CardTitle>
                <CardDescription className="text-gray-400">
                  {filteredMembers.length} {tab === 'online' ? 'online' : tab === 'favorites' ? 'favorite' : ''} members
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                </Button>
              </div>
            </CardHeader>
            
            <Tabs defaultValue="all" value={tab} onValueChange={setTab} className="w-full">
              <div className="px-6">
                <TabsList className="bg-[#444A6C] w-full">
                  <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-[#4F5889] data-[state=active]:text-white">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="online" className="flex-1 data-[state=active]:bg-[#4F5889] data-[state=active]:text-white">
                    Online
                  </TabsTrigger>
                  <TabsTrigger value="favorites" className="flex-1 data-[state=active]:bg-[#4F5889] data-[state=active]:text-white">
                    Favorites
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="all" className="m-0">
                <div className="divide-y divide-gray-700">
                  {filteredMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-4 hover:bg-[#444A6C] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 relative">
                          <AvatarImage src={member.avatarUrl} />
                          <AvatarFallback className="bg-purple-900">{member.displayName.charAt(0)}</AvatarFallback>
                          {member.isOnline && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#343A5C]" />
                          )}
                        </Avatar>
                        <div>
                          <h3 className="font-medium text-white">{member.displayName}</h3>
                          <div className="flex items-center space-x-2">
                            {member.role && (
                              <Badge className={`text-xs ${getRoleBadgeClass(member.role)}`}>
                                {member.role}
                              </Badge>
                            )}
                            <span className="text-xs text-gray-400">
                              {member.isOnline ? 'Online' : `Last active ${formatRelativeTime(member.lastActive)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white hover:bg-gray-700"
                          onClick={() => handleSendMessage(member.id)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white hover:bg-gray-700"
                          onClick={() => handleInviteUser(member.id)}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="online" className="m-0">
                <div className="divide-y divide-gray-700">
                  {filteredMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-4 hover:bg-[#444A6C] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 relative">
                          <AvatarImage src={member.avatarUrl} />
                          <AvatarFallback className="bg-purple-900">{member.displayName.charAt(0)}</AvatarFallback>
                          <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#343A5C]" />
                        </Avatar>
                        <div>
                          <h3 className="font-medium text-white">{member.displayName}</h3>
                          <div className="flex items-center space-x-2">
                            {member.role && (
                              <Badge className={`text-xs ${getRoleBadgeClass(member.role)}`}>
                                {member.role}
                              </Badge>
                            )}
                            <span className="text-xs text-green-400">
                              Online now
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white hover:bg-gray-700"
                          onClick={() => handleSendMessage(member.id)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white hover:bg-gray-700"
                          onClick={() => handleInviteUser(member.id)}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="favorites" className="m-0">
                <div className="divide-y divide-gray-700">
                  {filteredMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-4 hover:bg-[#444A6C] transition-colors">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 relative">
                          <AvatarImage src={member.avatarUrl} />
                          <AvatarFallback className="bg-purple-900">{member.displayName.charAt(0)}</AvatarFallback>
                          {member.isOnline && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#343A5C]" />
                          )}
                        </Avatar>
                        <div>
                          <h3 className="font-medium text-white">{member.displayName}</h3>
                          <div className="flex items-center space-x-2">
                            {member.role && (
                              <Badge className={`text-xs ${getRoleBadgeClass(member.role)}`}>
                                {member.role}
                              </Badge>
                            )}
                            <span className="text-xs text-gray-400">
                              {member.isOnline ? 'Online' : `Last active ${formatRelativeTime(member.lastActive)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-purple-400 hover:text-white hover:bg-gray-700"
                        >
                          <Star className="h-4 w-4 fill-current" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white hover:bg-gray-700"
                          onClick={() => handleSendMessage(member.id)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
        
        {/* Right column - Selected user profile */}
        <div className="lg:col-span-1">
          {selectedUser ? (
            <Card className="bg-[#343A5C] border-gray-700 text-white h-full shadow-sm">
              <CardHeader className="text-center pb-2 relative">
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="absolute right-4 top-4 text-gray-400 hover:text-white hover:bg-gray-700"
                  onClick={() => setSelectedUser(null)}
                >
                  <UserX className="h-4 w-4" />
                </Button>
                <div className="flex flex-col items-center">
                  <Avatar className="h-20 w-20 mb-4 relative">
                    <AvatarImage src={selectedUser.avatarUrl} />
                    <AvatarFallback className="bg-purple-900 text-xl">{selectedUser.displayName.charAt(0)}</AvatarFallback>
                    {selectedUser.isOnline && (
                      <span className="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-[#343A5C]" />
                    )}
                  </Avatar>
                  <CardTitle className="text-xl mb-1">{selectedUser.displayName}</CardTitle>
                  {selectedUser.role && (
                    <Badge className={`mb-2 ${getRoleBadgeClass(selectedUser.role)}`}>
                      {selectedUser.role}
                    </Badge>
                  )}
                  {selectedUser.email && (
                    <CardDescription className="text-gray-400 flex items-center justify-center mb-2">
                      <Mail className="h-3.5 w-3.5 mr-1.5" />
                      {selectedUser.email}
                    </CardDescription>
                  )}
                  <CardDescription className="text-gray-400 flex items-center justify-center">
                    <Clock className="h-3.5 w-3.5 mr-1.5" />
                    {selectedUser.isOnline
                      ? 'Online now'
                      : `Last active ${formatRelativeTime(selectedUser.lastActive ?? Date.now())}`
                    }
                  </CardDescription>
                </div>
              </CardHeader>
              
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">About</h4>
                    <p className="text-sm text-gray-300">
                      This is a placeholder bio for demonstration purposes. In a real implementation, 
                      this would show the user's actual bio information from their profile.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Connection Status</h4>
                    <div className="p-3 rounded-md bg-[#444A6C] flex items-center space-x-3">
                      {isUserConnected(selectedUser.id) ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <div>
                            <p className="text-sm font-medium text-white">Connected</p>
                            <p className="text-xs text-gray-400">You can message this user</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                          <div>
                            <p className="text-sm font-medium text-white">Not Connected</p>
                            <p className="text-xs text-gray-400">Send a connection request to message this user</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Workspaces</h4>
                    <div className="space-y-2">
                      <div className="flex items-center p-2 bg-[#444A6C] rounded-md">
                        <div className="h-8 w-8 rounded-md bg-purple-600 flex items-center justify-center text-white font-semibold mr-3">
                          W
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">Workspace Alpha</p>
                          <p className="text-xs text-gray-400">3 shared offices</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              
              <CardFooter className="flex justify-between border-t border-gray-700 pt-4">
                {!isUserConnected(selectedUser.id) ? (
                  <Button 
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => handleInviteUser(selectedUser.id)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Connection Request
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      className="flex-1 mr-2 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Remove Connection
                    </Button>
                    <Button 
                      className="flex-1 ml-2 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => handleSendMessage(selectedUser.id)}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          ) : (
            <Card className="bg-[#343A5C] border-gray-700 text-white h-full shadow-sm flex flex-col justify-center items-center p-6">
              <div className="text-center">
                <Avatar className="h-20 w-20 mb-4 mx-auto">
                  <AvatarFallback className="bg-gray-700 text-gray-400">
                    <User className="h-10 w-10" />
                  </AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl mb-2">Select a User</CardTitle>
                <CardDescription className="text-gray-400 mb-6">
                  Click on a user or search to view their profile
                </CardDescription>
                <Button 
                  variant="outline" 
                  className="border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  onClick={() => document.querySelector('input')?.focus()}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search Users
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
      
      {/* Connection Request Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="bg-[#343A5C] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle>Send Connection Request</DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedUser && `Send a connection request to ${selectedUser.displayName}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-start space-x-3 p-3 bg-[#444A6C] rounded-md">
              <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-300">
                <p>The user will need to accept your P2P registration request before you can message them. P2P connection will be automatically established after registration is accepted.</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="request-message" className="text-sm font-medium text-gray-200">
                Add a message (optional)
              </label>
              <textarea
                id="request-message"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Tell them why you'd like to connect..."
                className="w-full h-24 px-3 py-2 bg-[#444A6C] border border-gray-700 rounded-md text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          
          <DialogFooter className="flex justify-end space-x-2">
            <Button 
              variant="ghost" 
              onClick={() => setRequestDialogOpen(false)}
              disabled={sendingRequest}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button 
              onClick={sendConnectionRequest}
              disabled={sendingRequest}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {sendingRequest ? 'Sending...' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserDirectory;
