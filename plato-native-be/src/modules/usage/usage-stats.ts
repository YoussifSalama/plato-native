import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ADMIN_TZ, dayStart, nextDay, tzDay } from './tz';

// Shared by the admin panel's Dashboard, Usage, Plans calculator and user views:
// who we paid (provider), and one grouped pass over usage_events.

export const PROVIDERS = ['apify', 'anthropic', 'openai', 'other'] as const;
export type Provider = (typeof PROVIDERS)[number];

const OPENAI =
  /^(gpt|o\d|text-embedding|whisper|tts|dall-e|chatgpt|omni|web_search)|realtime/i;

/** Which provider billed one usage event. */
export function providerOf(r: {
  model?: string | null;
  apify_usd?: number | null;
  feature?: string | null;
}): Provider {
  const model = r.model ?? '';
  // Apify actors are named "owner~actor"; a failed run has apify_usd 0 but is still Apify's
  if (
    (r.apify_usd ?? 0) > 0 ||
    model.includes('~') ||
    r.feature === 'discovery.apify'
  )
    return 'apify';
  if (/^claude/i.test(model)) return 'anthropic';
  if (OPENAI.test(model)) return 'openai';
  return 'other';
}

export type Range = { from: Date; to: Date };
const DAY = 86_400_000;

/**
 * `from` / `to` as ISO dates; a bare date is a whole calendar day in the admin time zone (tz.ts),
 * so `to=2026-11-28` runs to the end of the 28th in Cairo. Default: the last 30 days.
 */
export function parseRange(
  from?: string,
  to?: string,
  now = new Date(),
): Range {
  const at = (s: string, end: boolean) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = dayStart(end ? nextDay(s) : s);
      if (isNaN(d.getTime())) throw new BadRequestException(`Bad date: ${s}`);
      return d;
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new BadRequestException(`Bad date: ${s}`);
    return d;
  };
  const t = to ? at(to, true) : now;
  const f = from ? at(from, false) : new Date(t.getTime() - 30 * DAY);
  if (f >= t) throw new BadRequestException('from must be before to');
  return { from: f, to: t };
}

/** `sort` as the panel sends it: `field` (ascending) or `-field` (descending); unknown → the default. */
export function parseSort<F extends string>(
  sort: string | undefined,
  fields: readonly F[],
  fallback: `${'' | '-'}${F}`,
): { field: F; desc: boolean } {
  const pick = (s: string) => {
    const desc = s.startsWith('-');
    const field = s.replace(/^-/, '') as F;
    return fields.includes(field) ? { field, desc } : null;
  };
  return pick(sort ?? '') ?? pick(fallback)!;
}

/** 1-based page of 50. */
export const PAGE_SIZE = 50;
export const pageOf = (p?: string) => Math.max(1, Math.floor(Number(p) || 1));

// Mongo Extended JSON, in and out of aggregateRaw.
export const ejDate = (d: Date) => ({ $date: d.toISOString() });
export const ejId = (id: string) => ({ $oid: id });
export const OBJECT_ID = /^[a-f0-9]{24}$/i;
// Mongo extended-JSON object for aggregateRaw pipelines (any: Prisma wants InputJsonValue).

type Ej = Record<string, any>;
export function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const o = v as Ej;
    const x =
      o.$numberLong ?? o.$numberInt ?? o.$numberDouble ?? o.$numberDecimal;
    if (x !== undefined) return Number(x);
  }
  return 0;
}
export function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && '$oid' in (v as Ej))
    return String((v as Ej).$oid);
  if (typeof v === 'object' && '$date' in (v as Ej)) {
    const d = (v as Ej).$date;
    return typeof d === 'object'
      ? new Date(num((d as Ej).$numberLong)).toISOString()
      : String(d);
  }
  return String(v);
}

export const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

export type UsageGroup = {
  day?: string;
  feature?: string;
  userId?: string | null;
  model: string | null;
  provider: Provider;
  costUsd: number;
  events: number;
  inputTokens: number;
  outputTokens: number;
};

type Keys = ('day' | 'feature' | 'user')[];
type Who = { userId?: string; userIds?: string[] };

/**
 * usage_events in `range`, summed per (model, apify?) and the extra `keys`.
 * The provider is worked out here from model + apify, so its rule lives in one place.
 * Finished days come from the daily rollup (usage_daily, usage-rollup.ts); today and any part
 * of a day at the range's edges come from the events themselves. Same answer either way.
 */
