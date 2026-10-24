import { DiscoveryRun } from '@prisma/client';
import { RunProgress } from './discovery-run.helpers';

// Plain-language view of a run for the assistant (and its tools). No
// internals leak: stage names, counts, timings and error text only.
export interface RunStatusSummary {
  runId: string;
  threadId: string | null;
  status: DiscoveryRun['status'];
  titles: string[];
  locations: string[];
  countries: string[];
  stage: string;
  elapsedSeconds: number;
  sources: Record<string, { status: string; fetched: number; error?: string }>;
  merged: number | null;
  shortlisted: number | null;
  error: string | null;
}

export function summarizeRun(
  run: DiscoveryRun,
  now = new Date(),
): RunStatusSummary {
  const progress = run.progress as unknown as RunProgress | null;
  const query = run.query as {
    titles?: string[];
    locations?: string[];
    countries?: string[];
  } | null;
  const end = run.finished_at ?? now;
  return {
    runId: run.id,
    threadId: run.thread_id,
    status: run.status,
    titles: query?.titles ?? [],
    locations: query?.locations ?? [],
    countries: query?.countries ?? [],
    stage:
      progress?.stage ??
      (run.status === 'RUNNING' ? 'crawling' : run.status.toLowerCase()),
    elapsedSeconds: Math.max(
      0,
      Math.round((end.getTime() - run.started_at.getTime()) / 1000),
    ),
    sources: progress?.sources ?? {},
    merged: progress?.merged ?? null,
    shortlisted: progress?.filtered ?? null,
    error: run.error ?? progress?.error ?? null,
  };
}

const sameSet = (a: string[], b: string[]) => {
  const norm = (xs: string[]) =>
    [...new Set(xs.map((x) => x.trim().toLowerCase()))].sort();
  const [x, y] = [norm(a), norm(b)];
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// A finished run with the same titles in the last N minutes is "recent";
// re-running it without the user asking wastes minutes and Apify credits.
export function isRecentIdentical(
  run: DiscoveryRun | null,
  titles: string[],
  now = new Date(),
  windowMinutes = 30,
) {
  if (!run || run.status !== 'DONE' || !run.finished_at) return false;
  const ageMin = (now.getTime() - run.finished_at.getTime()) / 60_000;
  if (ageMin > windowMinutes) return false;
  const query = run.query as {
    titles?: string[];
    requestedTitles?: string[];
  } | null;
  return sameSet(query?.requestedTitles ?? query?.titles ?? [], titles);
}
