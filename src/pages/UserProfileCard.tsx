import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Mail, UserPlus, Clock, UserX, User, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { formatPresence } from '@/lib/date-utils';
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
      <Card className="bg-card border-border text-foreground h-full shadow-sm flex flex-col justify-center items-center p-6">
        <div className="text-center">
          <Avatar className="h-20 w-20 mb-4 mx-auto">
            <AvatarFallback className="bg-muted text-muted-foreground">
              <User className="h-10 w-10" />
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-xl mb-2">Select a User</CardTitle>
          <CardDescription className="text-muted-foreground mb-6">
            Click on a user or search to view their profile
          </CardDescription>
          <Button
            variant="outline"
            className="border-border text-foreground/80 hover:bg-accent hover:text-foreground"
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
    <Card className="bg-card border-border text-foreground h-full shadow-sm">
      <CardHeader className="text-center pb-2 relative">
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={onClose}
        >
          <UserX className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center">
          <Avatar className="h-20 w-20 mb-4 relative">
            {/* Decorative: the card's heading is this person's name. */}
            <AvatarImage src={selectedUser.avatarUrl} alt="" />
            <AvatarFallback className="bg-primary text-xl">{selectedUser.displayName.charAt(0)}</AvatarFallback>
            {selectedUser.isOnline && (
              <span className="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full bg-success ring-2 ring-card" />
            )}
          </Avatar>
          <CardTitle className="text-xl mb-1">{selectedUser.displayName}</CardTitle>
          {selectedUser.role && (
            <Badge className={`mb-2 ${getRoleBadgeClass(selectedUser.role)}`}>
              {selectedUser.role}
            </Badge>
          )}
          {selectedUser.email && (
            <CardDescription className="text-muted-foreground flex items-center justify-center mb-2">
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              {selectedUser.email}
            </CardDescription>
          )}
          <CardDescription className="text-muted-foreground flex items-center justify-center">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {formatPresence(selectedUser.isOnline ?? false, selectedUser.lastActive)}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">About</h4>
            <p className="text-sm text-muted-foreground italic">
              No bio provided
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Connection Status</h4>
            <div className="p-3 rounded-md bg-card flex items-center space-x-3">
              {isConnected ? (
                <>
                  <CheckCircle className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Connected</p>
                    <p className="text-xs text-muted-foreground">You can message this user</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-warning" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Not Connected</p>
                    <p className="text-xs text-muted-foreground">Send a connection request to message this user</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* TODO: Wire to real workspace membership data when available */}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between border-t border-border pt-4">
        {!isConnected ? (
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => onInvite(selectedUser.id)}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Send Connection Request
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              className="flex-1 mr-2 border-border text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              <UserX className="h-4 w-4 mr-2" />
              Remove Connection
            </Button>
            <Button
              className="flex-1 ml-2 bg-primary hover:bg-primary/90 text-primary-foreground"
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
