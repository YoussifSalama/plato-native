import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, Tabs, SearchInput, Section, StatusChip } from '../../components/ui';
import { dateTime, num } from '../../lib/format';
import { useRange, useSearchState } from '../../lib/searchState';
import type { ErrorGroups, ErrorLog, LogFacets, Paged } from '../../lib/types';
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
  const [s, set] = useSearchState({ view: 'groups', platform: '', module: '', status: '', q: '', sort: '-createdAt', page: '1' });
  const page = Number(s.page) || 1;
  const [open, setOpen] = useState<string | null>(null);
  const grouped = s.view === 'groups';
  // grouped: the same error once, with how often; every error: each failed request
  const groups = useApi<ErrorGroups>(grouped ? '/admin/logs/groups' : null, {
    platform: s.platform,
    module: s.module,
    status: s.status,
    q: s.q,
    from,
    to,
    page,
  });
  const { data, error, loading, reload } = useApi<Paged<ErrorLog>>(grouped ? null : '/admin/logs', {
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
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              compact
              label="View"
              value={s.view as 'groups' | 'all'}
              onChange={(view) => set({ view, page: '1' })}
              items={[
                { value: 'groups', label: 'Grouped' },
                { value: 'all', label: 'Every error' },
              ]}
            />
            <Tabs compact label="Platform" value={s.platform} onChange={(platform) => set({ platform, module: '' })} items={PLATFORMS} />
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
      {grouped ? (
        <>
          <ErrorNote error={groups.error} onRetry={groups.reload} />
          <DataTable
            rows={groups.data?.items}
            total={groups.data?.total}
            page={page}
            onPage={(p) => set({ page: String(p) })}
            loading={groups.loading}
            rowKey={(g) => `${g.platform}|${g.module}|${g.status}|${g.code}|${g.message}`}
            // open the group as its individual errors
            onRowClick={(g) => set({ view: 'all', q: g.message.slice(0, 80), module: g.module, status: String(g.status), page: '1' })}
            empty="No errors in this range."
            columns={[
              { key: 'count', header: 'Times', align: 'right', render: (g) => <b className="tabular-nums">{num(g.count)}</b> },
              { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.status} /> },
              {
                key: 'what',
                header: 'What happened',
                render: (g) => (
                  <span className="block min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      {g.isNew && <StatusChip tone="primary">New</StatusChip>}
                      <span className="line-clamp-2 break-words">{g.explanation ?? g.message}</span>
                    </span>
                    <span className="block max-w-[640px] truncate text-xs text-text-tertiary">
                      {g.message}
                      {g.path && <span className="font-mono"> · {`${g.method} ${g.path}`}</span>}
                    </span>
                  </span>
                ),
              },
              { key: 'module', header: 'Module', hideOnMobile: true, render: (g) => <span className="chip-neutral">{g.module}</span> },
              { key: 'last', header: 'Last seen', hideOnMobile: true, render: (g) => <span className="whitespace-nowrap">{dateTime(g.lastAt)}</span> },
              { key: 'first', header: 'First seen', hideOnMobile: true, render: (g) => <span className="whitespace-nowrap">{dateTime(g.firstAt)}</span> },
            ]}
          />
          {groups.data && (
            <p className="mt-3 text-xs text-text-tertiary">“New” = first seen after the server last started ({dateTime(groups.data.startedAt)}), usually a deploy.</p>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </Section>
  );
}
