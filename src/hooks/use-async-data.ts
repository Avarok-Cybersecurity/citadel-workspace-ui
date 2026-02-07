/**
 * useAsyncData Hook
 *
 * Manages async data fetching with loading, error, and data states.
 * Reduces boilerplate for the common loading/error/data pattern.
 *
 * @example
 * const { data, loading, error, refetch } = useAsyncData(
 *   () => fetchUserProfile(userId),
 *   [userId]
 * );
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 * return <Profile user={data} />;
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface AsyncDataState<T> {
  /** The fetched data, null if not yet loaded or on error */
  data: T | null;
  /** True while the fetch is in progress */
  loading: boolean;
  /** Error object if the fetch failed */
  error: Error | null;
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Reset state to initial values */
  reset: () => void;
  /** True if data was successfully loaded at least once */
  hasLoaded: boolean;
}

export interface AsyncDataOptions {
  /** Skip the initial fetch (useful for conditional fetching) */
  skip?: boolean;
  /** Initial data value before first fetch */
  initialData?: unknown;
  /** Called when fetch succeeds */
  onSuccess?: (data: unknown) => void;
  /** Called when fetch fails */
  onError?: (error: Error) => void;
}

/**
 * Hook for managing async data fetching with loading/error states.
 * @param fetchFn - Async function that returns the data
 * @param deps - Dependency array that triggers refetch when changed
 * @param options - Optional configuration
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: AsyncDataOptions = {}
): AsyncDataState<T> {
  const { skip = false, initialData = null, onSuccess, onError } = options;

  const [data, setData] = useState<T | null>(initialData as T | null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Track if component is mounted
  const mountedRef = useRef(true);
  // Track current fetch to handle race conditions
  const fetchIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (skip) {
      setLoading(false);
      return;
    }

    const currentFetchId = ++fetchIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFn();

      // Only update if this is still the latest fetch and component is mounted
      if (mountedRef.current && currentFetchId === fetchIdRef.current) {
        setData(result);
        setHasLoaded(true);
        setLoading(false);
        onSuccess?.(result);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (mountedRef.current && currentFetchId === fetchIdRef.current) {
        setError(errorObj);
        setLoading(false);
        onError?.(errorObj);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, skip, ...deps]);

  // Initial fetch and refetch on dependency change
  useEffect(() => {
    const _ = fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const reset = useCallback(() => {
    fetchIdRef.current++;
    setData(initialData as T | null);
    setLoading(false);
    setError(null);
    setHasLoaded(false);
  }, [initialData]);

  return {
    data,
    loading,
    error,
    refetch,
    reset,
    hasLoaded
  };
}

/**
 * Hook for managing async data with manual trigger (no auto-fetch).
 * Useful when fetch should only happen on user action.
 *
 * @example
 * const { data, loading, execute } = useAsyncAction(
 *   (id: string) => deleteItem(id)
 * );
 *
 * <button onClick={() => execute(itemId)} disabled={loading}>
 *   Delete
 * </button>
 */
export function useAsyncAction<T, Args extends unknown[] = []>(
  actionFn: (...args: Args) => Promise<T>,
  options: Pick<AsyncDataOptions, 'onSuccess' | 'onError'> = {}
): AsyncDataState<T> & { execute: (...args: Args) => Promise<T | null> } {
  const { onSuccess, onError } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await actionFn(...args);

      if (mountedRef.current) {
        setData(result);
        setHasLoaded(true);
        setLoading(false);
        onSuccess?.(result);
      }

      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (mountedRef.current) {
        setError(errorObj);
        setLoading(false);
        onError?.(errorObj);
      }

      return null;
    }
  }, [actionFn, onSuccess, onError]);

  const refetch = useCallback(async () => {
    // For actions, refetch doesn't make sense without args
    console.warn('useAsyncAction: refetch() called without arguments. Use execute() with args instead.');
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
    setHasLoaded(false);
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
    reset,
    hasLoaded,
    execute
  };
}
