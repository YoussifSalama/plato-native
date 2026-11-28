import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { ErrorNote, Section } from '../../components/ui';
import { useSearchState } from '../../lib/searchState';
import type { ExtensionUserLogs as Data } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { ExtensionTable } from './ExtensionLogs';

/** Every extension error of one seeker. */
export default function ExtensionUserLogs() {
  const { userId = '' } = useParams();
  const [s, set] = useSearchState({ page: '1' });
  const page = Number(s.page) || 1;
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Data>(`/admin/logs/extension/users/${encodeURIComponent(userId)}`, { page });
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Link to="/logs/extension?view=users" className="btn-ghost -ml-2 px-2" aria-label="Back to users">
            <ArrowLeft className="size-4" />
          </Link>
          {data?.user ? (
            <Link className="text-primary hover:underline" to={`/users/${data.user.id}`}>
              {data.user.email}
            </Link>
          ) : (
            'User'
          )}
        </span>
      }
    >
      <ErrorNote error={error} onRetry={reload} />
      <ExtensionTable rows={data?.items} total={data?.total} page={page} onPage={(p) => set({ page: String(p) })} loading={loading} open={open} setOpen={setOpen} />
    </Section>
  );
}
