import { useState } from 'react';
import { isRetryableError } from '@/utils/errors';

/**
 * Hook for managing async operations with loading, error, and retry states
 */
export function useAsync<T, Args extends any[]>(
  asyncFunction: (...args: Args) => Promise<T>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = async (...args: Args): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await asyncFunction(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const retry = (...args: Args) => {
    if (error && isRetryableError(error)) {
      return execute(...args);
    }
    return Promise.resolve(null);
  };

  const reset = () => {
    setLoading(false);
    setError(null);
    setData(null);
  };

  return {
    loading,
    error,
    data,
    execute,
    retry,
    reset,
    canRetry: error ? isRetryableError(error) : false,
  };
}

export default useAsync;
