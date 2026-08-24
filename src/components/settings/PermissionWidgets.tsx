/**
 * Permission display widgets: RoleBadge, PermissionStatus, GroupedPermissionTable
 */

import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';


import { usePermissions, PERMISSION_CATEGORIES } from '@/contexts/PermissionsContext';
import type { UserRole } from '@/lib/permissions-service';
import { cn } from '@/lib/utils';

/**
 * Role badge component with appropriate styling
 */
export function RoleBadge({ role }: { role: UserRole | null }) {
  if (!role) {
    return <Badge variant="outline" className="text-muted-foreground border-gray-600">Unknown</Badge>;
  }

  const roleString = typeof role === 'string' ? role : 'Custom';

  const variants: Record<string, string> = {
    Admin: 'bg-purple-600/20 text-purple-400 border-purple-500/50',
    Owner: 'bg-amber-600/20 text-amber-400 border-amber-500/50',
    Member: 'bg-blue-600/20 text-blue-400 border-blue-500/50',
    Guest: 'bg-gray-600/20 text-muted-foreground border-gray-500/50',
    Banned: 'bg-red-600/20 text-red-400 border-red-500/50',
    Custom: 'bg-teal-600/20 text-teal-400 border-teal-500/50',
  };

  return (
    <Badge variant="outline" className={cn('font-medium', variants[roleString] || variants.Custom)}>
      {roleString}
    </Badge>
  );
}

/**
 * Permission status icon
 */
export function PermissionStatus({ allowed }: { allowed: boolean }) {
  if (allowed) {
    return (
      <div className="flex items-center gap-1.5 text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm">Allowed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-red-400">
      <XCircle className="h-4 w-4" />
      <span className="text-sm">Denied</span>
    </div>
  );
}

/**
 * Permission table for a specific domain
 */
export function GroupedPermissionTable({ domainId }: { domainId: string }) {
  const { hasPermission, getPermissionLabel } = usePermissions();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['content', 'messaging']);

  return (
    <Accordion
      type="multiple"
      value={expandedCategories}
      onValueChange={setExpandedCategories}
      className="w-full"
    >
      {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
        const allowedCount = category.permissions.filter(p => hasPermission(domainId, p)).length;
        const totalCount = category.permissions.length;

        return (
          <AccordionItem key={key} value={key} className="border-gray-700/50">
            <AccordionTrigger className="text-foreground/80 hover:text-foreground hover:no-underline py-2">
              <div className="flex items-center gap-3">
                <span>{category.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    allowedCount === totalCount
                      ? 'bg-green-600/20 text-green-400 border-green-500/50'
                      : allowedCount === 0
                        ? 'bg-red-600/20 text-red-400 border-red-500/50'
                        : 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50'
                  )}
                >
                  {allowedCount}/{totalCount}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1 pl-4">
                {category.permissions.map((permission) => (
                  <div
                    key={permission}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-muted-foreground">{getPermissionLabel(permission)}</span>
                    <PermissionStatus allowed={hasPermission(domainId, permission)} />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
