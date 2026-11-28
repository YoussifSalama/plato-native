import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { BrandHeader, today } from '../components/BrandHeader';
import { DateRange } from '../components/DateRange';
import { DayChart } from '../components/charts';
import { Empty, ErrorNote, Grid2, PageSkeleton, Section, Stat, StatGrid, StatusChip, Tabs } from '../components/ui';
import { useAuth } from '../lib/auth';
import { date, duration, money, num, num1, pct } from '../lib/format';
import { canSee } from '../lib/nav';
import { useRange } from '../lib/searchState';
import type { AttentionItem, Overview, RetentionRow } from '../lib/types';
import { useApi } from '../lib/useApi';

type TrendKey = 'active' | 'signups' | 'costUsd' | 'searches';
const TRENDS: { value: TrendKey; label: string }[] = [
  { value: 'active', label: 'Active users' },
  { value: 'signups', label: 'Signups' },
  { value: 'costUsd', label: 'Our cost' },
  { value: 'searches', label: 'Searches' },
];

/** What needs a look now. Red only for what is broken; nothing to show reads as "all clear". */
function Attention({ items }: { items: AttentionItem[] | null }) {
  if (!items) return null;
  if (!items.length)
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
        <CheckCircle2 className="size-4 text-success" /> Nothing needs your attention right now.
      </p>
    );
  return (
    <Section title="Needs your attention">
      <ul className="stagger flex flex-col divide-y divide-divider">
        {items.map((i) => (
          <li key={i.kind + i.title}>
            <Link to={i.link} className="group/att -mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-primary-tint">
              <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${i.severity === 'high' ? 'text-destructive' : 'text-warning'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{i.title}</span>
                <span className="block truncate text-xs text-text-secondary">{i.detail}</span>
              </span>
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-text-tertiary transition-transform group-hover/att:translate-x-0.5 group-hover/att:text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Each step of the signup funnel: how many reached it, and the share of the step before. */
function Funnel({ steps }: { steps: Overview['funnel'] }) {
  if (!steps[0]?.count) return <Empty>No signups in this range.</Empty>;
  return (
    <ol className="stagger flex flex-col gap-3">
      {steps.map((s, i) => (
        <li key={s.key} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span>{s.label}</span>
            <span className="shrink-0 tabular-nums">
              <b>{num(s.count)}</b>
              <span className="ml-2 text-xs text-text-tertiary">{i === 0 ? '100%' : `${pct(s.ofSignups)} · ${pct(s.ofPrevious)} of previous`}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="bar-grow h-2 rounded-full bg-primary" style={{ width: `${Math.max(1, (s.ofSignups ?? 0) * 100)}%`, animationDelay: `${i * 60}ms` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Signup-week cohorts: the share of each active in the weeks after (darker = more stayed). */
function Retention({ rows }: { rows: RetentionRow[] }) {
  const weeks = Math.max(...rows.map((r) => r.weeks.length), 0);
  if (!rows.some((r) => r.users)) return <Empty>No signups in the last {rows.length} weeks.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-left text-text-secondary">
            <th className="font-semibold">Signed up week of</th>
            <th className="text-right font-semibold">People</th>
            {Array.from({ length: weeks }, (_, k) => (
              <th key={k} className="text-center font-semibold">
                {k === 0 ? 'Week 0' : `+${k}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week}>
              <td className="whitespace-nowrap">{date(r.week)}</td>
              <td className="text-right tabular-nums">{num(r.users)}</td>
              {Array.from({ length: weeks }, (_, k) => {
                const v = r.weeks[k];
                return (
                  <td
                    key={k}
                    className="h-8 min-w-12 rounded-md text-center tabular-nums"
                    style={v === undefined || v === null ? undefined : { background: `color-mix(in oklch, var(--primary) ${Math.round(8 + v * 80)}%, white)`, color: v > 0.45 ? '#fff' : undefined }}
                  >
                    {v === undefined ? '' : v === null ? '—' : pct(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const { from, to: to_, setRange } = useRange();
  const { data, error, loading, reload } = useApi<Overview>('/admin/overview', { from, to: to_ });
  const attention = useApi<AttentionItem[]>('/admin/attention');
  const retention = useApi<RetentionRow[]>('/admin/retention');
  const [trend, setTrend] = useState<TrendKey>('active');
  const { me } = useAuth();
  // a tile links to its page only when this role can open it
  const to = (page: string, path: string) => (canSee(me?.pages, me?.isSuper, page) ? path : undefined);
  const q = `from=${from}&to=${to_}`;
  const c = data?.changes;

  return (
    <>
      <BrandHeader
        eyebrow={today()}
        title="Dashboard"
        live={!!data?.users.activeInRange}
        status={
          data ? (
            <>
              <b>{num(data.users.activeInRange)}</b> {data.users.activeInRange === 1 ? 'person' : 'people'} used Plato in this range · {money(data.costUsd)} spent
            </>
          ) : (
            'Plato at a glance for the selected range.'
          )
        }
        actions={<DateRange from={from} to={to_} onChange={setRange} />}
      />
      <Attention items={attention.data} />
      <ErrorNote error={error} onRetry={reload} />
      {!data && loading ? (
        <PageSkeleton stats={12} />
      ) : data ? (
        <>
          {data.previous && (
            <p className="mb-2 text-xs text-text-tertiary">
              Percentages compare with {date(data.previous.from)} – {date(new Date(new Date(data.previous.to).getTime() - 1).toISOString())}.
            </p>
          )}
          <StatGrid>
            <Stat label="Signups" to={to('users', '/users')} value={num(data.users.new)} change={c?.signups} hint={`${num(data.users.total)} users in all`} />
            <Stat label="Active users" to={to('users', '/users?sort=-lastActiveAt')} value={num(data.users.activeInRange)} change={c?.active} hint="Did anything in the range" />
            <Stat
              label="Our cost"
              to={to('usage', `/usage?${q}`)}
              value={money(data.costUsd)}
              change={c?.costUsd}
              good="down"
              hint={`${money(data.costMonthlyRunRateUsd)} a month at this pace`}
            />
            <Stat
              label={data.revenue.paymentsConnected ? 'Revenue / month' : 'Paid plans (set by hand)'}
              to={to('credits', '/credits')}
              value={money(data.revenue.plansMonthlyUsd)}
              hint={data.revenue.paymentsConnected ? `${num(data.revenue.paidUsers)} paying` : `${num(data.revenue.paidUsers)} users · no payments connected yet`}
            />
          </StatGrid>
          <div className="mt-3 sm:mt-4">
            <StatGrid>
              <Stat label="Searches" to={to('usage', `/usage/searches?${q}`)} value={num(data.searches.total)} change={c?.searches} hint="Job searches run" />
              <Stat
                label="Avg cost / search"
                to={to('usage', `/usage/searches?${q}`)}
                value={money(data.searches.avgCostUsd)}
                change={c?.avgSearchCostUsd}
                good="down"
                hint={data.searches.avgTokens === null ? undefined : `${num1(data.searches.avgTokens)} tokens to the seeker`}
              />
              <Stat
                label="Avg time / search"
                to={to('usage', `/usage/searches?${q}`)}
                value={duration(data.searches.avgDurationSec)}
                change={c?.avgSearchSec}
                good="down"
                hint="Start to results"
              />
              <Stat
                label="Cost / active user"
                to={to('users', '/users?sort=-costUsd')}
                value={money(data.perActiveUser.costUsd)}
                change={c?.costPerActiveUser}
                good="down"
                hint={data.perActiveUser.tokens === null ? undefined : `${num1(data.perActiveUser.tokens)} tokens spent each`}
              />
            </StatGrid>
          </div>
          <div className="mt-3 sm:mt-4">
            <StatGrid>
              <Stat label="Applications" value={num(data.applications.total)} change={c?.applications} hint={`${num(data.applications.submitted)} went through`} />
              <Stat
                label="Failed applications"
                value={num(data.applications.failed)}
                hint={data.applications.total ? `${pct(data.applications.failed / data.applications.total)} of all` : undefined}
                tone={data.applications.failed > 0 ? 'warning' : undefined}
              />
              <Stat
                label="Server errors"
                to={to('logs', `/logs?status=5xx&${q}`)}
                value={num(data.errors.server)}
                change={c?.serverErrors}
                good="down"
                tone={data.errors.server > 0 ? 'danger' : undefined}
                hint={`5xx: ours to fix · ${num(data.errors.client)} other 4xx`}
              />
              <Stat
                label="Ran out of tokens"
                to={to('logs', `/logs?status=402&${q}`)}
                value={num(data.errors.outOfTokens)}
                tone={data.errors.outOfTokens > 0 ? 'warning' : undefined}
                hint="Paid actions refused (402)"
              />
            </StatGrid>
          </div>
          <Grid2>
            <Section title="Every day" wide actions={<Tabs compact label="Metric" value={trend} onChange={setTrend} items={TRENDS} />}>
              <DayChart
                data={data.byDay}
                x="day"
                y={trend}
                name={TRENDS.find((t) => t.value === trend)!.label}
                format={trend === 'costUsd' ? money : num}
                height="h-56"
              />
            </Section>
            <Section title="Signup funnel">
              <Funnel steps={data.funnel} />
            </Section>
            <Section title="Costliest seekers">
              {data.topUsers.length === 0 ? (
                <Empty>No usage in this range.</Empty>
              ) : (
                <ul className="stagger flex flex-col divide-y divide-divider">
                  {data.topUsers.map((u) => (
                    <li key={u.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link to={`/users/${u.userId}`} className="min-w-0">
                        <span className="block truncate font-medium text-primary hover:underline">{u.email ?? u.userId}</span>
                        <span className="text-xs text-text-tertiary">
                          {u.plan} · {money(u.priceUsd)} / month
                        </span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        {u.costUsd > Math.max(u.priceUsd, 1) && <StatusChip tone="danger">Loss</StatusChip>}
                        <b className="tabular-nums">{money(u.costUsd)}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Do they come back?" wide>
              {retention.data ? <Retention rows={retention.data} /> : <Empty>Loading…</Empty>}
            </Section>
          </Grid2>
        </>
      ) : null}
    </>
  );
}
