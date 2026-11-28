// A short in-memory cache for the panel's heavy reads (dashboard, searches, retention): the same
// question asked again within a minute is answered from memory instead of re-reading the database.
// ponytail: per process; a daily rollup collection replaces this once the data outgrows it.
const TTL_MS = 60_000;
const MAX = 200;
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function memo<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs = TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  if (store.size >= MAX)
    for (const [k, v] of store)
      if (now - v.at >= ttlMs || store.size >= MAX) store.delete(k);
  const value = compute();
  store.set(key, { at: now, value });
  // a failed read is not kept: the next ask tries again
  value.catch(() => store.delete(key));
  return value;
}

export const clearMemo = () => store.clear();
