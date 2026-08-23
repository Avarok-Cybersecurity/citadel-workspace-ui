import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { ConnectionService } from '@/lib/connection-service';
import { Badge } from '@/components/ui/badge';
import type { UserData, UserSearchProps } from './user-search-types';

/**
 * Ties the input to the list it controls via aria-controls/aria-expanded.
 * A constant rather than useId: there is one search panel open at a time, and a
 * stable id keeps the relationship legible.
 */
const RESULTS_LIST_ID = 'user-search-results';
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
  const connectionService = useMemo(() => ConnectionService.getInstance(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { state } = useWorkspace();

  // Focus input on mount if initialFocus is true
  useEffect(() => {
    if (initialFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [initialFocus]);

  // Dismiss the results panel: pointer outside it, or Escape.
  //
  // Escape matters because the panel is `position: absolute; z-index: 50` and
  // covers the controls beneath it — on the directory page, the All/Online tabs.
  // A mouse user was already fine (mousedown closes the panel before the click
  // lands), but with no key handler a keyboard user had no way to dismiss it and
  // no way to reach what it covered. That is the combobox behaviour anyone would
  // expect, and its absence was a dead end rather than a cosmetic gap.
  useEffect(() => {
    const dismissOnPointerOutside = (event: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Only when open, so Escape stays available to whatever is behind us —
      // a dialog holding this search, for instance.
      setShowResults((open) => {
        if (open) event.stopPropagation();
        return false;
      });
    };

    document.addEventListener('mousedown', dismissOnPointerOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('mousedown', dismissOnPointerOutside);
      document.removeEventListener('keydown', dismissOnEscape);
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
            // Real presence, from the service that knows. This was
            // `Math.random() > 0.5`, so the green dot beside a user's name was a
            // coin flip — it told the viewer nothing and contradicted the same
            // user's status elsewhere in the app on every render.
            isOnline: connectionService.canMessageUser(member.id),
            // Deliberately absent: nothing tracks last-seen time yet, and the
            // previous value was a random offset from now. Undefined lets the UI
            // say it does not know instead of stating a time that is made up.
            lastActive: undefined,
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
  }, [searchTerm, state.members, exclude, connectionService]);

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
        isOnline: connectionService.canMessageUser(member.id),
        lastActive: undefined,
      }));
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center bg-card rounded-md border border-gray-700">
        <Search className="h-4 w-4 text-muted-foreground ml-3" />
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={RESULTS_LIST_ID}
          aria-autocomplete="list"
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
                <ul id={RESULTS_LIST_ID} role="listbox" aria-label="User search results" className="divide-y divide-gray-700">
                  {(results.length > 0 ? results : searchTerm ? [] : getRecentUsers()).map((user) => (
                    // The list item stays a list item; the control goes INSIDE it.
                    // Giving the <li> role="button" would have removed it from the
                    // list semantics, so a screen reader would stop announcing
                    // "list, N items" and lose the user's position in the results.
                    <li key={user.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        className="w-full text-left hover:bg-card transition-colors p-3 cursor-pointer"
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
                      </button>
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
