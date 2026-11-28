import type { PrismaService } from '../prisma/prisma.service';
import {
  ejDate,
  ejId,
  num,
  OBJECT_ID,
  providerOf,
  type Range,
  round,
  str,
} from './usage-stats';

// The admin panel's view of job searches (DiscoveryRun): what each one cost us (USD), what it
// cost the seeker (Plato tokens), how long it took and what it found. Never what was searched:
// the owner wants the numbers, not the seeker's query.
//
// Cost comes from the usage events tagged with the run (usage.ts withDiscoveryRun). Runs from
// before tagging have none; their discovery.* events are matched by user and time window instead
// and the row says so (attribution "estimated").

type Ej = Record<string, any>;

export const MAX_RUNS = 5000;
// A search's discovery.* events after it ended still belong to it (ranking settles late).
const WINDOW_TAIL_MS = 2 * 60_000;

export type RunRow = {
  id: string;
  userId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  fetched: number;
  matched: number;
  shortlisted: number;
};

export type RunCost = {
  costUsd: number;
  tokens: number;
  events: number;
  byProvider: Record<string, number>;
  attribution: 'exact' | 'estimated' | 'none';
};

export type SearchItem = RunRow & RunCost & { durationSec: number | null };

export const durationOf = (r: Pick<RunRow, 'startedAt' | 'finishedAt'>) =>
  r.finishedAt
    ? Math.max(
        0,
        Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000),
      )
    : null;

/** p-th percentile (0..1) of the numbers, nearest rank; null for none. */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
}
const mean = (v: number[]) =>
  v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
const r6 = (n: number | null) => (n === null ? null : round(n));
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Averages over the searches: cost, tokens, time, results. Running searches count toward totals only. */
export function summarize(items: SearchItem[]) {
  const done = items.filter((i) => i.status !== 'RUNNING');
  const costs = done.map((i) => i.costUsd);
  const tokens = done.map((i) => i.tokens);
  const durations = done
    .map((i) => i.durationSec)
    .filter((d): d is number => d !== null);
  const shortlisted = done.reduce((s, i) => s + i.shortlisted, 0);
  const totalCost = items.reduce((s, i) => s + i.costUsd, 0);
  const searchers = new Set(items.map((i) => i.userId).filter(Boolean)).size;
  return {
    searches: items.length,
    done: items.filter((i) => i.status === 'DONE').length,
    failed: items.filter((i) => i.status === 'FAILED').length,
    running: items.filter((i) => i.status === 'RUNNING').length,
    searchers,
    searchesPerSearcher: searchers ? r1(items.length / searchers) : null,
    totalCostUsd: round(totalCost),
    totalTokens: r1(items.reduce((s, i) => s + i.tokens, 0)),
    avgCostUsd: r6(mean(costs)),
    p50CostUsd: r6(percentile(costs, 0.5)),
    p90CostUsd: r6(percentile(costs, 0.9)),
    avgTokens: r1(mean(tokens)),
    avgDurationSec: r1(mean(durations)),
    p50DurationSec: percentile(durations, 0.5),
    p90DurationSec: percentile(durations, 0.9),
    avgFetched: r1(mean(done.map((i) => i.fetched))),
    avgShortlisted: r1(mean(done.map((i) => i.shortlisted))),
    costPerShortlistedUsd: shortlisted
      ? round(done.reduce((s, i) => s + i.costUsd, 0) / shortlisted)
      : null,
    estimated: items.filter((i) => i.attribution === 'estimated').length,
  };
}

/** Runs started in `range` (optionally one user's), newest first, at most MAX_RUNS. */
export async function runsIn(
  prisma: PrismaService,
  range: Range,
  userId?: string,
): Promise<RunRow[]> {
  let seekerId: string | undefined;
  if (userId) {
    if (!OBJECT_ID.test(userId)) return [];
    const js = await prisma.jobSeeker.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!js) return [];
    seekerId = js.id;
  }
  const runs = await prisma.discoveryRun.findMany({
    where: {
      started_at: { gte: range.from, lt: range.to },
      ...(seekerId && { job_seeker_id: seekerId }),
    },
    select: {
      id: true,
      job_seeker_id: true,
      status: true,
      fetched: true,
      matched: true,
      progress: true,
      started_at: true,
      finished_at: true,
    },
    orderBy: { started_at: 'desc' },
    take: MAX_RUNS,
  });
  const seekers = await prisma.jobSeeker.findMany({
    where: { id: { in: [...new Set(runs.map((r) => r.job_seeker_id))] } },
    select: { id: true, user_id: true },
  });
  const userOf = new Map(seekers.map((s) => [s.id, s.user_id]));
  return runs.map((r) => ({
    id: r.id,
    userId: userOf.get(r.job_seeker_id) ?? null,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    fetched: r.fetched,
    matched: r.matched,
    // what the seeker is shown: the ranked shortlist (progress.filtered), else every match
    shortlisted:
      (r.progress as { filtered?: number | null } | null)?.filtered ??
      r.matched,
  }));
}

type Ev = {
  id: string;
  userId: string | null;
  runId: string | null;
  at: number;
  model: string | null;
  apify: number;
  feature: string;
  cost: number;
};

