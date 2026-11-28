import { BarList, DayChart } from '../../components/charts';
import { SearchesTable } from '../../components/SearchesTable';
import { Empty, ErrorNote, Grid2, KeyValues, Section, Skeleton, Stat, StatGrid, StatusChip } from '../../components/ui';
import { date, duration, money, num, num1 } from '../../lib/format';
import { useSearchState } from '../../lib/searchState';
import type { Engagement, PlanFit, SearchesResponse } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import { canSee } from '../../lib/nav';
import { Link } from 'react-router';

const VERDICT = {
  short: ['danger', 'Plan too small'],
  tight: ['warning', 'Close to the limit'],
  enough: ['success', 'Plan is enough'],
  unused: ['neutral', 'Not used yet'],
} as const;

/** Used and projected tokens against the plan's grant: one bar, the projection as a lighter tail. */
function PlanBar({ fit }: { fit: PlanFit }) {
  const used = Math.min(100, fit.usedPct ?? 0);
  const projected = Math.min(100, fit.projectedPct ?? 0);
  const tone = fit.verdict === 'short' ? 'var(--destructive)' : fit.verdict === 'tight' ? 'var(--warning)' : 'var(--primary)';
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${num1(fit.usedPct)}% of the grant used, ${num1(fit.projectedPct)}% projected`}>
        <div className="bar-grow absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${projected}%`, background: tone }} />
        <div className="bar-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${used}%`, background: tone }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-text-tertiary">
        <span>
          {num1(fit.used)} used · {num1(fit.projected)} at this pace
        </span>
        <span>{num(fit.grant)} / month</span>
      </div>
    </div>
  );
}

/**
 * How one seeker uses Plato: time in the app, the pages they open, whether their plan covers them,
 * what they cost against the average user, and every search they ran (priced, never the query).
 */
export function UserEngagement({ id, from, to }: { id: string; from: string; to: string }) {
  const { data, error, reload } = useApi<Engagement>(`/admin/users/${id}/engagement`, { from, to });
  const [s, set] = useSearchState({ ssort: '-startedAt', spage: '1' });
  const spage = Number(s.spage) || 1;
  const searches = useApi<SearchesResponse>('/admin/usage/searches', { from, to, userId: id, sort: s.ssort, page: spage });
  const sum = searches.data?.summary;
  const fit = data?.planFit;
  const { me } = useAuth();
  const canLogs = canSee(me?.pages, me?.isSuper, 'logs');

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text-secondary">How they use Plato</h2>
        {data && canLogs && (
          <Link to={`/logs?user=${id}&from=${from}&to=${to}`} className="text-sm font-semibold text-primary hover:underline">
            {num(Object.values(data.errors ?? {}).reduce((a, b) => a + b, 0))} failed requests in this range →
          </Link>
        )}
      </div>
      <ErrorNote error={error ?? searches.error} onRetry={() => (reload(), searches.reload())} />
      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <StatGrid>
          <Stat label="Time in app" value={duration(data.timeInApp.seconds)} hint={`${num(data.timeInApp.activeDays)} days with activity`} />
          <Stat label="Per active day" value={duration(data.timeInApp.avgSecondsPerActiveDay)} hint="Average session time" />
          <Stat
            label="Searches"
            value={num(sum?.searches ?? 0)}
            hint={sum?.avgCostUsd != null ? `${money(sum.avgCostUsd)} · ${duration(sum.avgDurationSec)} each on average` : 'None in this range'}
          />
          <Stat
            label="Cost vs average"
            value={data.cost.vsAverage === null ? '—' : `${num1(data.cost.vsAverage)}×`}
            hint={data.cost.avgActiveUserCostUsd === null ? undefined : `${money(data.cost.costUsd)} vs ${money(data.cost.avgActiveUserCostUsd)} per active user`}
            tone={data.cost.vsAverage !== null && data.cost.vsAverage >= 3 ? 'warning' : undefined}
          />
        </StatGrid>
      )}
      {data && (
        <Grid2>
          <Section title="Time in app per day" wide>
            {data.timeInApp.byDay.length === 0 ? (
              <Empty>
                No time recorded in this range.
                {data.trackedSince ? ` Time is recorded since ${date(data.trackedSince)}.` : ' Time is recorded from the web app’s next release.'}
              </Empty>
            ) : (
              <DayChart
                data={data.timeInApp.byDay.map((d) => ({ day: d.day, minutes: Math.round((d.seconds / 60) * 10) / 10 }))}
                x="day"
                y="minutes"
                name="Minutes"
                format={num1}
                height="h-48"
              />
            )}
          </Section>
          <Section title="Pages they use">
            {data.pages.length === 0 ? (
              <Empty>No page visits recorded in this range.</Empty>
            ) : (
              <BarList
                format={(v) => duration(v)}
                items={data.pages.slice(0, 12).map((p) => ({ key: p.page, label: <span className="font-mono text-xs">{p.page}</span>, value: p.seconds, sub: `${num(p.views)} views` }))}
              />
            )}
          </Section>
          <Section
            title="Is the plan enough?"
            actions={fit && <StatusChip tone={VERDICT[fit.verdict][0]}>{VERDICT[fit.verdict][1]}</StatusChip>}
          >
            {!fit ? (
              <Empty>No token account yet.</Empty>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm">{fit.advice}</p>
                <PlanBar fit={fit} />
                <KeyValues
                  rows={[
                    ['Plan', `${fit.plan} · ${money(fit.priceUsd)} / month`],
                    ['This period', `${date(fit.periodStart)} – ${date(fit.periodEnd)} (${num(fit.daysLeft)} days left)`],
                    ['Balance', num1(fit.balance)],
                    ['Top-ups', fit.toppedUp ? `${num1(fit.toppedUp)} tokens bought` : 'None'],
                    ['Ran out', fit.ranOut ? `${num(fit.ranOut)} times (402)` : 'Never'],
                  ]}
                />
              </div>
            )}
          </Section>
          <Section title={`Their searches${sum ? ` · ${num(sum.searches)}` : ''}`} wide>
            <SearchesTable
              withUser={false}
              rows={searches.data?.items}
              total={searches.data?.total}
              page={spage}
              onPage={(p) => set({ spage: String(p) })}
              sort={s.ssort}
              onSort={(ssort) => set({ ssort })}
              loading={searches.loading}
            />
          </Section>
        </Grid2>
      )}
    </div>
  );
}
