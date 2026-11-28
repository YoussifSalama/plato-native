import { Link } from 'react-router';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, SearchInput, Section } from '../../components/ui';
import { money, num } from '../../lib/format';
import { defaultRange, useSearchState } from '../../lib/searchState';
import type { Paged, UsageUserRow } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function UsageUsers() {
  const [s, set] = useSearchState({ ...defaultRange(), q: '', sort: '-costUsd', page: '1' });
  const page = Number(s.page) || 1;
  const { data, error, loading, reload } = useApi<Paged<UsageUserRow>>('/admin/usage/users', { from: s.from, to: s.to, q: s.q, sort: s.sort, page });
  return (
    <Section title="Cost per user" actions={<SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Search email or name" />}>
      <ErrorNote error={error} onRetry={reload} />
      <DataTable
        rows={data?.items}
        total={data?.total}
        page={page}
        onPage={(p) => set({ page: String(p) })}
        sort={s.sort}
        onSort={(sort) => set({ sort })}
        loading={loading}
        rowKey={(r) => r.userId}
        empty="No usage in this range."
        columns={[
          {
            key: 'user',
            header: 'User',
            sort: 'email',
            render: (r) => (
              <Link to={`/users/${r.userId}`} className="block min-w-0">
                <span className="block truncate font-medium text-primary hover:underline">{r.email}</span>
                {r.name && <span className="block truncate text-xs text-text-tertiary">{r.name}</span>}
              </Link>
            ),
          },
          { key: 'plan', header: 'Plan', hideOnMobile: true, render: (r) => <span className="chip-neutral">{r.plan}</span> },
          { key: 'cost', header: 'Cost', sort: 'costUsd', align: 'right', render: (r) => money(r.costUsd) },
          { key: 'events', header: 'Events', sort: 'events', align: 'right', hideOnMobile: true, render: (r) => num(r.events) },
          { key: 'tokens', header: 'Tokens spent', sort: 'tokensSpent', align: 'right', render: (r) => num(r.tokensSpent) },
        ]}
      />
    </Section>
  );
}
