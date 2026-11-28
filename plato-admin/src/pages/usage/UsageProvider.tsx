import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BarList, DayChart, providerLabel } from '../../components/charts';
import { DataTable, sortRows } from '../../components/DataTable';
import { ErrorNote, Grid2, Loading, Section, Stat, StatGrid } from '../../components/ui';
import { money, num } from '../../lib/format';
import { useRange } from '../../lib/searchState';
import type { ProviderUsage } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { NotFound } from '../../components/Shell';
import { PROVIDERS, type Provider } from '../../lib/types';

type ModelRow = ProviderUsage['byModel'][number];

export default function UsageProvider() {
  const { provider = '' } = useParams();
  const { from, to } = useRange();
  const valid = PROVIDERS.includes(provider as Provider);
  const { data, error, loading, reload } = useApi<ProviderUsage>(valid ? `/admin/usage/providers/${provider}` : null, { from, to });
  const [sort, setSort] = useState('-costUsd');

  if (!valid) return <NotFound />;
  if (!data) return loading ? <Loading /> : <ErrorNote error={error} onRetry={reload} />;
  const tokens = data.byModel.reduce((s, m) => s + m.inputTokens + m.outputTokens, 0);
  return (
    <>
      <ErrorNote error={error} onRetry={reload} />
      <StatGrid>
        <Stat label={`${providerLabel(provider)} cost`} value={money(data.totalCostUsd)} />
        <Stat label="Events" value={num(data.events)} />
        <Stat label="Cost per event" value={money(data.events ? data.totalCostUsd / data.events : 0)} />
        <Stat label="Tokens" value={num(tokens)} hint={provider === 'apify' ? 'Apify bills per run, not tokens' : 'Input + output'} />
      </StatGrid>
      <Grid2>
        <Section title="Cost per day" wide>
          <DayChart data={data.byDay} x="day" y="costUsd" name="Cost" />
        </Section>
        <Section title="By model" wide>
          <DataTable<ModelRow>
            rows={sortRows(data.byModel, sort, (r, f) => r[f as keyof ModelRow])}
            rowKey={(r) => r.model}
            sort={sort}
            onSort={setSort}
            empty="No calls in this range."
            columns={[
              { key: 'model', header: 'Model', sort: 'model', render: (r) => <span className="font-medium">{r.model}</span> },
              { key: 'cost', header: 'Cost', sort: 'costUsd', align: 'right', render: (r) => money(r.costUsd) },
              { key: 'events', header: 'Events', sort: 'events', align: 'right', render: (r) => num(r.events) },
              { key: 'in', header: 'Input tokens', sort: 'inputTokens', align: 'right', hideOnMobile: true, render: (r) => num(r.inputTokens) },
              { key: 'out', header: 'Output tokens', sort: 'outputTokens', align: 'right', hideOnMobile: true, render: (r) => num(r.outputTokens) },
            ]}
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
        <Section title="Top users">
          <DataTable
            rows={data.topUsers}
            rowKey={(r) => r.userId}
            empty="No users in this range."
            columns={[
              {
                key: 'email',
                header: 'User',
                render: (r) => (
                  <Link className="font-medium text-primary hover:underline" to={`/users/${r.userId}`}>
                    {r.email}
                  </Link>
                ),
              },
              { key: 'cost', header: 'Cost', align: 'right', render: (r) => money(r.costUsd) },
              { key: 'events', header: 'Events', align: 'right', render: (r) => num(r.events) },
            ]}
          />
        </Section>
      </Grid2>
    </>
  );
}
