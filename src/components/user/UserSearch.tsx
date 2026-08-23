import React, { useState, useEffect, useRef } from 'react';
import { debugLog } from '@/lib/debug-config';
import { Search, User, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Badge } from '@/components/ui/badge';
import type { UserData, UserSearchProps } from './user-search-types';
import { getRoleBadgeClass } from './user-search-types';

// Re-export types for backward compatibility
export type { UserData } from './user-search-types';

export const UserSearch: React.FC<UserSearchProps> = ({
  onUserSelect,
  enableInvite = false,
  className = '',
  placeholder = 'Search users...',
  exclude = [],
  initialFocus = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { state } = useWorkspace();

  // Focus input on mount if initialFocus is true
  useEffect(() => {
    if (initialFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [initialFocus]);

  // Handle click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Search users
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchTerm.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);

      try {
        const members = Object.values(state.members || {});

        const filteredMembers = members
          .filter(member =>
            !exclude.includes(member.id) &&
            (
              member.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase()))
            )
          )
          .map(member => ({
            id: member.id,
            displayName: member.displayName,
            avatarUrl: member.avatarUrl,
            email: member.email,
            role: member.role,
            isOnline: Math.random() > 0.5,
            lastActive: Date.now() - Math.floor(Math.random() * 1000000)
          }));

        setResults(filteredMembers);
      } catch (error) {
        debugLog('UserSearch', 'Error searching users:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimeout = setTimeout(searchUsers, 300);

    return () => {
      clearTimeout(debounceTimeout);
    };
  }, [searchTerm, state.members, exclude]);

  const handleFocus = () => {
    setShowResults(true);
  };

  const handleSelectUser = (user: UserData) => {
    if (onUserSelect) {
      onUserSelect(user);
    }
    setShowResults(false);
    setSearchTerm('');
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    inputRef.current?.focus();
  };

  const getRecentUsers = (): UserData[] => {
    const members = Object.values(state.members || {});

    return members
      .filter(member => !exclude.includes(member.id))
      .slice(0, 5)
      .map(member => ({
        id: member.id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        email: member.email,
        role: member.role,
        isOnline: Math.random() > 0.5,
        lastActive: Date.now() - Math.floor(Math.random() * 1000000)
      }));
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center bg-card rounded-md border border-gray-700">
        <Search className="h-4 w-4 text-muted-foreground ml-3" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={handleFocus}
          className="border-0 bg-transparent text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 mr-1 text-muted-foreground hover:text-foreground hover:bg-gray-700"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showResults && (
        <Card
          ref={resultsRef}
          className="absolute z-50 w-full mt-1 bg-card border-gray-700 text-foreground shadow-lg overflow-hidden"
        >
          <CardHeader className="p-3 border-b border-gray-700">
            <CardTitle className="text-sm">
              {searchTerm ? 'Search Results' : 'Recent Users'}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {loading ? 'Searching...' : searchTerm ? `Found ${results.length} users` : "People you've interacted with"}
            </CardDescription>
          </CardHeader>
          <ScrollArea className="max-h-64">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-8 flex justify-center items-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-500"></div>
                </div>
              ) : (
                <ul className="divide-y divide-gray-700">
                  {(results.length > 0 ? results : searchTerm ? [] : getRecentUsers()).map((user) => (
                    <li
                      key={user.id}
                      className="hover:bg-card transition-colors p-3 cursor-pointer"
                      onClick={() => handleSelectUser(user)}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 relative">
                          <AvatarImage src={user.avatarUrl} />
                          <AvatarFallback className="bg-purple-900">{user.displayName.charAt(0)}</AvatarFallback>
                          {user.isOnline && (
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card" />
                          )}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.displayName}</p>
                          {user.email && (
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          )}
                        </div>
                        {user.role && (
                          <Badge className={getRoleBadgeClass(user.role)}>
                            {user.role}
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}

                  {results.length === 0 && searchTerm && (
                    <li className="p-6 text-center text-muted-foreground">
                      <User className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                      <p>No users found</p>
                      {enableInvite && (
                        <Button className="mt-3 bg-purple-600 hover:bg-purple-700" size="sm">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Invite User
                        </Button>
                      )}
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </ScrollArea>
          {enableInvite && (results.length > 0 || !searchTerm) && (
            <CardFooter className="p-3 border-t border-gray-700">
              <Button className="w-full bg-purple-600 hover:bg-purple-700" size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite New User
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
};
