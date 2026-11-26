// What the seeker hears from Plato outside the panel: a browser notification for each thing the batch record shows
// (applied, skipped, not sent, needs you, the batch finished). Pure: the panel turns it into chrome.notifications.
import type { JobMeta, OutcomeKind } from './batch-runner';
import type { Review } from '../v3/contract';

export type Notice =
  | { kind: OutcomeKind | 'needs-user'; itemId: string; meta: Pick<JobMeta, 'title' | 'company'>; note: string }
  | { kind: 'review'; itemId: string; meta: Pick<JobMeta, 'title' | 'company'>; reason: Review['holdReason'] } // stopped before Submit with the list to check
  | { kind: 'finished'; submitted: number; total: number };
const HOLD: Record<NonNullable<Review['holdReason']>, string> = {
  review_mode: 'The form is filled. Look over what Plato entered, then submit.',
  sensitive: 'A pay, work permit, visa, legal or personal answer is not backed by your profile. Check it before Plato submits.',
  no_list: 'Plato could not list what it filled. Check the form in its tab before submitting.',
};

export function noticeText(n: Notice): { title: string; message: string; urgent: boolean } | null {
  if (n.kind === 'finished')
    return { title: `Batch finished: ${n.submitted} of ${n.total} applied`, message: n.submitted < n.total ? 'Open the Plato panel to see the rest.' : 'Every job in the batch was sent.', urgent: false };
  const job = `${n.meta.title}${n.meta.company ? ` at ${n.meta.company}` : ''}`;
  // the seeker chose to check every job: no sticky notification each time; an unexpected hold (auto mode) is urgent
  if (n.kind === 'review') return { title: 'Check the answers before Plato submits', message: `${job}: ${HOLD[n.reason ?? 'review_mode']}`, urgent: n.reason !== 'review_mode' };
  switch (n.kind) {
    case 'submitted':
      return { title: `Applied: ${job}`, message: n.note, urgent: false };
    case 'needs-user':
      return { title: `Plato needs you: ${job}`, message: n.note, urgent: true };
    case 'skipped':
      return { title: `Skipped: ${job}`, message: n.note, urgent: false };
    case 'failed':
      return { title: `Not sent: ${job}`, message: n.note, urgent: false };
    default:
      return null; // cancelled / gone: the seeker did it, or another browser did; nothing to tell
  }
}
