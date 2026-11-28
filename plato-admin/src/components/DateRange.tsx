import { CalendarDays } from 'lucide-react';
import { date } from '../lib/format';
import { defaultRange } from '../lib/searchState';

/** The analytics pages' range picker: two native date inputs and quick presets. */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  const presets = [7, 30, 90];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-input bg-card p-0.5">
        {presets.map((d) => {
          const r = defaultRange(d);
          const on = r.from === from && r.to === to;
          return (
            <button
              key={d}
              type="button"
              className={`h-8 rounded-md px-2.5 text-xs font-semibold ${on ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:text-foreground'}`}
              onClick={() => onChange(r)}
            >
              {d}d
            </button>
          );
        })}
      </div>
      <DayInput label="From" value={from} max={to} onPick={(v) => onChange({ from: v, to })} />
      <span className="text-text-tertiary">–</span>
      <DayInput label="To" value={to} min={from} onPick={(v) => onChange({ from, to: v })} />
    </div>
  );
}

/**
 * A date written the panel's way ("30 Oct 2026", like every table) that still opens the browser's own
 * date picker: the native input lies invisible over the label and takes the click.
 */
function DayInput({ label, value, min, max, onPick }: { label: string; value: string; min?: string; max?: string; onPick: (v: string) => void }) {
  return (
    <span className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <CalendarDays className="size-4 text-text-tertiary" />
      <span className="tabular-nums">{date(`${value}T12:00:00`)}</span>
      <input
        type="date"
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            // not allowed here (or already open): the input's own click still opens it
          }
        }}
      />
    </span>
  );
}
