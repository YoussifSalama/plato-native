import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, type Query } from '../lib/api';
import { download, fetchAll, MAX_EXPORT_ROWS, toCsv, type CsvColumn } from '../lib/csv';
import { isoDay } from '../lib/format';
import { Spinner } from './ui';

/**
 * Downloads every row that matches the page's current filters (not only the visible page) as CSV,
 * up to 10,000 rows. The file is named after the page and the day.
 */
export function ExportButton<T>({ path, query, columns, name }: { path: string; query?: Query; columns: CsvColumn<T>[]; name: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async () => {
    setBusy('0');
    try {
      const { rows, total } = await fetchAll<T>(path, query, (n, t) => setBusy(`${n}/${t}`));
      download(`plato-${name}-${isoDay(new Date())}.csv`, toCsv(rows, columns));
      toast.success(total > MAX_EXPORT_ROWS ? `Exported the first ${MAX_EXPORT_ROWS.toLocaleString()} of ${total.toLocaleString()} rows: narrow the filters for the rest.` : `Exported ${rows.length.toLocaleString()} rows`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <button type="button" className="btn-outline h-8" onClick={() => void run()} disabled={busy !== null} title="Download every row matching these filters as CSV">
      {busy !== null ? <Spinner /> : <Download className="size-4" />}
      <span className="hidden sm:inline">{busy !== null && busy !== '0' ? busy : 'Export'}</span>
    </button>
  );
}
