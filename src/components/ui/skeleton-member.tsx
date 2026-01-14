import React from 'react';
import { Skeleton } from './skeleton';

/**
 * Skeleton component for member loading states
 * Provides a visual placeholder while member data is being loaded
 */
export const MemberSkeletonLoader: React.FC = () => {
  return (
    <div className="w-full p-4 space-y-6">
      {/* Member header skeleton */}
      <div className="flex items-center space-x-4 mb-6">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      
      {/* Member details skeleton */}
      <div className="space-y-4 border border-gray-800 rounded-lg p-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
        
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
        
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-3 gap-2">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
      
      {/* Activity section skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-2 border-b border-gray-800">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-20 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
