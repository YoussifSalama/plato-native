import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, SearchInput, Section } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useRange, useSearchState } from '../../lib/searchState';
import type { ErrorLog, LogFacets, Paged } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { LogDetail, StatusBadge } from './LogDetail';

const PLATFORMS = [
  { value: '', label: 'All' },
  { value: 'web', label: 'Web' },
  { value: 'extension', label: 'Extension' },
  { value: 'api', label: 'API' },
];

export default function PlatformLogs() {
  const { from, to } = useRange();
  const [s, set] = useSearchState({ platform: '', module: '', status: '', q: '', sort: '-createdAt', page: '1' });
  const page = Number(s.page) || 1;
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Paged<ErrorLog>>('/admin/logs', {
    platform: s.platform,
    module: s.module,
    status: s.status,
    q: s.q,
    from,
    to,
    sort: s.sort === 'createdAt' ? 'oldest' : 'newest',
    page,
  });
  const facets = useApi<LogFacets>('/admin/logs/facets', { platform: s.platform });

  return (
    <Section
      actions={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 overflow-x-auto">
            {PLATFORMS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`tab h-8 ${s.platform === t.value ? 'tab-active' : ''}`}
                onClick={() => set({ platform: t.value, module: '' })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" aria-label="Module" value={s.module} onChange={(e) => set({ module: e.target.value })}>
              <option value="">All modules</option>
              {facets.data?.modules.map((m) => (
                <option key={m.module} value={m.module}>
                  {m.module} ({m.count})
                </option>
              ))}
            </select>
            <select className="input w-auto" aria-label="Status" value={s.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
              {facets.data?.statuses.map((x) => (
                <option key={x.status} value={String(x.status)}>
                  {x.status || 'client'} ({x.count})
                </option>
              ))}
            </select>
            <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Search message, path, code, email" />
          </div>
        </div>
      }
    >
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data?.items}
        total={data?.total}
        page={page}
        onPage={(p) => set({ page: String(p) })}
        sort={s.sort}
        onSort={(sort) => set({ sort })}
        loading={loading}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
        expanded={open}
        renderExpanded={(r) => <LogDetail log={r} />}
        empty="No errors in this range."
        columns={[
          { key: 'time', header: 'Time', sort: 'createdAt', render: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'what',
            header: 'What happened',
            render: (r) => (
              <span className="block min-w-0">
                <span className="block font-medium">{r.explanation ?? r.message}</span>
                <span className="block truncate font-mono text-xs text-text-tertiary">{`${r.method} ${r.path}`}</span>
              </span>
            ),
          },
          { key: 'module', header: 'Module', hideOnMobile: true, render: (r) => <span className="chip-neutral">{r.module}</span> },
          { key: 'platform', header: 'Platform', hideOnMobile: true, render: (r) => r.platform },
          { key: 'page', header: 'Page', hideOnMobile: true, render: (r) => <span className="block max-w-[140px] truncate text-xs" title={r.page ?? undefined}>{r.page ?? '—'}</span> },
          { key: 'user', header: 'User', hideOnMobile: true, render: (r) => <span className="block max-w-[180px] truncate text-xs" title={r.userEmail ?? undefined}>{r.userEmail ?? '—'}</span> },
        ]}
      />
    </Section>
  );
}
