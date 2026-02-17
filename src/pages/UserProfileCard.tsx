import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Mail, UserPlus, Clock, UserX, User, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';
import type { UserData } from '@/components/user/UserSearch';
import { getRoleBadgeClass } from './MemberListItem';

interface UserProfileCardProps {
  selectedUser: UserData | null;
  isConnected: boolean;
  onClose: () => void;
  onSendMessage: (userId: string) => void;
  onInvite: (userId: string) => void;
}

export function UserProfileCard({
  selectedUser,
  isConnected,
  onClose,
  onSendMessage,
  onInvite,
}: UserProfileCardProps) {
  if (!selectedUser) {
    return (
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
    );
  }

  return (
    <Card className="bg-[#343A5C] border-gray-700 text-white h-full shadow-sm">
      <CardHeader className="text-center pb-2 relative">
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-4 top-4 text-gray-400 hover:text-white hover:bg-gray-700"
          onClick={onClose}
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
              {isConnected ? (
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
        {!isConnected ? (
          <Button
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            onClick={() => onInvite(selectedUser.id)}
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
              onClick={() => onSendMessage(selectedUser.id)}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Message
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
