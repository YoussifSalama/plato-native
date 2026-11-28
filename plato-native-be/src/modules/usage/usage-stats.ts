import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

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
  if ((r.apify_usd ?? 0) > 0 || model.includes('~') || r.feature === 'discovery.apify')
    return 'apify';
  if (/^claude/i.test(model)) return 'anthropic';
  if (OPENAI.test(model)) return 'openai';
  return 'other';
}

export type Range = { from: Date; to: Date };
const DAY = 86_400_000;

/** `from` / `to` as ISO dates (a bare date for `to` includes that whole day); default the last 30 days. */
export function parseRange(from?: string, to?: string, now = new Date()): Range {
  const at = (s: string, end: boolean) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new BadRequestException(`Bad date: ${s}`);
    return end && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(d.getTime() + DAY) : d;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ej = Record<string, any>;
export function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const o = v as Ej;
    const x = o.$numberLong ?? o.$numberInt ?? o.$numberDouble ?? o.$numberDecimal;
    if (x !== undefined) return Number(x);
  }
  return 0;
}
export function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && '$oid' in (v as Ej)) return String((v as Ej).$oid);
  if (typeof v === 'object' && '$date' in (v as Ej)) {
    const d = (v as Ej).$date;
    return typeof d === 'object' ? new Date(num((d as Ej).$numberLong)).toISOString() : String(d);
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

/**
 * usage_events in `range`, summed per (model, apify?) and the extra `keys`.
 * The provider is worked out here from model + apify, so its rule lives in one place.
 */
export async function usageGroups(
  prisma: PrismaService,
  range: Range,
  keys: ('day' | 'feature' | 'user')[],
  where: { userId?: string; userIds?: string[] } = {},
): Promise<UsageGroup[]> {
  const match: Ej = { created_at: { $gte: ejDate(range.from), $lt: ejDate(range.to) } };
  if (where.userId) match.user_id = ejId(where.userId);
  if (where.userIds) match.user_id = { $in: where.userIds.map(ejId) };
  const id: Ej = { model: '$model', apify: { $gt: ['$apify_usd', 0] } };
  if (keys.includes('day'))
    id.day = { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } };
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
  })) as unknown as { _id: Ej; cost: unknown; events: unknown; input: unknown; output: unknown }[];
  return rows.map((r) => {
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
  });
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
    .map(([k, g]) => ({ [field]: k, costUsd: round(g.costUsd), events: g.events }) as { [P in K]: string } & { costUsd: number; events: number })
    .sort((a, b) => b.costUsd - a.costUsd);
}

/** Every day of the range (UTC), so a chart has no gaps. */
export function daysOf(range: Range): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  for (; d < range.to && out.length < 400; d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10));
  return out;
}

/** The Usage overview shape, for all users or one. */
export function usageOverview(rows: UsageGroup[], range: Range) {
  const byDay = new Map<string, { costUsd: number; byProvider: Record<string, number> }>();
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
