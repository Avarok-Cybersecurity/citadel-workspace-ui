import React from 'react';
import { Skeleton } from './skeleton';

/**
 * Skeleton component for room loading states
 * Provides a visual placeholder while room data is being loaded
 */
export const RoomSkeletonLoader: React.FC = () => {
  return (
    <div className="w-full p-4 space-y-6">
      {/* Room header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      
      {/* Room content skeleton */}
      <div className="grid grid-cols-1 gap-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="flex items-start space-x-3 p-4 border border-gray-800 rounded-lg">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
      
      {/* Member list skeleton */}
      <div className="mt-8">
        <div className="flex items-center space-x-2 mb-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
