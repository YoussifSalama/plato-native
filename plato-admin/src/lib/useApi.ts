import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Query } from './api';

/**
 * GET `path` with `query`; refetches when either changes. `path = null` skips.
 * Returns the last good data while a refetch runs (no flashing tables).
 * `refreshMs`: fetch again on that interval while the tab is visible (and at once when it comes
 * back after being hidden longer than that); `updatedAt` is when the data last arrived.
 */
export function useApi<T>(path: string | null, query?: Query, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const key = path === null ? null : path + JSON.stringify(query ?? {});
  const queryRef = useRef(query);
  queryRef.current = query;
  const updatedRef = useRef<number | null>(null);
  updatedRef.current = updatedAt;

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
        setUpdatedAt(Date.now());
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

  const every = opts.refreshMs;
  useEffect(() => {
    if (!every || path === null) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, every);
    const back = () => {
      if (document.visibilityState === 'visible' && Date.now() - (updatedRef.current ?? 0) > every) reload();
    };
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    };
  }, [every, path, reload]);

  return { data, error, loading, reload, setData, updatedAt };
}
