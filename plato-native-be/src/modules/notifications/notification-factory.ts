import { NotificationTone, SeekerNotification } from './notifications.bus';

// The only place that decides how a run / application reads as a
// notification, so the stored feed and the live stream can never disagree.

interface RunLike {
  id: string;
  thread_id: string | null;
  status: string;
  query: unknown;
  matched: number;
  progress: unknown;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
}

interface ApplicationLike {
  id: string;
  status: string;
  // Extension engine: the attempt whose VERIFY the seeker is being told about.
  verify_attempt?: string | null;
  error: string | null;
  updated_at: Date;
  needs_input: unknown;
  job: { title: string; company: string };
}

export function runNotification(run: RunLike): SeekerNotification {
  const q = run.query as {
    titles?: string[];
    requestedTitles?: string[];
  } | null;
  const titles = q?.requestedTitles ?? q?.titles ?? [];
  const what = titles.join(', ') || 'Job search';
  const ranked =
    (run.progress as { ranked?: number | null } | null)?.ranked ?? run.matched;
  const [tone, title, body]: [NotificationTone, string, string] =
    run.status === 'DONE'
      ? ['success', `${ranked} jobs ready`, `Your search for ${what} finished.`]
      : run.status === 'FAILED'
        ? [
            'error',
            'Search stopped',
            run.error ?? `The search for ${what} could not finish.`,
          ]
        : ['info', 'Searching…', `Plato is searching for ${what}.`];
  return {
    id: `run:${run.id}:${run.status}`,
    kind: 'run',
    status: run.status,
    tone,
    title,
    body,
    href: run.thread_id ? `/jobs/${run.thread_id}?run=${run.id}` : '/jobs',
    at: (run.finished_at ?? run.started_at).toISOString(),
  };
}

// Statuses the seeker should hear about. QUEUED / IN_PROGRESS are noise.
export const NOTIFY_APPLICATION_STATUSES = [
  'NEEDS_INPUT',
  'NEEDS_USER_VERIFICATION',
  'SUBMITTED',
  'FAILED',
  'EXPIRED',
];

export function applicationNotification(
  app: ApplicationLike,
): SeekerNotification {
  const job = `${app.job.title} at ${app.job.company}`;
  // The browser extension could not establish whether it was submitted. The
  // id carries the attempt, so one VERIFY is one notification however often
  // it is replayed, and a later attempt is a new one.
  if (app.status === 'EXTENSION_ACTIVE')
    return {
      id: `app:${app.id}:VERIFY:${app.verify_attempt ?? ''}`,
      kind: 'application',
      status: 'VERIFY',
      tone: 'warning',
      title: 'Check this application',
      body: `${job}: Plato cannot tell whether it was sent. Check the site or your email before applying again.`,
      href: `/applications?focus=${app.id}`,
      at: app.updated_at.toISOString(),
    };
  const needs = app.needs_input as {
    reason?: string;
    questions?: unknown[];
  } | null;
  const [tone, title, body]: [NotificationTone, string, string] =
    app.status === 'SUBMITTED'
      ? ['success', 'Application sent', `Plato applied to ${job}.`]
      : app.status === 'NEEDS_USER_VERIFICATION'
        ? [
            'warning',
            'Human verification required',
            `${job} is asking to verify you are human. Complete it, then continue.`,
          ]
        : app.status === 'NEEDS_INPUT'
          ? [
              'warning',
              needs?.reason === 'captcha'
                ? 'Finish this one yourself'
                : 'Plato needs your answers',
              needs?.reason === 'captcha'
                ? `${job} asked for a human check. Open it and submit.`
                : `${job} asks ${needs?.questions?.length ?? 'a few'} question(s). Review the drafts to continue.`,
            ]
          : app.status === 'EXPIRED'
            ? [
                'info',
                'Posting closed',
                `${job} closed before Plato could apply.`,
              ]
            : [
                'error',
                'Application failed',
                `${job}: ${app.error ?? 'something went wrong'}`,
              ];
  return {
    id: `app:${app.id}:${app.status}`,
    kind: 'application',
    status: app.status,
    tone,
    title,
    body,
    href: `/applications?focus=${app.id}`,
    at: app.updated_at.toISOString(),
  };
}

interface DigestLike {
  id: string;
  job_ids: string[];
  headline: string;
  created_at: Date;
}

// A job-alert digest: one bell entry for many jobs, never one per job.
export function alertNotification(digest: DigestLike): SeekerNotification {
  const n = digest.job_ids.length;
  return {
    id: `alert:${digest.id}`,
    kind: 'alert',
    status: 'NEW_JOBS',
    tone: 'info',
    title: n === 1 ? 'A new job for you' : `${n} new jobs for you`,
    body: digest.headline,
    href: `/insights?digest=${digest.id}`,
    at: digest.created_at.toISOString(),
  };
}
