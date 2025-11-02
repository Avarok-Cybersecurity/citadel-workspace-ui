import React, { useEffect } from 'react';
import { useWorkspace } from '../../lib/workspace-context';
import { MemberSkeletonLoader } from '../ui/skeleton-member';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { User, UserRole } from '../../types/workspace-entities';

interface MemberProfileProps {
  userId: string;
  showActions?: boolean;
}

// Extended user information (would typically come from a more detailed API)
interface ExtendedUserInfo {
  email?: string;
  joinDate?: number;
  status?: string;
  activity?: Array<{
    action: string;
    timestamp: number;
  }>;
}

/**
 * Member profile component that displays user data and integrates with workspace state
 */
export const MemberProfile: React.FC<MemberProfileProps> = ({ 
  userId,
  showActions = true
}) => {
  const { state } = useWorkspace();
  
  // Get member data from workspace state
  const member = state.members[userId];
  const isLoading = state.loading.members;
  
  // Mock extended user info - in a real app, this would come from an API
  const extendedInfo: ExtendedUserInfo = {
    email: `${member?.username || 'user'}@example.com`,
    joinDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    status: 'Active',
    activity: [
      { action: 'Joined workspace', timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 },
      { action: 'Created a new room', timestamp: Date.now() - 15 * 24 * 60 * 60 * 1000 },
      { action: 'Updated profile', timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 }
    ]
  };
  
  // Fetch member data if not available
  useEffect(() => {
    const fetchMemberData = async () => {
      if (!member && !isLoading) {
        try {
          await invoke('get_member', { userId });
        } catch (error) {
          console.error('Failed to load member:', error);
        }
      }
    };
    
    fetchMemberData();
  }, [userId, member, isLoading]);
  
  // Show skeleton loader while loading
  if (isLoading || !member) {
    return <MemberSkeletonLoader />;
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="h-16 w-16 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-xl">
          {member.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-white">{member.displayName}</h2>
          <p className="text-gray-400">@{member.username}</p>
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant="outline" className="bg-purple-900 bg-opacity-30 text-purple-300 border-purple-800">
              {member.role || UserRole.Member}
            </Badge>
            {member.isOnline && (
              <Badge variant="outline" className="bg-green-900 bg-opacity-30 text-green-300 border-green-800">
                Online
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="info">
        <TabsList className="bg-gray-800">
          <TabsTrigger value="info">Information</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="info" className="mt-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle>Member Information</CardTitle>
              <CardDescription>Basic information about this member</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-400">Email</p>
                <p className="text-white">{extendedInfo.email || 'No email provided'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-400">Joined</p>
                <p className="text-white">{
                  extendedInfo.joinDate 
                    ? new Date(extendedInfo.joinDate).toLocaleDateString() 
                    : 'Unknown'
                }</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-400">Status</p>
                <p className="text-white">{extendedInfo.status || 'No status'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="permissions" className="mt-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
              <CardDescription>Member's permissions in this workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {member.permissions ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(member.permissions).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <div className={`h-3 w-3 rounded-full ${value ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm">{key.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400">No permissions data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="activity" className="mt-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Member's recent actions</CardDescription>
            </CardHeader>
            <CardContent>
              {extendedInfo.activity && extendedInfo.activity.length > 0 ? (
                <div className="space-y-2">
                  {extendedInfo.activity.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-700">
                      <span className="text-sm text-white">{item.action}</span>
                      <span className="text-xs text-gray-400">{
                        item.timestamp 
                          ? new Date(item.timestamp).toLocaleString() 
                          : 'Unknown'
                      }</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400">No recent activity</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {showActions && (
        <div className="flex space-x-3">
          <button className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors">
            Message
          </button>
          <button className="px-4 py-2 bg-transparent border border-gray-700 text-gray-300 rounded-md hover:bg-gray-800 transition-colors">
            Edit Permissions
          </button>
        </div>
      )}
    </div>
  );
};
