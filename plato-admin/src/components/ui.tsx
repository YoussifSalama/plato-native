import { useId, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import * as m from 'motion/react-m';
import type { ApiError } from '../lib/api';
import { num } from '../lib/format';
import { spring } from '../lib/motion';
import { NAV } from '../lib/nav';
import { BrandHeader } from './BrandHeader';
import { CountUp } from './CountUp';

/**
 * Every page's header: the brand panel (components/BrandHeader.tsx) with the section's name as its
 * eyebrow, the title, its description, and the page's action bar on the right — the same spot on every page.
 */
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  const { pathname } = useLocation();
  const section = NAV.find((n) => n.to !== '/' && (pathname === n.to || pathname.startsWith(`${n.to}/`)))?.label;
  // the section's name only where it adds something (a user's page, Rate limits), never above the same title
  const crumb = eyebrow ?? (section && section !== title ? section : undefined);
  return <BrandHeader eyebrow={crumb} title={title} description={description} actions={actions} />;
}

/**
 * One KPI tile. Every tile is the same size; `tone` only for meaning. The number counts up.
 * With `to` the tile is a link: it leans toward the pointer and shows where it goes.
 */
export function Stat({
  label,
  value,
  hint,
  tone,
  to,
  change,
  good = 'up',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'success' | 'warning' | 'danger';
  to?: string;
  /** Change against the previous period (0.12 = +12%); green when it moved the `good` way. */
  change?: number | null;
  good?: 'up' | 'down';
}) {
  const color =
    tone === 'success' ? 'text-success-ink' : tone === 'warning' ? 'text-warning-ink' : tone === 'danger' ? 'text-destructive' : 'text-foreground';
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        <span className="truncate">{label}</span>
        {to && <ArrowUpRight className="size-3.5 shrink-0 text-text-tertiary transition-[translate,color] duration-200 group-hover/stat:translate-x-0.5 group-hover/stat:-translate-y-0.5 group-hover/stat:text-primary" />}
      </p>
      <p className={`mt-2 flex items-baseline gap-2 text-2xl font-bold tabular-nums ${color}`}>
        <CountUp value={value} />
        {change !== undefined && <Delta change={change} good={good} />}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-text-tertiary">{hint}</p>}
    </>
  );
  if (to)
    return (
      <Link to={to} className="card card-lift group/stat flex min-h-[104px] flex-col" aria-label={`${label}: open`}>
        {body}
      </Link>
    );
  return <div className="card flex min-h-[104px] flex-col">{body}</div>;
}

/** "+12%" against the previous period: green when better, red when worse, grey when flat or unknown. */
export function Delta({ change, good = 'up' }: { change: number | null; good?: 'up' | 'down' }) {
  if (change === null) return <span className="text-xs font-semibold text-text-tertiary" title="Nothing to compare with in the previous period">—</span>;
  const flat = Math.abs(change) < 0.005;
  const better = good === 'up' ? change > 0 : change < 0;
  const color = flat ? 'text-text-tertiary' : better ? 'text-success-ink' : 'text-destructive';
  // from almost nothing, a percentage is noise: say how many times bigger instead
  const pctText = change >= 9.995 ? `×${num(change + 1)}` : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`;
  return (
    <span className={`text-xs font-semibold ${color}`} title="Against the same length of time just before">
      {flat ? '±0%' : pctText}
    </span>
  );
}

/** A row of KPI tiles; they rise in one after another. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{children}</div>;
}

/** The shape of a StatGrid while its numbers load. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card fx-off flex min-h-[104px] flex-col gap-3">
          <span className="skeleton h-3 w-20" />
          <span className="skeleton h-6 w-24" />
          <span className="skeleton h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** A grey block with a light sweeping across it, in the shape of what is loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
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
  return <div className="stagger mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
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
    <div className="fade-in flex items-center justify-center py-16">
      <Spinner className="size-6" />
    </div>
  );
}

/** Loading a page of KPIs and two cards: their shapes, sweeping, instead of a spinner. */
export function PageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="fade-in">
      <StatGridSkeleton count={stats} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card fx-off flex flex-col gap-4">
            <Skeleton className="h-4 w-36" />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex flex-col gap-1.5">
                <Skeleton className="h-3" />
                <Skeleton className="h-2 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export type TabItem = { to: string; label: string; end?: boolean };

// Tabs, the seeker app's way (components/pill-tabs.tsx): a muted pill track with a white pill
// that slides under the active tab. Every tab strip in the panel uses these, so they all move alike.
const TRACK = 'no-scrollbar flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-muted p-1';
const PILL_TAB = 'relative flex shrink-0 items-center rounded-full px-3.5 font-semibold whitespace-nowrap transition-colors';

function Pill({ id }: { id: string }) {
  return <m.span layoutId={id} transition={spring.micro} className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(14_27_44/0.08)] ring-1 ring-border/70" />;
}

/** Route tabs. Scrolls sideways on phones instead of wrapping. */
export function RouteTabs({ items }: { items: TabItem[] }) {
  const id = useId();
  return (
    <nav className={`${TRACK} mb-4`}>
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => `${PILL_TAB} h-8 text-[13.5px] ${isActive ? 'text-primary' : 'text-text-secondary hover:text-foreground'}`}
        >
          {({ isActive }) => (
            <>
              {isActive && <Pill id={id} />}
              <span className="relative">{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** State tabs (no route change). `compact` for a filter row inside a card. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  compact,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
  label?: string;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className={`${TRACK} ${compact ? '' : 'mb-4'}`}>
      {items.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${PILL_TAB} ${compact ? 'h-7 px-3 text-[13px]' : 'h-8 text-[13.5px]'} ${active ? 'text-primary' : 'text-text-secondary hover:text-foreground'}`}
            onClick={() => onChange(t.value)}
          >
            {active && <Pill id={id} />}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A colour only when it means something. */
// Whole class names, so Tailwind finds them (a built `chip-${tone}` is never generated).
const CHIP = { success: 'chip-success', warning: 'chip-warning', danger: 'chip-danger', neutral: 'chip-neutral', primary: 'chip-primary' } as const;
export function StatusChip({ tone, children }: { tone: keyof typeof CHIP; children: ReactNode }) {
  return <span className={CHIP[tone]}>{children}</span>;
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
