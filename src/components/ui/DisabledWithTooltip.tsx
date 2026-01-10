/**
 * DisabledWithTooltip Component
 *
 * A wrapper that displays children in a disabled state with a tooltip
 * explaining why the element is disabled. Used for permission-gated UI elements.
 */

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertCircle, Lock } from 'lucide-react';

interface DisabledWithTooltipProps {
  /** Whether the element should be disabled */
  disabled: boolean;
  /** Tooltip message explaining why disabled */
  tooltip: string;
  /** Content to render */
  children: React.ReactNode;
  /** Additional class names for the wrapper */
  className?: string;
  /** Show lock icon in tooltip (default: true) */
  showIcon?: boolean;
  /** Side for tooltip (default: top) */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Delay before showing tooltip in ms (default: 300) */
  delayDuration?: number;
}

/**
 * Wraps children with a disabled state and explanatory tooltip
 *
 * @example
 * ```tsx
 * <DisabledWithTooltip
 *   disabled={!canEdit}
 *   tooltip="You don't have permission to edit this content"
 * >
 *   <Button>Edit</Button>
 * </DisabledWithTooltip>
 * ```
 */
export const DisabledWithTooltip: React.FC<DisabledWithTooltipProps> = ({
  disabled,
  tooltip,
  children,
  className,
  showIcon = true,
  side = 'top',
  delayDuration = 300,
}) => {
  // If not disabled, render children directly
  if (!disabled) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={delayDuration}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              // Disabled styling
              'opacity-50 cursor-not-allowed select-none',
              // Prevent interactions with children
              '[&_*]:pointer-events-none',
              className
            )}
            aria-disabled="true"
            role="presentation"
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className={cn(
            'max-w-xs bg-gray-900 text-gray-100 border-gray-700',
            'px-3 py-2 text-sm'
          )}
        >
          <div className="flex items-start gap-2">
            {showIcon && (
              <Lock className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
            )}
            <span>{tooltip}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Alternative version with error styling
 */
export const DisabledWithError: React.FC<DisabledWithTooltipProps> = ({
  disabled,
  tooltip,
  children,
  className,
  side = 'top',
  delayDuration = 300,
}) => {
  if (!disabled) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={delayDuration}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'opacity-50 cursor-not-allowed select-none',
              '[&_*]:pointer-events-none',
              className
            )}
            aria-disabled="true"
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs bg-red-950 text-red-100 border-red-800 px-3 py-2 text-sm"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
            <span>{tooltip}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default DisabledWithTooltip;