export async function usageGroups(
  prisma: PrismaService,
  range: Range,
  keys: Keys,
  where: Who = {},
): Promise<UsageGroup[]> {
  const through = await rolledThrough(prisma);
  const split = splitForRollup(range, through);
  if (!split.rolled) return rawGroups(prisma, range, keys, where);
  const parts = await Promise.all([
    rolledGroups(prisma, split.rolled.first, split.rolled.last, keys, where),
    ...split.raw.map((r) => rawGroups(prisma, r, keys, where)),
  ]);
  return mergeGroups(parts.flat(), keys);
}

/**
 * Which part of `range` the rollup can answer: whole calendar days up to `through` (the last
 * rolled day); the rest (a partial first or last day, days not rolled yet) is read raw.
 */
export function splitForRollup(
  range: Range,
  through: string | null,
): { rolled: { first: string; last: string } | null; raw: Range[] } {
  if (!through) return { rolled: null, raw: [range] };
  let first = tzDay(range.from);
  if (dayStart(first) < range.from) first = nextDay(first);
  // the last whole day: the day before the one `to` falls in, or that day if `to` is its end
  let end = tzDay(range.to);
  if (dayStart(end).getTime() !== range.to.getTime())
    end = tzDay(new Date(dayStart(end).getTime() - 1));
  else end = tzDay(new Date(range.to.getTime() - 1));
  const last = end < through ? end : through;
  if (first > last) return { rolled: null, raw: [range] };
  const raw: Range[] = [];
  const a = dayStart(first);
  const b = dayStart(nextDay(last));
  if (range.from < a) raw.push({ from: range.from, to: a });
  if (b < range.to) raw.push({ from: b, to: range.to });
  return { rolled: { first, last }, raw };
}

/** Rows with the same key (from the rollup and from raw edges) added together. */
export function mergeGroups(rows: UsageGroup[], keys: Keys): UsageGroup[] {
  const m = new Map<string, UsageGroup>();
  for (const r of rows) {
    const k = [
      r.model,
      r.provider,
      keys.includes('day') ? r.day : '',
      keys.includes('feature') ? r.feature : '',
      keys.includes('user') ? r.userId : '',
    ].join('|');
    const g = m.get(k);
    if (!g) m.set(k, { ...r });
    else {
      g.costUsd += r.costUsd;
      g.events += r.events;
      g.inputTokens += r.inputTokens;
      g.outputTokens += r.outputTokens;
    }
  }
  return [...m.values()];
}

// The last day in usage_daily, re-read at most once a minute.
let through: { at: number; day: string | null } | null = null;
export async function rolledThrough(
  prisma: PrismaService,
): Promise<string | null> {
  if (process.env.USAGE_ROLLUP === 'off') return null;
  if (through && Date.now() - through.at < 60_000) return through.day;
  const last = await prisma.usageDaily
    .findFirst({ orderBy: { day: 'desc' }, select: { day: true } })
    .catch(() => null);
  through = { at: Date.now(), day: last?.day ?? null };
  return through.day;
}
export const forgetRolledThrough = () => {
  through = null;
};

async function rolledGroups(
  prisma: PrismaService,
  first: string,
  last: string,
  keys: Keys,
  where: Who,
): Promise<UsageGroup[]> {
  const match: Ej = { day: { $gte: first, $lte: last } };
  if (where.userId) match.user_id = ejId(where.userId);
  if (where.userIds) match.user_id = { $in: where.userIds.map(ejId) };
  const id: Ej = { model: '$model', apify: '$apify' };
  if (keys.includes('day')) id.day = '$day';
  if (keys.includes('feature')) id.feature = '$feature';
  if (keys.includes('user')) id.user = '$user_id';
  const rows = (await prisma.usageDaily.aggregateRaw({
    pipeline: [
      { $match: match },
      {
        $group: {
          _id: id,
          cost: { $sum: '$cost' },
          events: { $sum: '$events' },
          input: { $sum: '$input' },
          output: { $sum: '$output' },
        },
      },
    ],
  })) as unknown as {
    _id: Ej;
    cost: unknown;
    events: unknown;
    input: unknown;
    output: unknown;
  }[];
  return rows.map((r) => toGroup(r, keys));
}

function toGroup(
  r: {
    _id: Ej;
    cost: unknown;
    events: unknown;
    input: unknown;
    output: unknown;
  },
  keys: Keys,
): UsageGroup {
  const model = str(r._id.model);
  return {
    ...(keys.includes('day') && { day: str(r._id.day) ?? '' }),
    ...(keys.includes('feature') && { feature: str(r._id.feature) ?? '' }),
    ...(keys.includes('user') && { userId: str(r._id.user) }),
    model,
    provider: providerOf({
      model,
      apify_usd: r._id.apify ? 1 : 0,
      feature: str(r._id.feature),
    }),
    costUsd: num(r.cost),
    events: num(r.events),
    inputTokens: num(r.input),
    outputTokens: num(r.output),
  };
}

