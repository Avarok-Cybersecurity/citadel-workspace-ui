/**
 * One line of the focused tree: the element that IS the treeitem.
 *
 * A div, not a <button>. The peek chevron and the ⋯ menu are real buttons on
 * the line, and ARIA allows a treeitem to hold interactive content (its
 * children are not presentational) where a tree does not allow a button among
 * its items -- as siblings of a button row, axe measured them as children the
 * tree may not have. A button inside a button would be nested interactive
 * content instead. So the line is the treeitem, focusable, activated by click
 * or by Enter/Space, and its buttons sit inside it.
 *
 * Clicks that are not the line's own are ignored: the ⋯ menu renders in a
 * portal, and React bubbles a menu item's click through the component tree to
 * here, where it would otherwise also select the row.
 *
 * A leaving row (see useLeaving) is inert: no role, no testid, no tab stop.
 */
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { treeItemAttributes, treeKeyAction, type TreeItemInfo } from './useTreeKeyboard';

interface TreeRowProps {
  info: TreeItemInfo;
  /** True depth, 1 for the root. */
  level: number;
  leaving: boolean;
  testId: string;
  title: string;
  /** Present when the row has children (or is the selection): whether they are on screen. */
  expanded?: boolean;
  isActive?: boolean;
  className: string;
  style?: CSSProperties;
  onActivate: () => void;
  children: ReactNode;
}

export function TreeRow({ info, level, leaving, testId, title, expanded, isActive, className, style, onActivate, children }: TreeRowProps): JSX.Element {
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    if ((event.target as HTMLElement).closest('button') !== null) return;
    onActivate();
  };
  // Enter and Space on the row itself; on a button inside it they are that button's.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || treeKeyAction(event.key, info)?.type !== 'activate') return;
    event.preventDefault();
    onActivate();
  };
  return (
    // The classes go through SidebarMenuButton, which merges them over its own
    // (tailwind-merge); put on the div, Slot would only concatenate, and its
    // `h-8` and `[&>svg]:size-4` would win or lose by stylesheet order.
    <SidebarMenuButton asChild isActive={isActive} className={cn('relative cursor-pointer select-none', className)}>
      <div
        role={leaving ? undefined : 'treeitem'}
        aria-hidden={leaving || undefined}
        tabIndex={leaving ? -1 : 0}
        aria-level={level}
        aria-selected={info.selected}
        aria-expanded={expanded}
        aria-label={title}
        {...treeItemAttributes(info)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        data-testid={leaving ? undefined : testId}
        title={title}
        style={style}
      >
        {children}
      </div>
    </SidebarMenuButton>
  );
}
