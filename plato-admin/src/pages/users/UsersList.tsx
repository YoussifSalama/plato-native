import { Link, useNavigate } from 'react-router';
import { ExportButton } from '../../components/ExportButton';
import { Gauge } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import { ErrorNote, Filters, Tabs, PageHeader, SearchInput, Section, StatusChip } from '../../components/ui';
import { date, money, num1 } from '../../lib/format';
import { useSearchState } from '../../lib/searchState';
import type { Paged, PlansResponse, UserRow, UserStatus } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { canSee } from '../../lib/nav';

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
  const [s, set] = useSearchState({ q: '', status: 'all', plan: '', joined: '', active: '', loss: '', sort: '-createdAt', page: '1' });
  const page = Number(s.page) || 1;
  const { data, error, loading, reload } = useApi<Paged<UserRow>>('/admin/users', {
    q: s.q,
    status: s.status,
    plan: s.plan,
    joined: s.joined,
    active: s.active,
    loss: s.loss,
    sort: s.sort,
    page,
  });
  // plan names for the filter; a role without Plans/Credits gets the built-in ones
  const plans = useApi<PlansResponse>(canSee(me?.pages, me?.isSuper, 'plans') || canSee(me?.pages, me?.isSuper, 'credits') ? '/admin/plans' : null);
  const planKeys = plans.data?.items.filter((p) => p.kind === 'plan').map((p) => p.key) ?? ['free', 'pro', 'max'];
  const active = [s.q, s.plan, s.joined, s.active, s.loss].filter(Boolean).length;

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
            <Filters active={active}>
              <select className="input w-auto" aria-label="Plan" value={s.plan} onChange={(e) => set({ plan: e.target.value })}>
                <option value="">Every plan</option>
                {planKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select className="input w-auto" aria-label="Joined" value={s.joined} onChange={(e) => set({ joined: e.target.value })}>
                <option value="">Joined any time</option>
                <option value="7">Joined in the last 7 days</option>
                <option value="30">Joined in the last 30 days</option>
                <option value="90">Joined in the last 90 days</option>
              </select>
              <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm">
                <input type="checkbox" checked={s.active === '1'} onChange={(e) => set({ active: e.target.checked ? '1' : '' })} />
                Active in the last 7 days
              </label>
              <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm">
                <input type="checkbox" checked={s.loss === '1'} onChange={(e) => set({ loss: e.target.checked ? '1' : '' })} />
                Cost more than their plan
              </label>
              <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Search email or name" />
            </Filters>
            <ExportButton<UserRow>
              name="users"
              path="/admin/users"
              query={{ q: s.q, status: s.status, plan: s.plan, joined: s.joined, active: s.active, loss: s.loss, sort: s.sort }}
              columns={[
                ['Email', (r) => r.email],
                ['Name', (r) => r.name],
                ['Joined', (r) => r.createdAt],
                ['Verified', (r) => (r.verified ? 'yes' : 'no')],
                ['Blocked', (r) => (r.blocked ? 'yes' : 'no')],
                ['Plan', (r) => r.plan],
                ['Balance', (r) => r.balance],
                ['Our cost USD (all time)', (r) => r.costUsd],
                ['Last active', (r) => r.lastActiveAt],
              ]}
            />
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
