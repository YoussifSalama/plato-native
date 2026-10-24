import { JobRemoteType } from '@prisma/client';

const JOB_TYPES: [RegExp, string][] = [
  [/full/i, 'FULL_TIME'],
  [/part/i, 'PART_TIME'],
  [/contract|freelance/i, 'CONTRACTOR'],
  [/intern/i, 'INTERN'],
  [/temp/i, 'TEMPORARY'],
];

// Same vocabulary the ATS adapter emits, so job-type filters match.
export function normalizeJobType(raw: string | undefined | null) {
  if (!raw) return null;
  return JOB_TYPES.find(([re]) => re.test(raw))?.[1] ?? null;
}

export function remoteTypeOf(
  isRemote: boolean | undefined,
  ...hints: string[]
) {
  if (isRemote || hints.some((h) => /remote/i.test(h)))
    return JobRemoteType.REMOTE;
  if (hints.some((h) => /hybrid/i.test(h))) return JobRemoteType.HYBRID;
  return JobRemoteType.UNKNOWN;
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

// ISO / RFC dates, plus the relative text boards show ("3 days ago",
// "Just posted", "yesterday"). Unparseable -> null (the run drops undated jobs).
export function toDate(
  raw: string | number | undefined | null,
  now = new Date(),
) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'string') {
    // "3 days ago", "30+ days ago", "5 day(s)"
    const rel = raw.match(
      /(\d+)\+?\s*(minute|hour|day|week|month)(?:\(s\)|s)?(?:\s+ago)?/i,
    );
    if (rel)
      return new Date(
        now.getTime() - Number(rel[1]) * UNIT_MS[rel[2].toLowerCase()],
      );
    if (/just posted|today|new/i.test(raw)) return now;
    if (/yesterday/i.test(raw)) return new Date(now.getTime() - UNIT_MS.day);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PERIOD_FACTOR: Record<string, number> = {
  HOUR: 2080,
  DAY: 260,
  WEEK: 52,
  MONTH: 12,
  YEAR: 1,
};

// Salary filters compare yearly figures, so hourly/monthly pay is
// annualised. ponytail: no period + amount under 1000 is assumed hourly.
export function annual(
  amount: number | null | undefined,
  period?: string | null,
): number | null {
  if (!amount || amount <= 0) return null;
  const key = period
    ?.toUpperCase()
    .replace(/LY$/, '')
    .replace(/ANNUAL/, 'YEAR');
  const factor = key ? PERIOD_FACTOR[key] : undefined;
  if (factor) return Math.round(amount * factor);
  return Math.round(amount < 1000 ? amount * 2080 : amount);
}

// Boards without an id field: their canonical URL is the dedupe key.
export function idFromUrl(url: string, param?: string) {
  try {
    const u = new URL(url);
    return (param && u.searchParams.get(param)) || u.origin + u.pathname;
  } catch {
    return url;
  }
}

// Boards disagree on what a "location" is: text, or an object like
// { raw, locality, region, country }. Always store one line of text.
export function locationText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const raw = o.raw ?? o.name ?? o.formatted;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    const parts = [o.locality ?? o.city, o.region ?? o.state, o.country]
      .filter((p): p is string => typeof p === 'string' && !!p.trim())
      .map((p) => p.trim());
    return parts.join(', ') || null;
  }
  return null;
}

// HTML to plain text (descriptions arrive as markup on some boards).
export function plain(html: string | null | undefined): string | null {
  const t = (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return t || null;
}
