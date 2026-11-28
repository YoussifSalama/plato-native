import { ErrorNote, PageSkeleton, Section, Stat, StatGrid, Tabs } from '../../components/ui';
import { SearchesTable } from '../../components/SearchesTable';
import { duration, money, num, num1, pct } from '../../lib/format';
import { defaultRange, useSearchState } from '../../lib/searchState';
import type { SearchesResponse } from '../../lib/types';
import { useApi } from '../../lib/useApi';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
];

/** Every job search in the range, priced: what one search costs us and the seeker, and how long it takes. */
export default function UsageSearches() {
  const [s, set] = useSearchState({ ...defaultRange(), status: '', sort: '-startedAt', page: '1' });
  const page = Number(s.page) || 1;
  const { data, error, loading, reload } = useApi<SearchesResponse>('/admin/usage/searches', { from: s.from, to: s.to, status: s.status, sort: s.sort, page });
  const sum = data?.summary;
  return (
    <>
      <ErrorNote error={error} onRetry={reload} />
      {!sum ? (
        loading && <PageSkeleton stats={8} />
      ) : (
        <>
          <StatGrid>
            <Stat label="Searches" value={num(sum.searches)} hint={`${num(sum.searchers)} seekers · ${num1(sum.searchesPerSearcher)} each`} />
            <Stat label="Avg cost / search" value={money(sum.avgCostUsd)} hint={`Median ${money(sum.p50CostUsd)} · p90 ${money(sum.p90CostUsd)}`} />
            <Stat label="Avg time / search" value={duration(sum.avgDurationSec)} hint={`Median ${duration(sum.p50DurationSec)} · p90 ${duration(sum.p90DurationSec)}`} />
            <Stat label="Avg tokens / search" value={num1(sum.avgTokens)} hint="What the seeker pays, in Plato tokens" />
            <Stat label="Total cost" value={money(sum.totalCostUsd)} hint={`${num1(sum.totalTokens)} tokens charged`} />
            <Stat label="Jobs kept / search" value={num1(sum.avgShortlisted)} hint={`of ${num1(sum.avgFetched)} fetched`} />
            <Stat label="Cost per kept job" value={money(sum.costPerShortlistedUsd)} hint="Our cost ÷ jobs kept for seekers" />
            <Stat
              label="Failed"
              value={num(sum.failed)}
              hint={sum.searches ? `${pct(sum.failed / sum.searches)} of searches` : undefined}
              tone={sum.failed > 0 ? 'warning' : undefined}
            />
          </StatGrid>
          {sum.estimated > 0 && (
            <p className="mt-3 text-xs text-text-tertiary">
              {num(sum.estimated)} older searches ran before each search was tagged: their cost is matched by seeker and time (“est.”).
            </p>
          )}
        </>
      )}
      <div className="mt-4">
        <Section title="Every search" actions={<Tabs compact label="Status" value={s.status} onChange={(status) => set({ status })} items={STATUSES} />}>
          <SearchesTable rows={data?.items} total={data?.total} page={page} onPage={(p) => set({ page: String(p) })} sort={s.sort} onSort={(sort) => set({ sort })} loading={loading} />
        </Section>
      </div>
    </>
  );
}
