import { Link, useNavigate } from 'react-router';
import { Gauge } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, Tabs, PageHeader, SearchInput, Section, StatusChip } from '../../components/ui';
import { date, money, num1 } from '../../lib/format';
import { useSearchState } from '../../lib/searchState';
import type { Paged, UserRow, UserStatus } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';

const STATUSES: { value: UserStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'blocked', label: 'Blocked' },
];

export function UserStatusChip({ u }: { u: { blocked: boolean; verified: boolean } }) {
  if (u.blocked) return <StatusChip tone="danger">Blocked</StatusChip>;
  if (!u.verified) return <StatusChip tone="warning">Unverified</StatusChip>;
  return <StatusChip tone="success">Verified</StatusChip>;
}

export default function UsersList() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [s, set] = useSearchState({ q: '', status: 'all', sort: '-createdAt', page: '1' });
  const page = Number(s.page) || 1;
  const { data, error, loading, reload } = useApi<Paged<UserRow>>('/admin/users', { q: s.q, status: s.status, sort: s.sort, page });

  return (
    <>
      <PageHeader
        title="Users"
        description="Every seeker account. Open one for their activity and account actions."
        actions={
          // the limiter list is the super admin's (it holds the panel's own sign-in limits too)
          me?.isSuper && (
            <Link to="/users/rate-limits" className="btn-outline">
              <Gauge className="size-4" /> Rate limits
            </Link>
          )
        }
      />
      <Section
        actions={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Tabs compact label="Status" value={s.status as UserStatus} onChange={(status) => set({ status })} items={STATUSES} />
            <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Search email or name" />
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
          onRowClick={(r) => nav(`/users/${r.id}`)}
          empty="No users match."
          columns={[
            {
              key: 'user',
              header: 'User',
              sort: 'email',
              render: (r) => (
                <span className="block min-w-0">
                  <span className="block truncate font-medium text-primary">{r.email}</span>
                  {r.name && <span className="block truncate text-xs text-text-tertiary">{r.name}</span>}
                </span>
              ),
            },
            { key: 'status', header: 'Status', render: (r) => <UserStatusChip u={r} /> },
            { key: 'plan', header: 'Plan', hideOnMobile: true, render: (r) => <span className="chip-neutral">{r.plan}</span> },
            { key: 'balance', header: 'Balance', sort: 'balance', align: 'right', hideOnMobile: true, render: (r) => num1(r.balance) },
            { key: 'cost', header: 'Our cost', sort: 'costUsd', align: 'right', hideOnMobile: true, render: (r) => money(r.costUsd) },
            { key: 'last', header: 'Last active', sort: 'lastActiveAt', hideOnMobile: true, render: (r) => date(r.lastActiveAt) },
            { key: 'created', header: 'Joined', sort: 'createdAt', render: (r) => date(r.createdAt) },
          ]}
        />
      </Section>
    </>
  );
}
