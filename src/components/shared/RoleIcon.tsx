/**
 * A member's role as an icon in a round chip.
 *
 * The chip takes its fill, border and foreground from roleBadgeClass, so rank
 * keeps the same visual weight and the same AA-checked pairs as the text
 * badge. Colour and shape are never the only signal: the chip is role="img"
 * with the role's name, so it reads aloud and tests find it by name.
 */
import { Crown, ShieldCheck, Ticket, User, type LucideIcon } from 'lucide-react';
import { roleBadgeClass } from '@/lib/role-badge';
import { cn } from '@/lib/utils';

const ROLE_ICON: Record<string, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
  guest: Ticket,
};

/** The role as people read it: "Admin", not "admin". */
export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface RoleIconProps {
  role: string;
  className?: string;
}

export function RoleIcon({ role, className }: RoleIconProps): JSX.Element {
  const Icon: LucideIcon = ROLE_ICON[role.toLowerCase()] ?? User;
  return (
    <span
      role="img"
      aria-label={roleLabel(role)}
      data-role={role.toLowerCase()}
      className={cn(roleBadgeClass(role), 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full', className)}
    >
      <Icon className="h-3 w-3" aria-hidden="true" strokeWidth={2.25} />
    </span>
  );
}
