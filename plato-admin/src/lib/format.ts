const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdSmall = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** `$1,234.56`; values under a cent keep up to 4 decimals so they don't read `$0.00`. */
export const money = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.abs(n) > 0 && Math.abs(n) < 0.01 ? usdSmall.format(n) : usd.format(n);
};
export const num = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : int.format(n));
export const num1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : dec.format(n));
export const pct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${dec.format(n * 100)}%`);

export const date = (s: string | number | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (s: string | number | null | undefined) =>
  s
    ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
/** `2026-11-28` (local), for <input type="date"> and the API's from/to. */
export const isoDay = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const shortDay = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** A length of time, short: "45s", "3m 05s", "2h 14m". */
export const duration = (sec: number | null | undefined) => {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
