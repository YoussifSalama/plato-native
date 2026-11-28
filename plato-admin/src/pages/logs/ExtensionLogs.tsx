import { useState, type ReactNode } from 'react';
import { ExportButton } from '../../components/ExportButton';
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
  // the view switch sits in the card's action bar, the same place as on the Platform tab
  const views = (
    <Tabs
      compact
      label="View"
      value={s.view as 'all' | 'users'}
      onChange={(view) => set({ view, page: '1' })}
      items={[
        { value: 'all', label: 'All errors' },
        { value: 'users', label: 'By user' },
      ]}
    />
  );
  return s.view === 'users' ? (
    <ByUser q={s.q} page={Number(s.page) || 1} set={set} views={views} />
  ) : (
    <AllErrors q={s.q} page={Number(s.page) || 1} set={set} views={views} />
  );
}

type Set = (p: { q?: string; page?: string }) => void;

function Bar({ views, q, set, placeholder, extra }: { views: ReactNode; q: string; set: Set; placeholder: string; extra?: ReactNode }) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      {views}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={placeholder} />
        {extra}
      </div>
    </div>
  );
}

function AllErrors({ q, page, set, views }: { q: string; page: number; set: Set; views: ReactNode }) {
  const { from, to } = useRange();
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Paged<ExtensionLog>>('/admin/logs/extension/all', { q, from, to, page }, { refreshMs: 30_000 });
  return (
    <Section
      actions={
        <Bar
          views={views}
          q={q}
          set={set}
          placeholder="Search message, code, email"
          extra={
            <ExportButton<ExtensionLog>
              name="extension-errors"
              path="/admin/logs/extension/all"
              query={{ q, from, to }}
              columns={[
                ['Time', (r) => r.createdAt],
                ['Source', (r) => r.source],
                ['Status', (r) => r.status],
                ['Code', (r) => r.code],
                ['Message', (r) => r.message],
                ['User', (r) => r.userEmail],
              ]}
            />
          }
        />
      }
    >
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
      renderCard={(r) => (
        <span className="block min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <SourceChip source={r.source} />
            <StatusBadge status={r.status} />
            <span className="text-xs text-text-tertiary">{dateTime(r.createdAt)}</span>
          </span>
          <span className="mt-1 block text-sm font-medium break-words">{r.message}</span>
          {r.code && <span className="block font-mono text-xs break-all text-text-tertiary">{r.code}</span>}
          {r.userEmail && <span className="block text-xs break-all text-text-secondary">{r.userEmail}</span>}
        </span>
      )}
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

function ByUser({ q, page, set, views }: { q: string; page: number; set: Set; views: ReactNode }) {
  const nav = useNavigate();
  const { from, to } = useRange();
  const { data, error, loading, reload } = useApi<Paged<ExtensionUserRow>>('/admin/logs/extension/users', { q, from, to, page }, { refreshMs: 30_000 });
  return (
    <Section actions={<Bar views={views} q={q} set={set} placeholder="Search email or name" />}>
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data?.items}
        total={data?.total}
        page={page}
        onPage={(p) => set({ page: String(p) })}
        loading={loading}
        rowKey={(r) => r.userId}
        onRowClick={(r) => nav(`/logs/extension/${r.userId}`)}
        empty="No user has extension errors in this range."
        renderCard={(r) => (
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-medium text-primary">{r.email ?? r.userId}</span>
              <span className="block text-xs text-text-tertiary">Last {dateTime(r.lastAt)}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                {r.topCodes.slice(0, 3).map((c) => (
                  <span key={c.code} className="chip-neutral font-mono text-xs">
                    {c.code} · {c.count}
                  </span>
                ))}
              </span>
            </span>
            <b className="shrink-0 tabular-nums">{num(r.errors)}</b>
          </span>
        )}
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
