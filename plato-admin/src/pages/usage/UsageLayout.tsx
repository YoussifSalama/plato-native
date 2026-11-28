import { Outlet, useLocation } from 'react-router';
import { DateRange } from '../../components/DateRange';
import { PageHeader, RouteTabs } from '../../components/ui';
import { useRange } from '../../lib/searchState';

/** Usage pages share the header, the range (kept in the URL across tabs) and the tabs. */
export default function UsageLayout() {
  const { from, to, setRange } = useRange();
  const { search } = useLocation();
  // keep only the range when switching tabs
  const p = new URLSearchParams(search);
  const keep = new URLSearchParams();
  for (const k of ['from', 'to']) if (p.get(k)) keep.set(k, p.get(k)!);
  const q = keep.toString() ? `?${keep}` : '';
  return (
    <>
      <PageHeader title="Usage & cost" description="What Plato spends on each provider and feature." actions={<DateRange from={from} to={to} onChange={setRange} />} />
      <RouteTabs
        items={[
          { to: `/usage${q}`, label: 'Overview', end: true },
          { to: `/usage/apify${q}`, label: 'Apify' },
          { to: `/usage/anthropic${q}`, label: 'Anthropic' },
          { to: `/usage/openai${q}`, label: 'OpenAI' },
          { to: `/usage/other${q}`, label: 'Other' },
          { to: `/usage/searches${q}`, label: 'Searches' },
          { to: `/usage/users${q}`, label: 'By user' },
        ]}
      />
      <Outlet />
    </>
  );
}