/** The events themselves (today, partial days, or everything when nothing is rolled up). */
async function rawGroups(
  prisma: PrismaService,
  range: Range,
  keys: Keys,
  where: Who = {},
): Promise<UsageGroup[]> {
  const match: Ej = {
    created_at: { $gte: ejDate(range.from), $lt: ejDate(range.to) },
  };
  if (where.userId) match.user_id = ejId(where.userId);
  if (where.userIds) match.user_id = { $in: where.userIds.map(ejId) };
  const id: Ej = { model: '$model', apify: { $gt: ['$apify_usd', 0] } };
  if (keys.includes('day'))
    id.day = {
      $dateToString: {
        format: '%Y-%m-%d',
        date: '$created_at',
        timezone: ADMIN_TZ,
      },
    };
  if (keys.includes('feature')) id.feature = '$feature';
  if (keys.includes('user')) id.user = '$user_id';
  const rows = (await prisma.usageEvent.aggregateRaw({
    pipeline: [
      { $match: match },
      {
        $group: {
          _id: id,
          cost: { $sum: { $ifNull: ['$cost_usd', 0] } },
          events: { $sum: 1 },
          input: { $sum: '$input_tokens' },
          output: { $sum: '$output_tokens' },
        },
      },
    ],
  })) as unknown as {
    _id: Ej;
    cost: unknown;
    events: unknown;
    input: unknown;
    output: unknown;
  }[];
  return rows.map((r) => toGroup(r, keys));
}

/** Sum groups by one field: [{ [field]: key, costUsd, events }], dearest first. */
export function sumBy<K extends string>(
  rows: UsageGroup[],
  field: K,
  keyOf: (r: UsageGroup) => string,
) {
  const m = new Map<string, { costUsd: number; events: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) ?? { costUsd: 0, events: 0 };
    g.costUsd += r.costUsd;
    g.events += r.events;
    m.set(k, g);
  }
  return [...m]
    .map(
      ([k, g]) =>
        ({ [field]: k, costUsd: round(g.costUsd), events: g.events }) as {
          [P in K]: string;
        } & { costUsd: number; events: number },
    )
    .sort((a, b) => b.costUsd - a.costUsd);
}

/** Every calendar day of the range (admin time zone), so a chart has no gaps. */
export function daysOf(range: Range): string[] {
  const out: string[] = [];
  for (
    let d = tzDay(range.from);
    dayStart(d) < range.to && out.length < 400;
    d = nextDay(d)
  )
    out.push(d);
  return out;
}

/** The Usage overview shape, for all users or one. */
export function usageOverview(rows: UsageGroup[], range: Range) {
  const byDay = new Map<
    string,
    { costUsd: number; byProvider: Record<string, number> }
  >();
  for (const d of daysOf(range)) byDay.set(d, { costUsd: 0, byProvider: {} });
  for (const r of rows) {
    const g = byDay.get(r.day!) ?? { costUsd: 0, byProvider: {} };
    g.costUsd += r.costUsd;
    g.byProvider[r.provider] = (g.byProvider[r.provider] ?? 0) + r.costUsd;
    byDay.set(r.day!, g);
  }
  return {
    totalCostUsd: round(rows.reduce((s, r) => s + r.costUsd, 0)),
    events: rows.reduce((s, r) => s + r.events, 0),
    byProvider: sumBy(rows, 'provider', (r) => r.provider),
    byFeature: sumBy(rows, 'feature', (r) => r.feature ?? ''),
    byDay: [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, g]) => ({
        day,
        costUsd: round(g.costUsd),
        byProvider: Object.fromEntries(
          Object.entries(g.byProvider).map(([p, v]) => [p, round(v)]),
        ),
      })),
  };
}

/** Plato tokens each user spent in `range` (credit_ledger consume rows). */
export async function tokensSpentBy(
  prisma: PrismaService,
  range: Range,
  userIds?: string[],
): Promise<Map<string, number>> {
  const match: Ej = {
    kind: 'consume',
    created_at: { $gte: ejDate(range.from), $lt: ejDate(range.to) },
  };
  if (userIds) match.user_id = { $in: userIds.map(ejId) };
  const rows = (await prisma.creditLedger.aggregateRaw({
    pipeline: [
      { $match: match },
      { $group: { _id: '$user_id', spent: { $sum: '$amount' } } },
    ],
  })) as unknown as { _id: unknown; spent: unknown }[];
  return new Map(rows.map((r) => [str(r._id) ?? '', round(-num(r.spent), 1)]));
}
