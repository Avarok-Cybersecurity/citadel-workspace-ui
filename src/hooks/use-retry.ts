import { useState, useCallback } from 'react';

interface RetryOptions<T> {
  maxRetries?: number;
  retryDelay?: number;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  onRetry?: (attempt: number, error: Error) => void;
}

interface RetryState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  attempt: number;
  execute: (...params: unknown[]) => Promise<T | null>;
  retry: () => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook for executing operations with automatic retry capabilities
 * @param operation The async operation to execute with retry capability
 * @param options Configuration options for retry behavior
 * @returns State and control functions
 */
export function useRetry<T>(
  operation: (...args: unknown[]) => Promise<T>,
  options: RetryOptions<T> = {}
): RetryState<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onSuccess,
    onError,
    onRetry
  } = options;

  const [state, setState] = useState<{
    data: T | null;
    error: Error | null;
    isLoading: boolean;
    attempt: number;
    lastParams: unknown[] | null;
  }>({
    data: null,
    error: null,
    isLoading: false,
    attempt: 0,
    lastParams: null
  });

  const execute = useCallback(
    async (...params: unknown[]): Promise<T | null> => {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
        attempt: 1,
        lastParams: params
      }));

      try {
        const result = await operation(...params);
        setState(prev => ({
          ...prev,
          data: result,
          isLoading: false,
          error: null
        }));
        
        if (onSuccess) {
          onSuccess(result);
        }
        
        return result;
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        
        setState(prev => ({
          ...prev,
          error: errorObj,
          isLoading: false
        }));
        
        if (onError) {
          onError(errorObj);
        }
        
        return null;
      }
    },
    [operation, onSuccess, onError]
  );

  const retry = useCallback(async (): Promise<T | null> => {
    if (!state.lastParams || state.attempt > maxRetries) {
      return null;
    }

    setState(prev => ({
      ...prev,
      isLoading: true,
      attempt: prev.attempt + 1
    }));

    if (onRetry) {
      onRetry(state.attempt, state.error as Error);
    }

    // Add exponential backoff delay
    const delay = retryDelay * Math.pow(2, state.attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const result = await operation(...state.lastParams);
      setState(prev => ({
        ...prev,
        data: result,
        isLoading: false,
        error: null
      }));
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      setState(prev => ({
        ...prev,
        error: errorObj,
        isLoading: false
      }));
      
      if (onError) {
        onError(errorObj);
      }
      
      return null;
    }
  }, [state.attempt, state.lastParams, state.error, maxRetries, operation, retryDelay, onRetry, onSuccess, onError]);

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      isLoading: false,
      attempt: 0,
      lastParams: null
    });
  }, []);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.isLoading,
    attempt: state.attempt,
    execute,
    retry,
    reset
  };
}
