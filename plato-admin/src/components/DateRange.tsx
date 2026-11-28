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
      <input
        type="date"
        aria-label="From"
        className="input w-auto"
        value={from}
        max={to}
        onChange={(e) => e.target.value && onChange({ from: e.target.value, to })}
      />
      <span className="text-text-tertiary">–</span>
      <input
        type="date"
        aria-label="To"
        className="input w-auto"
        value={to}
        min={from}
        onChange={(e) => e.target.value && onChange({ from, to: e.target.value })}
      />
    </div>
  );
}
