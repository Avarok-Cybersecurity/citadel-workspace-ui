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
import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Card,
  CardContent,
  CardDescription,
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
  // `enableInvite` is still accepted so the call sites need not change, but
  // there is nothing to enable: the two Invite buttons it gated had no onClick.
  enableInvite: _enableInvite,
  onSelectUser,
}) => (
  <Card
    ref={resultsRef}
    className="absolute z-50 w-full mt-1 bg-card border-border text-foreground shadow-lg overflow-hidden"
  >
    <CardHeader className="p-3 border-b border-border">
      <CardTitle className="text-sm">
        {/* Not "Recent Users". These are the first five members of the list,
            in whatever order it arrived — nothing tracks interaction or
            recency, and there is no last-seen data to sort by. Claiming
            otherwise made an arbitrary five look like a considered five. */}
        {searchTerm ? 'Search Results' : 'Workspace Members'}
      </CardTitle>
      <CardDescription className="text-muted-foreground">
        {loading
          ? 'Searching...'
          : searchTerm
            ? `Found ${results.length} users`
            : 'Start typing to search'}
      </CardDescription>
    </CardHeader>
    {/* The `[&_[data-radix-scroll-area-viewport]>div]:!block` is load-bearing.
        Radix renders its viewport child as `display: table; min-width: 100%`,
        which shrink-wraps to MAX-CONTENT — so a long username made the row
        331px wide inside a 291px viewport, and the overflow was clipped rather
        than truncated: the name's own `text-ellipsis` never engaged, because
        inside a table there was always more width to take. Forcing block gives
        the row the viewport's width, so truncation happens where it should.
        This list scrolls vertically only, so nothing is lost by it. */}
    <ScrollArea className="max-h-64 [&_[data-radix-scroll-area-viewport]>div]:!block">
      <CardContent className="p-0">
        {loading ? (
          <div className="py-8 flex justify-center items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-accent"></div>
          </div>
        ) : (
          <ul id={RESULTS_LIST_ID} role="listbox" aria-label="User search results" className="divide-y divide-border">
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
                    {/* Decorative: displayName is rendered below. */}
                    <AvatarImage src={user.avatarUrl} alt="" />
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
                    // shrink-0: without it the badge is what gives way when a
                    // long username fills the row, and the panel's
                    // overflow-hidden clips the role mid-word. The name beside
                    // it already truncates, so it is the one that should yield.
                    <Badge className={`shrink-0 ${getRoleBadgeClass(user.role)}`}>
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
                {/* An "Invite User" button lived here, directly under "No
                    users found" — the moment someone most needs it — with no
                    onClick and inside no form. It was a button-shaped dead end
                    at the exact point of need. Inviting someone who is not a
                    member is not a capability this app has; pretending
                    otherwise is worse than its absence. */}
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </ScrollArea>
    {/* The footer's "Invite New User" was the same dead end, twice. */}
  </Card>
);
