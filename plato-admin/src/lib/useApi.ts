import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Query } from './api';

/**
 * GET `path` with `query`; refetches when either changes. `path = null` skips.
 * Returns the last good data while a refetch runs (no flashing tables).
 */
export function useApi<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const key = path === null ? null : path + JSON.stringify(query ?? {});
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api<T>(path, { query: queryRef.current, signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
