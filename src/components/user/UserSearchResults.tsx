/**
 * The user-search results panel.
 *
 * Owns the dropdown that a UserSearch input opens: header, loading state, the
 * listbox of matching users (with its screen-reader-critical role structure —
 * see the inline comments), the empty state, and the invite affordances.
 * Split from UserSearch.tsx so the input/query/dismissal logic and the results
 * presentation stay separate responsibilities.
 */

import React from 'react';
import { User, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Badge } from '@/components/ui/badge';
import type { UserData } from './user-search-types';
import { getRoleBadgeClass } from './user-search-types';

/**
 * Ties the input to the list it controls via aria-controls/aria-expanded.
 * A constant rather than useId: there is one search panel open at a time, and a
 * stable id keeps the relationship legible.
 */
export const RESULTS_LIST_ID = 'user-search-results';

interface UserSearchResultsProps {
  resultsRef: React.RefObject<HTMLDivElement>;
  searchTerm: string;
  loading: boolean;
  results: UserData[];
  recentUsers: UserData[];
  enableInvite: boolean;
  onSelectUser: (user: UserData) => void;
}

export const UserSearchResults: React.FC<UserSearchResultsProps> = ({
  resultsRef,
  searchTerm,
  loading,
  results,
  recentUsers,
  enableInvite,
  onSelectUser,
}) => (
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
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-accent"></div>
          </div>
        ) : (
          <ul id={RESULTS_LIST_ID} role="listbox" aria-label="User search results" className="divide-y divide-gray-700">
            {(results.length > 0 ? results : searchTerm ? [] : recentUsers).map((user) => (
              // The list item stays a list item; the control goes INSIDE it.
              // Giving the <li> role="button" would have removed it from the
              // list semantics, so a screen reader would stop announcing
              // "list, N items" and lose the user's position in the results.
              // role="presentation" on the li, role="option" on the
              // button: the option has to BE the focusable element. Putting
              // role="option" on the li while a button sat inside it made
              // the option a container with a focusable descendant, which
              // is the nested-interactive pattern screen readers cannot
              // resolve.
              <li key={user.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full text-left hover:bg-card transition-colors p-3 cursor-pointer"
                  onClick={() => onSelectUser(user)}
                >
                <div className="flex items-center space-x-3">
                  <Avatar className="h-10 w-10 relative">
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback className="bg-primary">{user.displayName.charAt(0)}</AvatarFallback>
                    {user.isOnline && (
                      <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
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
                  <Button className="mt-3 bg-primary hover:bg-primary/90" size="sm">
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
        <Button className="w-full bg-primary hover:bg-primary/90" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite New User
        </Button>
      </CardFooter>
    )}
  </Card>
);
