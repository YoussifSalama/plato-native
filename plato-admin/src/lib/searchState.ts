import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { isoDay } from './format';

/**
 * Page state (filters, sort, page, date range) kept in the URL so back/forward and
 * shared links work. Unset keys fall back to `defaults`; setting a filter resets `page`.
 */
export function useSearchState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => {
    const v = { ...defaults } as Record<string, string>;
    for (const k of Object.keys(defaults)) {
      const x = params.get(k);
      if (x !== null) v[k] = x;
    }
    return v as T;
    // defaults are literals per page; params drive the change
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(
    (patch: Partial<T>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return [values, set] as const;
}

export function defaultRange(days = 30) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

/** The shared date range of the analytics pages (default last 30 days). */
export function useRange() {
  const [range, setRange] = useSearchState(defaultRange());
  return { from: range.from, to: range.to, setRange };
}
