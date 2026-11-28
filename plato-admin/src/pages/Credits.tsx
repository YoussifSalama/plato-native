import { Link, Navigate } from 'react-router';
import { ExportButton } from '../components/ExportButton';
import { DataTable } from '../components/DataTable';
import { Amount, LedgerDetail } from '../components/UserCredits';
import { DateRange } from '../components/DateRange';
import { ErrorNote, Filters, PageHeader, SearchInput, Section, Stat, StatGrid, Tabs } from '../components/ui';
import { dateTime, num, num1 } from '../lib/format';
import { useRange, useSearchState } from '../lib/searchState';
import type { LedgerPage, LedgerRow } from '../lib/types';
import { useApi } from '../lib/useApi';

const KINDS = [
  { value: '', label: 'All' },
  { value: 'manual', label: 'By an admin' },
  { value: 'grant', label: 'Grants' },
  { value: 'consume', label: 'Spent' },
  { value: 'topup', label: 'Top-ups' },
  { value: 'adjust', label: 'Adjustments' },
];

/**
 * Credits: every token movement across seekers, with totals for the range. One seeker's balance
 * and the support actions (adjust, top-up, plan) live on their user page.
 */
export default function Credits() {
  const [s, set] = useSearchState({ user: '', kind: '', q: '', page: '1' });
  const { from, to, setRange } = useRange();
  const page = Number(s.page) || 1;
  const { data, error, loading, reload } = useApi<LedgerPage>(s.user ? null : '/admin/credits/ledger', {
    kind: s.kind === 'manual' ? '' : s.kind,
    manual: s.kind === 'manual' ? '1' : '',
    q: s.q,
    from,
    to,
    page,
  });
  // old links (/credits?user=...) go to the seeker's page, where their tokens are now
  if (s.user) return /^[a-f0-9]{24}$/i.test(s.user) ? <Navigate to={`/users/${s.user}`} replace /> : <Navigate to={`/users?q=${encodeURIComponent(s.user)}`} replace />;
  const total = (k: string) => data?.totals.find((t) => t.kind === k);

  return (
    <>
      <PageHeader
        title="Credits"
        description="Every token movement: grants, spending, top-ups and every change an admin made. A seeker's balance and actions are on their page."
        actions={<DateRange from={from} to={to} onChange={setRange} />}
      />
      <StatGrid>
        <Stat label="Granted" value={num1(total('grant')?.amount ?? 0)} hint={`${num(total('grant')?.count ?? 0)} plan grants`} />
        <Stat label="Spent" value={num1(Math.abs(total('consume')?.amount ?? 0))} hint={`${num(total('consume')?.count ?? 0)} charges`} />
        <Stat label="Topped up" value={num1(total('topup')?.amount ?? 0)} hint={`${num(total('topup')?.count ?? 0)} packs recorded`} />
        <Stat label="Adjusted by admins" value={num1(total('adjust')?.amount ?? 0)} hint={`${num(total('adjust')?.count ?? 0)} adjustments`} />
      </StatGrid>
      <div className="mt-4">
        <Section
          actions={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Tabs compact label="Kind" value={s.kind} onChange={(kind) => set({ kind })} items={KINDS} />
              <div className="flex flex-wrap items-center gap-2">
                <Filters active={s.q ? 1 : 0}>
                  <SearchInput value={s.q} onChange={(q) => set({ q })} placeholder="Search seeker email or name" />
                </Filters>
                <ExportButton<LedgerRow>
                  name="token-movements"
                  path="/admin/credits/ledger"
                  query={{ kind: s.kind === 'manual' ? '' : s.kind, manual: s.kind === 'manual' ? '1' : '', q: s.q, from, to }}
                  columns={[
                    ['When', (r) => r.created_at],
                    ['Seeker', (r) => r.email],
                    ['Kind', (r) => r.kind],
                    ['Tokens', (r) => r.amount],
                    ['Balance after', (r) => r.balance_after],
                    ['Feature', (r) => r.feature],
                    ['Detail', (r) => r.meta],
                  ]}
                />
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
            loading={loading}
            rowKey={(r) => r.id}
            empty="No movements in this range."
            renderCard={(r) => (
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  {r.user_id ? (
                    <Link to={`/users/${r.user_id}`} className="block truncate font-medium text-primary">
                      {r.email ?? r.user_id}
                    </Link>
                  ) : (
                    <span className="text-text-tertiary">Deleted account</span>
                  )}
                  <span className="text-xs text-text-tertiary">
                    {r.kind} · {dateTime(r.created_at)}
                  </span>
                  <span className="block">
                    <LedgerDetail row={r} />
                  </span>
                </span>
                <Amount value={r.amount} />
              </span>
            )}
            columns={[
              { key: 'at', header: 'When', render: (r) => <span className="whitespace-nowrap">{dateTime(r.created_at)}</span> },
              {
                key: 'who',
                header: 'Seeker',
                render: (r) =>
                  r.user_id ? (
                    <Link to={`/users/${r.user_id}`} className="block max-w-[240px] truncate font-medium text-primary hover:underline">
                      {r.email ?? r.user_id}
                    </Link>
                  ) : (
                    <span className="text-text-tertiary">Deleted account</span>
                  ),
              },
              { key: 'kind', header: 'Kind', render: (r) => <span className="chip-neutral">{r.kind}</span> },
              { key: 'amount', header: 'Tokens', align: 'right', render: (r) => <Amount value={r.amount} /> },
              { key: 'what', header: 'Detail', hideOnMobile: true, render: (r) => <LedgerDetail row={r} /> },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
