import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Loader2 } from 'lucide-react';
import type { ApiError } from '../lib/api';

/** Title on the left, the page's action bar on the right — the same spot on every page. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

/** One KPI tile. Every tile is the same size; `tone` only for meaning. */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-success-ink' : tone === 'warning' ? 'text-warning-ink' : tone === 'danger' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="card flex min-h-[104px] flex-col">
      <p className="text-xs font-semibold tracking-wide text-text-secondary uppercase">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{children}</div>;
}

/** A titled card; `wide` spans both columns of a `Grid2`. */
export function Section({ title, actions, children, wide }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card min-w-0 ${wide ? 'lg:col-span-2' : ''}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Grid2({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`size-4 animate-spin text-primary ${className}`} aria-label="Loading" />;
}

export function Empty({ children = 'Nothing here for this range.' }: { children?: ReactNode }) {
  return <p className="py-8 text-center text-sm text-text-tertiary">{children}</p>;
}

export function ErrorNote({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
      <span>{error.message}</span>
      {onRetry && (
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading the first time: a spinner in place of the content, never a blank page. */
export function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner className="size-6" />
    </div>
  );
}

export type TabItem = { to: string; label: string; end?: boolean };

/** Route tabs. Scrolls sideways on phones instead of wrapping. */
export function RouteTabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'tab-active' : ''}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** State tabs (no route change). */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'tab-active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A colour only when it means something. */
export function StatusChip({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'neutral' | 'primary'; children: ReactNode }) {
  return <span className={`chip-${tone}`}>{children}</span>;
}

export function SearchInput({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="search"
      className="input sm:w-64"
      placeholder={placeholder}
      defaultValue={value}
      // commit on Enter or after typing stops, not on every key (each commit is a request)
      onKeyDown={(e) => {
        if (e.key === 'Enter') onChange((e.target as HTMLInputElement).value.trim());
      }}
      onChange={(e) => {
        const el = e.target;
        window.clearTimeout(Number(el.dataset.t));
        el.dataset.t = String(window.setTimeout(() => onChange(el.value.trim()), 350));
      }}
    />
  );
}

/** label: value rows (user profile, log detail). */
export function KeyValues({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-secondary">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
