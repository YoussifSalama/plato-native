import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, SearchInput, Section, Tabs } from '../../components/ui';
import { dateTime, num } from '../../lib/format';
import { useRange, useSearchState } from '../../lib/searchState';
import type { ExtensionLog, ExtensionUserRow, Paged } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { LogDetail, SourceChip, StatusBadge } from './LogDetail';

/** The extension's errors: every error in one list, or one row per user. */
export default function ExtensionLogs() {
  const [s, set] = useSearchState({ view: 'all', q: '', page: '1' });
  return (
    <>
      <Tabs
        value={s.view as 'all' | 'users'}
        onChange={(view) => set({ view, page: '1' })}
        items={[
          { value: 'all', label: 'All errors' },
          { value: 'users', label: 'By user' },
        ]}
      />
      {s.view === 'users' ? <ByUser q={s.q} page={Number(s.page) || 1} set={set} /> : <AllErrors q={s.q} page={Number(s.page) || 1} set={set} />}
    </>
  );
}

type Set = (p: { q?: string; page?: string }) => void;

function AllErrors({ q, page, set }: { q: string; page: number; set: Set }) {
  const { from, to } = useRange();
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Paged<ExtensionLog>>('/admin/logs/extension/all', { q, from, to, page });
  return (
    <Section actions={<SearchInput value={q} onChange={(v) => set({ q: v })} placeholder="Search message, code, email" />}>
      <ErrorNote error={error} onRetry={reload} />
      <ExtensionTable rows={data?.items} total={data?.total} page={page} onPage={(p) => set({ page: String(p) })} loading={loading} open={open} setOpen={setOpen} />
    </Section>
  );
}

export function ExtensionTable({
  rows,
  total,
  page,
  onPage,
  loading,
  open,
  setOpen,
}: {
  rows?: ExtensionLog[];
  total?: number;
  page: number;
  onPage: (p: number) => void;
  loading: boolean;
  open: string | null;
  setOpen: (id: string | null) => void;
}) {
  return (
    <DataTable
      rows={rows}
      total={total}
      page={page}
      onPage={onPage}
      loading={loading}
      rowKey={(r) => `${r.source}:${r.id}`}
      onRowClick={(r) => setOpen(open === `${r.source}:${r.id}` ? null : `${r.source}:${r.id}`)}
      expanded={open}
      renderExpanded={(r) => <LogDetail log={r} />}
      empty="No extension errors."
      columns={[
        { key: 'time', header: 'Time', render: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
        { key: 'source', header: 'Source', render: (r) => <SourceChip source={r.source} /> },
        {
          key: 'what',
          header: 'What happened',
          render: (r) => (
            <span className="block min-w-0">
              <span className="block font-medium">{r.message}</span>
              {r.code && <span className="block truncate font-mono text-xs text-text-tertiary">{r.code}</span>}
            </span>
          ),
        },
        { key: 'status', header: 'Status', hideOnMobile: true, render: (r) => <StatusBadge status={r.status} /> },
        { key: 'user', header: 'User', hideOnMobile: true, render: (r) => <span className="block max-w-[180px] truncate text-xs" title={r.userEmail ?? undefined}>{r.userEmail ?? '—'}</span> },
      ]}
    />
  );
}

function ByUser({ q, page, set }: { q: string; page: number; set: Set }) {
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<Paged<ExtensionUserRow>>('/admin/logs/extension/users', { q, page });
  return (
    <Section actions={<SearchInput value={q} onChange={(v) => set({ q: v })} placeholder="Search email or name" />}>
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data?.items}
        total={data?.total}
        page={page}
        onPage={(p) => set({ page: String(p) })}
        loading={loading}
        rowKey={(r) => r.userId}
        onRowClick={(r) => nav(`/logs/extension/${r.userId}`)}
        empty="No user has extension errors."
        columns={[
          {
            key: 'user',
            header: 'User',
            render: (r) => (
              <span className="block min-w-0">
                <span className="block truncate font-medium text-primary">{r.email ?? r.userId}</span>
                {r.name && <span className="block truncate text-xs text-text-tertiary">{r.name}</span>}
              </span>
            ),
          },
          { key: 'errors', header: 'Errors', align: 'right', render: (r) => num(r.errors) },
          {
            key: 'codes',
            header: 'Top codes',
            hideOnMobile: true,
            render: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.topCodes.slice(0, 3).map((c) => (
                  <span key={c.code} className="chip-neutral font-mono text-xs">
                    {c.code} · {c.count}
                  </span>
                ))}
              </span>
            ),
          },
          { key: 'last', header: 'Last error', render: (r) => dateTime(r.lastAt) },
        ]}
      />
    </Section>
  );
}
