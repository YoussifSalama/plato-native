import { BarList, providerColor, providerLabel, StackedDayChart } from '../../components/charts';
import { ErrorNote, Grid2, Loading, Section, Stat, StatGrid } from '../../components/ui';
import { money, num } from '../../lib/format';
import { useRange } from '../../lib/searchState';
import type { UsageOverview as T } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function UsageOverview() {
  const { from, to } = useRange();
  const { data, error, loading, reload } = useApi<T>('/admin/usage/overview', { from, to });
  if (!data) return loading ? <Loading /> : <ErrorNote error={error} onRetry={reload} />;
  const days = data.byDay.length || 1;
  const top = [...data.byProvider].sort((a, b) => b.costUsd - a.costUsd)[0];
  return (
    <>
      <ErrorNote error={error} onRetry={reload} />
      <StatGrid>
        <Stat label="Total cost" value={money(data.totalCostUsd)} />
        <Stat label="Events" value={num(data.events)} hint="Billable calls" />
        <Stat label="Per day" value={money(data.totalCostUsd / days)} hint={`Average over ${num(days)} days`} />
        <Stat label="Biggest provider" value={top ? providerLabel(top.provider) : '—'} hint={top ? money(top.costUsd) : undefined} />
      </StatGrid>
      <Grid2>
        <Section title="Cost per day" wide>
          <StackedDayChart data={data.byDay} />
        </Section>
        <Section title="By provider">
          <BarList
            color={providerColor}
            items={[...data.byProvider]
              .sort((a, b) => b.costUsd - a.costUsd)
              .map((p) => ({ key: p.provider, label: providerLabel(p.provider), value: p.costUsd, sub: `${num(p.events)} ev.` }))}
          />
        </Section>
        <Section title="By feature">
          <BarList
            items={[...data.byFeature]
              .sort((a, b) => b.costUsd - a.costUsd)
              .slice(0, 12)
              .map((f) => ({ key: f.feature, label: f.feature, value: f.costUsd, sub: `${num(f.events)} ev.` }))}
          />
        </Section>
      </Grid2>
    </>
  );
}
