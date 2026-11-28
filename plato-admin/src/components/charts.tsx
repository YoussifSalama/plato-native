import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, num, shortDay } from '../lib/format';
import { prefersReducedMotion } from '../lib/motion';
import { Empty } from './ui';

// Provider identity, fixed per entity (never by rank). Cobalt / azure / violet pass the
// palette validator (CVD ΔE ≥ 11); "other" is the neutral grey on purpose.
// No status colours here: green/amber/red stay reserved for meaning.
export const PROVIDER_COLORS: Record<string, string> = {
  apify: '#005ba7',
  anthropic: '#00a1e2',
  openai: '#7c5cc4',
  other: '#8593a6',
};
export const providerColor = (p: string) => PROVIDER_COLORS[p] ?? PROVIDER_COLORS.other;
export const PROVIDER_LABEL: Record<string, string> = { apify: 'Apify', anthropic: 'Anthropic', openai: 'OpenAI', other: 'Other' };
export const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

const AXIS = { fontSize: 11, fill: '#8593a6' };
// Bars rise from the axis once, quickly (recharts' own animation); none with reduced motion.
const barMotion = () => ({ isAnimationActive: !prefersReducedMotion(), animationDuration: 700, animationEasing: 'ease-out' as const });
const compactUsd = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v < 10 && v % 1 ? v.toFixed(2) : Math.round(v)}`);

function ChartTooltip({
  active,
  label,
  payload,
  format,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string | number; value?: number | string; color?: string }[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => Number(p.value) > 0);
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-float">
      <p className="mb-1 font-semibold">{shortDay(String(label ?? ''))}</p>
      {rows.map((p) => (
        <p key={String(p.name)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="size-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums">{format(Number(p.value))}</span>
        </p>
      ))}
      {payload.length > 1 && (
        <p className="mt-1 flex justify-between gap-4 border-t border-divider pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{format(total)}</span>
        </p>
      )}
    </div>
  );
}

/** Cost per day, stacked by provider. */
export function StackedDayChart({ data }: { data: { day: string; byProvider: Record<string, number> }[] }) {
  if (!data.length) return <Empty />;
  const keys = Object.keys(PROVIDER_COLORS).filter((k) => data.some((d) => (d.byProvider[k] ?? 0) > 0));
  const rows = data.map((d) => ({ day: d.day, ...Object.fromEntries(keys.map((k) => [k, d.byProvider[k] ?? 0])) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortDay} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactUsd} width={56} />
          <Tooltip cursor={{ fill: 'rgba(0,91,167,0.06)' }} content={<ChartTooltip format={money} />} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#4a5a70' }} formatter={(v) => <span style={{ color: '#4a5a70' }}>{String(v)}</span>} />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={providerLabel(k)}
              stackId="cost"
              fill={providerColor(k)}
              stroke="#fff"
              strokeWidth={1}
              radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
              {...barMotion()}
              animationBegin={i * 80}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One series per day (cost, or active days per week). */
export function DayChart({
  data,
  x,
  y,
  name,
  format = money,
  height = 'h-56',
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  name: string;
  format?: (v: number) => string;
  height?: string;
}) {
  if (!data.length) return <Empty />;
  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortDay} minTickGap={16} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            allowDecimals={format !== num}
            tickFormatter={format === money ? compactUsd : (v: number) => num(v)}
          />
          <Tooltip cursor={{ fill: 'rgba(0,91,167,0.06)' }} content={<ChartTooltip format={format} />} />
          <Bar dataKey={y} name={name} fill="#005ba7" radius={[4, 4, 0, 0]} {...barMotion()} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars in plain HTML (by feature, by provider): label, bar, value. */
export function BarList({
  items,
  format = money,
  color,
}: {
  items: { key: string; label: ReactNode; value: number; sub?: ReactNode }[];
  format?: (v: number) => string;
  color?: (key: string) => string;
}) {
  if (!items.length) return <Empty />;
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return (
    <ul className="stagger flex flex-col gap-2.5">
      {items.map((i, n) => (
        <li key={i.key} className="text-sm" title={`${typeof i.label === 'string' ? i.label : i.key}: ${format(i.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {format(i.value)}
              {i.sub && <span className="ml-2 text-xs font-normal text-text-tertiary">{i.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="bar-grow h-2 rounded-full"
              style={{ width: `${Math.max(1, (i.value / max) * 100)}%`, background: color?.(i.key) ?? '#005ba7', animationDelay: `${Math.min(n, 8) * 60}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