/** What each run cost: tagged events exactly, untagged old runs by user + time window. */
export async function costRuns(
  prisma: PrismaService,
  runs: RunRow[],
): Promise<Map<string, RunCost>> {
  const out = new Map<string, RunCost>(
    runs.map((r) => [
      r.id,
      { costUsd: 0, tokens: 0, events: 0, byProvider: {}, attribution: 'none' },
    ]),
  );
  if (!runs.length) return out;
  const tagged = (await prisma.usageEvent.aggregateRaw({
    pipeline: [
      { $match: { discovery_run_id: { $in: runs.map((r) => ejId(r.id)) } } },
      {
        $project: {
          discovery_run_id: 1,
          user_id: 1,
          model: 1,
          apify_usd: 1,
          feature: 1,
          cost_usd: 1,
          created_at: 1,
        },
      },
    ],
  })) as unknown as Ej[];
  const events: Ev[] = tagged.map(toEv);

  // Runs with no tagged events: their discovery.* events, by user and time window.
  const taggedRuns = new Set(events.map((e) => e.runId));
  const untagged = runs.filter((r) => !taggedRuns.has(r.id) && r.userId);
  if (untagged.length) {
    const from = Math.min(...untagged.map((r) => r.startedAt.getTime()));
    const to =
      Math.max(
        ...untagged.map((r) => (r.finishedAt ?? r.startedAt).getTime()),
      ) + WINDOW_TAIL_MS;
    const loose = (
      (await prisma.usageEvent.aggregateRaw({
        pipeline: [
          {
            $match: {
              user_id: {
                $in: [...new Set(untagged.map((r) => r.userId!))].map(ejId),
              },
              feature: { $regex: '^discovery\\.' },
              discovery_run_id: null,
              created_at: {
                $gte: ejDate(new Date(from)),
                $lte: ejDate(new Date(to)),
              },
            },
          },
          {
            $project: {
              user_id: 1,
              model: 1,
              apify_usd: 1,
              feature: 1,
              cost_usd: 1,
              created_at: 1,
            },
          },
        ],
      })) as unknown as Ej[]
    ).map(toEv);
    events.push(...assignByWindow(loose, untagged));
  }

  // Tokens the seeker paid: the consume rows of those events.
  const ids = events.map((e) => e.id);
  const tokensByEvent = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 5000) {
    const rows = (await prisma.creditLedger.aggregateRaw({
      pipeline: [
        {
          $match: {
            kind: 'consume',
            usage_event_id: { $in: ids.slice(i, i + 5000).map(ejId) },
          },
        },
        { $group: { _id: '$usage_event_id', amount: { $sum: '$amount' } } },
      ],
    })) as unknown as { _id: unknown; amount: unknown }[];
    for (const r of rows) tokensByEvent.set(str(r._id) ?? '', -num(r.amount));
  }

  for (const e of events) {
    const c = e.runId ? out.get(e.runId) : undefined;
    if (!c) continue;
    c.costUsd += e.cost;
    c.tokens += tokensByEvent.get(e.id) ?? 0;
    c.events++;
    const p = providerOf({
      model: e.model,
      apify_usd: e.apify,
      feature: e.feature,
    });
    c.byProvider[p] = (c.byProvider[p] ?? 0) + e.cost;
    if (c.attribution !== 'exact')
      c.attribution = taggedRuns.has(e.runId) ? 'exact' : 'estimated';
  }
  for (const c of out.values()) {
    c.costUsd = round(c.costUsd);
    c.tokens = Math.round(c.tokens * 10) / 10;
    for (const k of Object.keys(c.byProvider))
      c.byProvider[k] = round(c.byProvider[k]);
  }
  return out;
}

function toEv(r: Ej): Ev {
  const at = str(r.created_at);
  return {
    id: str(r._id) ?? '',
    userId: str(r.user_id),
    runId: str(r.discovery_run_id),
    at: at ? new Date(at).getTime() : 0,
    model: str(r.model),
    apify: num(r.apify_usd),
    feature: str(r.feature) ?? '',
    cost: num(r.cost_usd),
  };
}

/** Each loose event to the run of the same user whose window [start, end + tail] holds it (latest start wins). */
export function assignByWindow(events: Ev[], runs: RunRow[]): Ev[] {
  const byUser = new Map<string, RunRow[]>();
  for (const r of runs)
    if (r.userId) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  for (const list of byUser.values())
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const out: Ev[] = [];
  for (const e of events) {
    const run = byUser
      .get(e.userId ?? '')
      ?.find(
        (r) =>
          r.startedAt.getTime() <= e.at &&
          e.at <= (r.finishedAt ?? r.startedAt).getTime() + WINDOW_TAIL_MS,
      );
    if (run) out.push({ ...e, runId: run.id });
  }
  return out;
}

/** Runs in range with their cost and time. */
export async function searchItems(
  prisma: PrismaService,
  range: Range,
  userId?: string,
): Promise<SearchItem[]> {
  const runs = await runsIn(prisma, range, userId);
  const costs = await costRuns(prisma, runs);
  return runs.map((r) => ({
    ...r,
    ...costs.get(r.id)!,
    durationSec: durationOf(r),
  }));
}
