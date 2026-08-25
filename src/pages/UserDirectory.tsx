import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserSearch, UserData } from '@/components/user/UserSearch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionService } from '@/lib/connection-service';
import { toast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { debugLog } from '@/lib/debug-config';
import { MemberListItem, type MemberDisplay } from './MemberListItem';
import { UserProfileCard } from './UserProfileCard';
import { ConnectionRequestDialog } from './ConnectionRequestDialog';
import WorkspaceService from '@/lib/workspace-service';
import { AppLayout } from '@/components/layout/AppLayout';

export const UserDirectory = () => {
  const { state } = useWorkspace();
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState('all');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const navigate = useNavigate();
  const connectionService = ConnectionService.getInstance();

  // Request member list on mount
  const [searchParams] = useSearchParams();
  const domainIdParam = searchParams.get('nodeId') || state.workspace?.id;
  useEffect(() => {
    debugLog('UserDirectory', 'Requesting member list for domain:', domainIdParam);
    WorkspaceService.listMembers(domainIdParam || undefined)
      .catch(err => debugLog('UserDirectory', 'Failed to load members:', err));
  }, [domainIdParam]);

  const currentUserId = state.currentUser?.id || state.currentUser?.username || '';

  const allMembers: MemberDisplay[] = Object.values(state.members || {}).map(member => ({
    id: member.id,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    email: member.email,
    role: member.role,
    isOnline: connectionService.canMessageUser(member.id),
    // Undefined, not 0: nothing tracks last-seen, and 0 rendered as 1970.
    lastActive: undefined,
  }));

  const filteredMembers = allMembers.filter(member => {
    if (tab === 'online') return member.isOnline;
    return true;
  });

  const isUserConnected = (userId: string): boolean => {
    return connectionService.canMessageUser(userId);
  };

  const handleSendMessage = (userId: string) => {
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

  const handleInviteUser = (userId: string) => {
    setSelectedUser(allMembers.find(member => member.id === userId) || null);
    setRequestMessage(`I'd like to connect with you on Citadel Workspace.`);
    setRequestDialogOpen(true);
  };

  const sendConnectionRequest = async () => {
    if (!selectedUser) return;

    setSendingRequest(true);
    try {
      await connectionService.sendRegistrationRequest(selectedUser.id, requestMessage);

      toast({
        title: 'Request Sent',
        description: `Connection request sent to ${selectedUser.displayName}`,
        variant: 'success',
      });

      setRequestDialogOpen(false);
    } catch (error) {
      debugLog('UserDirectory', 'Failed to send connection request:', error);
      toast({
        title: 'Error',
        description: 'Failed to send connection request',
        variant: 'destructive',
      });
    } finally {
      setSendingRequest(false);
    }
  };

  const handleUserSelect = (user: UserData) => {
    setSelectedUser(user);
  };

  return (
    <AppLayout>
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">User Directory</h1>
        <p className="text-muted-foreground">Find and connect with people in your workspace</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - User search and directory */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border text-foreground shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>Find People</CardTitle>
              <CardDescription className="text-muted-foreground">Search for users by name or email</CardDescription>
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

          <Card className="bg-card border-border text-foreground shadow-sm">
            <CardHeader className="pb-3">
              <div>
                <CardTitle>Workspace Directory</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {filteredMembers.length} {tab === 'online' ? 'online ' : ''}members
                </CardDescription>
              </div>
            </CardHeader>

            <Tabs defaultValue="all" value={tab} onValueChange={setTab} className="w-full">
              <div className="px-6">
                <TabsList className="bg-card w-full">
                  <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-foreground text-muted-foreground">All</TabsTrigger>
                  <TabsTrigger value="online" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-foreground text-muted-foreground">Online</TabsTrigger>
                </TabsList>
              </div>

              {['all', 'online'].map(tabValue => (
                <TabsContent key={tabValue} value={tabValue} className="m-0">
                  <div className="divide-y divide-border">
                    {filteredMembers.map((member) => (
                      <MemberListItem
                        key={member.id}
                        member={member}
                        variant={tabValue as 'all' | 'online'}
                        onSendMessage={handleSendMessage}
                        onInvite={handleInviteUser}
                        onSelect={(userId) => setSelectedUser(allMembers.find((m) => m.id === userId) ?? null)}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </Card>
        </div>

        {/* Right column - Selected user profile */}
        <div className="lg:col-span-1">
          <UserProfileCard
            selectedUser={selectedUser}
            isConnected={selectedUser ? isUserConnected(selectedUser.id) : false}
            onClose={() => setSelectedUser(null)}
            onSendMessage={handleSendMessage}
            onInvite={handleInviteUser}
          />
        </div>
      </div>

      <ConnectionRequestDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        selectedUser={selectedUser}
        requestMessage={requestMessage}
        onRequestMessageChange={setRequestMessage}
        sendingRequest={sendingRequest}
        onSend={sendConnectionRequest}
      />
    </div>
    </AppLayout>
  );
};

export default UserDirectory;
