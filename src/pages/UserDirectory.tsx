import React, { useEffect, useState } from 'react';
import { DirectoryTabContent } from './DirectoryTabContent';
import { describeFailure } from '@/lib/failure-message';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserSearch, UserData } from '@/components/user/UserSearch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { debugLog } from '@/lib/debug-config';
import { type MemberDisplay } from './MemberListItem';
import { UserProfileCard } from './UserProfileCard';
import { ConnectionRequestDialog } from './ConnectionRequestDialog';
import WorkspaceService from '@/lib/workspace-service';
import { AppLayout } from '@/components/layout/AppLayout';
import { useRegisteredPeers } from '@/hooks';
import { usePeerDiscovery } from '@/components/p2p/usePeerDiscovery';
import { sendPeerRegistration } from '@/lib/p2p/send-peer-registration';
import { connectionManager } from '@/lib/connection';

export const UserDirectory = () => {
  const { state } = useWorkspace();
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState('all');
  const [sendingRequest, setSendingRequest] = useState(false);
  const { registeredPeers } = useRegisteredPeers();
  // The only source that carries a username AND a cid, which registration needs.
  const { peers: discoveredPeers } = usePeerDiscovery(true);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const navigate = useNavigate();

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
    // Whether we can actually message them, from the store that knows.
    //
    // This read `connectionService.canMessageUser`, which can never return true
    // in production: the map it consults is written only by the demo
    // simulation's accept path, and real P2P registration goes through
    // peerRegistrationStore and never touches it. So every dot was off, the
    // Online tab was permanently empty, and the "Send Message" branch below was
    // unreachable code. A previous fix had already replaced Math.random() here
    // with something that looked authoritative and was constant false.
    isOnline: registeredPeers.some((peer) => peer.username === member.id),
    // Undefined, not 0: nothing tracks last-seen, and 0 rendered as 1970.
    lastActive: undefined,
  }));

  const filteredMembers = allMembers.filter(member => {
    if (tab === 'online') return member.isOnline;
    return true;
  });

  const isUserConnected = (username: string): boolean =>
    registeredPeers.some((peer) => peer.username === username);

  const handleSendMessage = (userId: string) => {
    if (isUserConnected(userId)) {
      // Two separate defects lived in the one line this replaces.
      //
      // It navigated to `?user=`, and Messages reads `?channel=` — so the
      // parameter was dropped and the user landed on "No conversation selected"
      // beside a peer list, i.e. Send Message did nothing at all.
      //
      // Renaming the parameter is not enough. A member `id` is a USERNAME (the
      // server derives it via `get_username_by_cid`), while Messages selects a
      // peer by CID (`registeredPeers.find(p => p.cid === selectedPeerCid)`).
      // Passing the username under the right parameter name still matches
      // nothing — it would look fixed and behave identically.
      const peer = registeredPeers.find((p) => p.username === userId);
      if (!peer) {
        toast({
          title: 'Cannot open that conversation',
          description:
            'This person is a workspace member but not a connected peer yet. Send them a connection request first.',
          variant: 'destructive',
        });
        return;
      }
      navigate(`/messages?channel=${peer.cid}`);
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
      // The real wire path. This called `connectionService.sendRegistrationRequest`,
      // which pushed the request into an in-memory array and scheduled a demo
      // simulation — nothing touched the socket, and the user was told "Request
      // Sent" for a request that did not exist.
      const ownCid = connectionManager.getConnectionInfo()?.cid;
      if (ownCid === undefined || ownCid === null) {
        throw new Error('Not connected to a workspace.');
      }

      // A member is identified by USERNAME; registration needs a CID. Only the
      // peer list carries both, so a member who has never appeared there cannot
      // be reached from here — and saying so is better than sending nothing and
      // reporting success.
      const peer = discoveredPeers.find((candidate) => candidate.username === selectedUser.id);
      if (!peer) {
        throw new Error(
          `${selectedUser.displayName} is not reachable yet. They need to be online at least once before a request can be sent.`,
        );
      }

      await sendPeerRegistration(BigInt(ownCid), BigInt(peer.cid), selectedUser.id);

      toast({
        title: 'Request Sent',
        description: `Connection request sent to ${selectedUser.displayName}. They will receive it when online.`,
        variant: 'success',
      });

      setRequestDialogOpen(false);
    } catch (error) {
      debugLog('UserDirectory', 'Failed to send connection request:', error);
      toast({
        title: 'Error',
        description: describeFailure(error, 'Failed to send connection request'),
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
              <CardTitle as="h2">Find People</CardTitle>
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
                <CardTitle as="h2">Workspace Directory</CardTitle>
                <CardDescription className="text-muted-foreground">
                  {filteredMembers.length} {tab === 'online' ? 'online ' : ''}members
                </CardDescription>
              </div>
            </CardHeader>

            <Tabs defaultValue="all" value={tab} onValueChange={setTab} className="w-full">
              <div className="px-6">
                <TabsList className="bg-card w-full">
                  <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground">All</TabsTrigger>
                  <TabsTrigger value="online" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground">Online</TabsTrigger>
                </TabsList>
              </div>

              {['all', 'online'].map(tabValue => (
                <TabsContent key={tabValue} value={tabValue} className="m-0">
                  <DirectoryTabContent
                    tab={tabValue as 'all' | 'online'}
                    members={filteredMembers}
                    totalMembers={allMembers.length}
                    onSendMessage={handleSendMessage}
                    onInvite={handleInviteUser}
                    onSelect={(userId) => setSelectedUser(allMembers.find((m) => m.id === userId) ?? null)}
                  />
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
