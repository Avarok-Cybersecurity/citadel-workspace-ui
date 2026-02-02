import { HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VFSStorageUsageProps {
  usedBytes: number;
  quotaBytes: number;
  label?: string; // "Server" or peer name
}

/**
 * Format bytes to human-readable string (e.g., "45.2 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value < 10 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Storage usage progress bar for the RE-VFS tree view sidebar.
 * Shows usage percentage with color thresholds:
 * - Normal (< 80%): purple
 * - Warning (80-95%): yellow
 * - Critical (>= 95%): red
 */
export function VFSStorageUsage({ usedBytes, quotaBytes, label }: VFSStorageUsageProps) {
  const percentage = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;
  const isWarning = percentage >= 80 && percentage < 95;
  const isCritical = percentage >= 95;

  // Determine bar color based on usage
  const barColor = isCritical
    ? 'bg-red-500'
    : isWarning
      ? 'bg-yellow-500'
      : 'bg-purple-500';

  const textColor = isCritical
    ? 'text-red-400'
    : isWarning
      ? 'text-yellow-400'
      : 'text-gray-400';

  return (
    <div className="px-2 py-2 border-t border-purple-800 bg-[#2E3450]">
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <HardDrive className={cn('h-3 w-3', textColor)} />
        <span className="text-xs text-gray-400 truncate">
          {label ? `${label} Storage` : 'Storage'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[#1E2235] rounded-full overflow-hidden mb-1">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Usage text */}
      <div className={cn('text-xs', textColor)}>
        {formatBytes(usedBytes)} / {formatBytes(quotaBytes)} used
      </div>
    </div>
  );
}
