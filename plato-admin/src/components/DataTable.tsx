import { Fragment, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { num } from '../lib/format';
import { Skeleton } from './ui';

export const PAGE_SIZE = 50;

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Backend sort field; the header becomes a toggle. Sort is sent as `field` (asc) or `-field` (desc). */
  sort?: string;
  align?: 'left' | 'right';
  /** Hidden below `sm` to keep phone tables readable. */
  hideOnMobile?: boolean;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty = 'Nothing to show.',
  sort,
  onSort,
  page,
  total,
  onPage,
  onRowClick,
  expanded,
  renderExpanded,
}: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  sort?: string;
  onSort?: (sort: string) => void;
  page?: number;
  total?: number;
  onPage?: (page: number) => void;
  onRowClick?: (row: T) => void;
  expanded?: string | null;
  renderExpanded?: (row: T) => ReactNode;
}) {
  const desc = sort?.startsWith('-');
  const field = sort?.replace(/^-/, '');
  const pages = total !== undefined ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  return (
    <div className="min-w-0">
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-divider text-left text-xs font-semibold text-text-secondary">
              {columns.map((c) => {
                const active = c.sort && field === c.sort;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}
                    className={`px-4 py-2.5 font-semibold whitespace-nowrap first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5 ${c.align === 'right' ? 'text-right' : ''} ${c.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  >
                    {c.sort && onSort ? (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-primary' : ''}`}
                        // first click on a column sorts descending (biggest / newest first)
                        onClick={() => onSort(active && desc ? c.sort! : `-${c.sort}`)}
                      >
                        {c.header}
                        {active && (desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={loading && rows?.length ? 'opacity-60 transition-opacity' : ''}>
            {rows?.map((r) => {
              const id = rowKey(r);
              return (
                <Fragment key={id}>
                  <tr
                    className={`border-b border-divider transition-colors duration-150 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-primary-tint' : ''} ${expanded === id ? 'bg-primary-tint' : ''}`}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2.5 align-top first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.hideOnMobile ? 'hidden sm:table-cell' : ''} ${c.className ?? ''}`}
                      >
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                  {expanded === id && renderExpanded && (
                    <tr className="fade-in border-b border-divider bg-primary-tint">
                      <td colSpan={columns.length} className="px-4 pb-4 sm:px-5">
                        {renderExpanded(r)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {loading && !rows?.length && (
        // the table's shape while the first page loads
        <div className="fade-in flex flex-col gap-3 py-3" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 flex-[2]" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 flex-1 sm:block" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
            </div>
          ))}
        </div>
      )}
      {!loading && rows?.length === 0 && <p className="py-10 text-center text-sm text-text-tertiary">{empty}</p>}
      {page !== undefined && total !== undefined && onPage && total > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-divider pt-3 text-xs text-text-secondary">
          <span>
            {num((page - 1) * PAGE_SIZE + 1)}–{num(Math.min(total, page * PAGE_SIZE))} of {num(total)}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className="btn-ghost h-8 px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <button type="button" className="btn-ghost h-8 px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Client-side sort for small lists the API returns whole (by model, by feature...). */
export function sortRows<T>(rows: T[] | undefined, sort: string | undefined, get: (row: T, field: string) => unknown): T[] {
  if (!rows) return [];
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const field = sort.replace(/^-/, '');
  return [...rows].sort((a, b) => {
    const x = get(a, field);
    const y = get(b, field);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
    return desc ? -c : c;
  });
}
