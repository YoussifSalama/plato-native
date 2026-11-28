import { Link } from 'react-router';
import { providerColor, providerLabel } from './charts';
import { DataTable } from './DataTable';
import { StatusChip } from './ui';
import { dateTime, duration, money, num, num1 } from '../lib/format';
import type { SearchRow } from '../lib/types';

const STATUS = { DONE: ['success', 'Done'], FAILED: ['danger', 'Failed'], RUNNING: ['primary', 'Running'] } as const;

/** Where one search's money went, as a thin stacked bar (provider colours, as on the Usage page). */
function CostSplit({ byProvider, total }: { byProvider: Record<string, number>; total: number }) {
  const parts = Object.entries(byProvider).filter(([, v]) => v > 0);
  if (!total || !parts.length) return null;
  return (
    <span className="mt-1 flex h-1.5 w-20 overflow-hidden rounded-full bg-muted" title={parts.map(([p, v]) => `${providerLabel(p)} ${money(v)}`).join(' · ')}>
      {parts.map(([p, v]) => (
        <span key={p} style={{ width: `${(v / total) * 100}%`, background: providerColor(p) }} />
      ))}
    </span>
  );
}

/**
 * Job searches as rows: who, when, how long, what they found, what they cost us and the seeker.
 * Never what was searched. `withUser` adds the seeker column (off on a seeker's own page).
 */
export function SearchesTable({
  rows,
  total,
  page,
  onPage,
  sort,
  onSort,
  loading,
  withUser = true,
}: {
  rows?: SearchRow[];
  total?: number;
  page: number;
  onPage: (p: number) => void;
  sort: string;
  onSort: (s: string) => void;
  loading: boolean;
  withUser?: boolean;
}) {
  return (
    <DataTable
      rows={rows}
      total={total}
      page={page}
      onPage={onPage}
      sort={sort}
      onSort={onSort}
      loading={loading}
      rowKey={(r) => r.id}
      empty="No searches in this range."
      columns={[
        { key: 'when', header: 'Started', sort: 'startedAt', render: (r) => <span className="whitespace-nowrap">{dateTime(r.startedAt)}</span> },
        ...(withUser
          ? [
              {
                key: 'user',
                header: 'Seeker',
                render: (r: SearchRow) =>
                  r.userId ? (
                    <Link to={`/users/${r.userId}`} className="block min-w-0" onClick={(e) => e.stopPropagation()}>
                      <span className="block max-w-[220px] truncate font-medium text-primary hover:underline">{r.email ?? r.userId}</span>
                      {r.plan && <span className="text-xs text-text-tertiary">{r.plan}</span>}
                    </Link>
                  ) : (
                    '—'
                  ),
              },
            ]
          : []),
        {
          key: 'status',
          header: 'Status',
          render: (r) => <StatusChip tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</StatusChip>,
        },
        { key: 'time', header: 'Took', sort: 'durationSec', align: 'right', render: (r) => (r.status === 'RUNNING' ? '…' : duration(r.durationSec)) },
        {
          key: 'results',
          header: 'Found / kept',
          sort: 'shortlisted',
          align: 'right',
          hideOnMobile: true,
          render: (r) => (
            <span title="Jobs fetched from every source / ranked and kept for the seeker">
              {num(r.fetched)} <span className="text-text-tertiary">/</span> {num(r.shortlisted)}
            </span>
          ),
        },
        {
          key: 'cost',
          header: 'Our cost',
          sort: 'costUsd',
          align: 'right',
          render: (r) => (
            <span className="inline-flex flex-col items-end">
              <span>
                {money(r.costUsd)}
                {r.attribution === 'estimated' && (
                  <span className="ml-1 text-xs text-text-tertiary" title="From before searches were tagged: matched by seeker and time">
                    est.
                  </span>
                )}
              </span>
              <CostSplit byProvider={r.byProvider} total={r.costUsd} />
            </span>
          ),
        },
        { key: 'tokens', header: 'Tokens', sort: 'tokens', align: 'right', hideOnMobile: true, render: (r) => num1(r.tokens) },
      ]}
    />
  );
}
