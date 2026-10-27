import { AlertCadence, JobRemoteType, JobSource } from '@prisma/client';
import { titlePattern } from '../discovery/adapters/local-index.adapter';
import { normalizeCompany } from '../discovery/company';
import { CHECKABLE } from '../discovery/job-freshness.service';

// The rules of job alerts in one place: what matches, when a digest is due,
// and which jobs are still safe to send. No I/O here.

// Alerts are free; how many a seeker may keep depends on the plan.
export const ALERT_LIMITS: Record<string, { field: number; company: number }> =
  {
    free: { field: 3, company: 5 },
    pro: { field: 10, company: 25 },
    max: { field: 20, company: 50 },
  };
export const limitsFor = (plan: string) =>
  ALERT_LIMITS[plan] ?? ALERT_LIMITS.free;

// What LinkedIn, Indeed and Glassdoor offer, minus "instant": digests only.
export const CADENCE_DAYS: Record<AlertCadence, number> = {
  DAILY: 1,
  EVERY_3_DAYS: 3,
  WEEKLY: 7,
};

// Jobs listed in one digest email; the rest are counted and linked.
export const DIGEST_TOP = 10;
// Never send a posting older than this, whatever its source says.
export const MAX_AGE_DAYS = 21;
// Boards we can't look at (they block plain requests): only send what's this recent.
export const UNVERIFIED_MAX_AGE_DAYS = 7;
// A live look older than this is looked at again before sending.
export const RECHECK_HOURS = 24;

const DAY = 86_400_000;

export interface AlertLike {
  id: string;
  kind: 'FIELD' | 'COMPANY';
  title: string | null;
  location: string | null;
  remote_only: boolean | null;
  company_key: string | null;
  paused: boolean;
}

export interface JobLike {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string | null;
  remote_type: JobRemoteType;
  posted_at: Date | null;
  created_at: Date;
  expired_at: Date | null;
  checked_at: Date | null;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[,/|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

// Same title rule the search uses ("Frontend Engineer" also finds
// "Front-end Developer"), plus an optional place or remote-only.
export function matchesAlert(alert: AlertLike, job: JobLike): boolean {
  if (alert.paused) return false;
  if (alert.kind === 'COMPANY')
    return (
      !!alert.company_key &&
      normalizeCompany(job.company).key === alert.company_key
    );
  if (!alert.title?.trim()) return false;
  if (!new RegExp(titlePattern(alert.title), 'i').test(job.title)) return false;
  const remote = job.remote_type === JobRemoteType.REMOTE;
  if (alert.remote_only) return remote;
  if (!alert.location?.trim() || remote) return true;
  const where = (job.location ?? '').toLowerCase();
  return words(alert.location).some((part) => where.includes(part));
}

// Seekers over their plan's limit (after a downgrade) keep their oldest alerts working.
export function withinLimits<T extends { kind: string; created_at: Date }>(
  alerts: T[],
  plan: string,
): T[] {
  const lim = limitsFor(plan);
  const sorted = [...alerts].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  const field = sorted.filter((a) => a.kind === 'FIELD').slice(0, lim.field);
  const company = sorted
    .filter((a) => a.kind === 'COMPANY')
    .slice(0, lim.company);
  return [...field, ...company];
}

export function isDue(
  settings: { cadence: AlertCadence; last_digest_at: Date | null },
  now = new Date(),
): boolean {
  if (!settings.last_digest_at) return true;
  // An hour of slack so a daily digest doesn't drift a little later each day.
  return (
    now.getTime() - settings.last_digest_at.getTime() >=
    CADENCE_DAYS[settings.cadence] * DAY - 3_600_000
  );
}

export type Verdict =
  | { send: true }
  | { send: false; reason: 'closed' | 'too_old' | 'unverified' }
  | { check: true };

export const sendable = (v: Verdict) => 'send' in v && v.send;

// Can this job go out? Closed or old jobs never do. Where we can look at the
// listing, we look (again) unless we did very recently. Where we can't, only
// very recent jobs go (also when a look came back with no answer: canCheck false).
export function verdict(
  job: JobLike,
  now = new Date(),
  canCheck = CHECKABLE.includes(job.source),
): Verdict {
  if (job.expired_at) return { send: false, reason: 'closed' };
  const age = now.getTime() - (job.posted_at ?? job.created_at).getTime();
  if (age > MAX_AGE_DAYS * DAY) return { send: false, reason: 'too_old' };
  if (canCheck) {
    const fresh =
      job.checked_at &&
      now.getTime() - job.checked_at.getTime() < RECHECK_HOURS * 3_600_000;
    return fresh ? { send: true } : { check: true };
  }
  if (age > UNVERIFIED_MAX_AGE_DAYS * DAY)
    return { send: false, reason: 'unverified' };
  return { send: true };
}

// "4 new Frontend Engineer jobs and 2 at Stripe": what the digest is about, in one line.
export function headline(
  jobs: { alertId: string; company: string }[],
  alerts: {
    id: string;
    kind: string;
    title: string | null;
    company: string | null;
  }[],
): string {
  const byAlert = new Map<string, number>();
  for (const j of jobs)
    byAlert.set(j.alertId, (byAlert.get(j.alertId) ?? 0) + 1);
  const parts = [...byAlert.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const a = alerts.find((x) => x.id === id);
      if (!a) return null;
      return a.kind === 'COMPANY'
        ? `${n} at ${a.company}`
        : `${n} ${a.title} job${n === 1 ? '' : 's'}`;
    })
    .filter((p): p is string => !!p);
  const total = jobs.length;
  if (!parts.length) return `${total} new job${total === 1 ? '' : 's'} for you`;
  const shown = parts.slice(0, 2);
  const rest = parts.length > 2 ? ' and more' : '';
  return `${shown.join(' and ')}${rest}`;
}
