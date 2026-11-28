import { DateRange } from '../components/DateRange';
import { BarList, providerColor, providerLabel } from '../components/charts';
import { ErrorNote, Grid2, Loading, PageHeader, Section, Stat, StatGrid } from '../components/ui';
import { money, num } from '../lib/format';
import { useRange } from '../lib/searchState';
import type { Overview } from '../lib/types';
import { useApi } from '../lib/useApi';

export default function Dashboard() {
  const { from, to, setRange } = useRange();
  const { data, error, loading, reload } = useApi<Overview>('/admin/overview', { from, to });
  const margin = data ? data.revenueUsdMonthly - data.costUsd : null;

  return (
    <>
      <PageHeader title="Dashboard" description="Plato at a glance for the selected range." actions={<DateRange from={from} to={to} onChange={setRange} />} />
      <ErrorNote error={error} onRetry={reload} />
      {!data && loading ? (
        <Loading />
      ) : data ? (
        <>
          <StatGrid>
            <Stat label="Users" value={num(data.users.total)} hint={`${num(data.users.new)} new · ${num(data.users.verified)} verified`} />
            <Stat label="Active in range" value={num(data.users.activeInRange)} hint={`${num(data.users.blocked)} blocked`} />
            <Stat label="Our cost" value={money(data.costUsd)} hint="All providers, this range" />
            <Stat
              label="Revenue / month"
              value={money(data.revenueUsdMonthly)}
              hint={margin === null ? undefined : `${money(margin)} after this range's cost`}
              tone={margin !== null && margin < 0 ? 'danger' : undefined}
            />
            <Stat label="Applications" value={num(data.applications.total)} hint={`${num(data.applications.submitted)} submitted`} />
            <Stat
              label="Failed applications"
              value={num(data.applications.failed)}
              hint={data.applications.total ? `${Math.round((data.applications.failed / data.applications.total) * 100)}% of all` : undefined}
              tone={data.applications.failed > 0 ? 'warning' : undefined}
            />
            <Stat label="Errors" value={num(data.errors.total)} tone={data.errors.total > 0 ? 'danger' : undefined} hint="Logged responses ≥ 400" />
            <Stat
              label="Errors by platform"
              value={`${num(data.errors.platform.web)} / ${num(data.errors.platform.extension)} / ${num(data.errors.platform.api)}`}
              hint="Web / extension / API"
            />
          </StatGrid>
          <Grid2>
            <Section title="Cost by provider">
              <BarList
                items={[...data.byProvider].sort((a, b) => b.costUsd - a.costUsd).map((p) => ({ key: p.provider, label: providerLabel(p.provider), value: p.costUsd }))}
                color={providerColor}
              />
            </Section>
            <Section title="Users">
              <BarList
                format={num}
                items={[
                  { key: 'total', label: 'All users', value: data.users.total },
                  { key: 'verified', label: 'Verified email', value: data.users.verified },
                  { key: 'active', label: 'Active in range', value: data.users.activeInRange },
                  { key: 'new', label: 'New in range', value: data.users.new },
                  { key: 'blocked', label: 'Blocked', value: data.users.blocked },
                ]}
              />
            </Section>
          </Grid2>
        </>
      ) : null}
    </>
  );
}
