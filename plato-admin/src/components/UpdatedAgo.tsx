import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** "Updated 1 min ago" with a refresh button: what the page shows is live, and how live. */
export function UpdatedAgo({ at, loading, onRefresh, every }: { at: number | null; loading?: boolean; onRefresh: () => void; every?: number }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNow((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
      {at ? `Updated ${ago(Date.now() - at)}` : 'Loading…'}
      {every ? ` · every ${Math.round(every / 1000)} s` : ''}
      <button type="button" className="btn-ghost h-7 px-1.5" onClick={onRefresh} aria-label="Refresh now" title="Refresh now">
        <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </span>
  );
}
