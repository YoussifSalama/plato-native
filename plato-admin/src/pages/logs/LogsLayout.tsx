import { Outlet, useLocation } from 'react-router';
import { DateRange } from '../../components/DateRange';
import { PageHeader, RouteTabs } from '../../components/ui';
import { useRange } from '../../lib/searchState';

/** Logs pages share the header, the range (kept in the URL across tabs) and the tabs. */
export default function LogsLayout() {
  const { from, to, setRange } = useRange();
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  const keep = new URLSearchParams();
  for (const k of ['from', 'to']) if (p.get(k)) keep.set(k, p.get(k)!);
  const q = keep.toString() ? `?${keep}` : '';
  return (
    <>
      <PageHeader
        title="Logs"
        description="Every failed request and extension error, with a plain reason for each."
        actions={<DateRange from={from} to={to} onChange={setRange} />}
      />
      <RouteTabs
        items={[
          { to: `/logs${q}`, label: 'Platform', end: true },
          { to: `/logs/extension${q}`, label: 'Extension' },
        ]}
      />
      <Outlet />
    </>
  );
}
