import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../components/ConfirmDialog';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, PageHeader, SearchInput, Section } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { dateTime, num } from '../../lib/format';
import { useSearchState } from '../../lib/searchState';
import type { RateLimit } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function RateLimits() {
  const [s, set] = useSearchState({ q: '' });
  const { data, error, loading, reload } = useApi<RateLimit[]>('/admin/rate-limits', { q: s.q });
  const confirm = useConfirm();

  const clear = async (r: RateLimit) => {
    if (!(await confirm({ title: 'Clear this limit?', body: `${r.limiter} · ${r.key}`, confirmLabel: 'Clear' }))) return;
    try {
      await api('/admin/rate-limits', { method: 'DELETE', query: { limiter: r.limiter, key: r.key } });
      toast.success('Cleared');
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to="/users" className="btn-ghost -ml-2 px-2" aria-label="Back to users">
              <ArrowLeft className="size-5" />
            </Link>
            Rate limits
          </span>
        }
        description="Current in-memory limits (IP, user and email keys). They reset on their own; clear one to let someone in now."
        actions={
          <button type="button" className="btn-outline" onClick={reload}>
            Refresh
          </button>
        }
      />
      <Section actions={<SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Filter by key, email or IP" />}>
        <ErrorNote error={error} onRetry={reload} />
        <DataTable
          rows={data}
          loading={loading}
          rowKey={(r) => `${r.limiter}|${r.key}`}
          empty="No active limits."
          columns={[
            { key: 'limiter', header: 'Limiter', render: (r) => <span className="chip-neutral">{r.limiter}</span> },
            { key: 'key', header: 'Key', render: (r) => <span className="font-mono text-xs break-all">{r.key}</span> },
            { key: 'hits', header: 'Hits', align: 'right', render: (r) => num(r.hits) },
            { key: 'reset', header: 'Resets', hideOnMobile: true, render: (r) => dateTime(r.resetAt) },
            {
              key: 'x',
              header: '',
              align: 'right',
              render: (r) => (
                <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => void clear(r)}>
                  Clear
                </button>
              ),
            },
          ]}
        />
      </Section>
    </>
  );
}
