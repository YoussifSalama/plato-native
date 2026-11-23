// What the seeker hears from Plato outside the panel: a browser notification for each thing the batch record shows
// (applied, skipped, not sent, needs you, the batch finished). Pure: the panel turns it into chrome.notifications.
import type { JobMeta, OutcomeKind } from './batch-runner';

export type Notice =
  | { kind: OutcomeKind | 'needs-user'; itemId: string; meta: Pick<JobMeta, 'title' | 'company'>; note: string }
  | { kind: 'finished'; submitted: number; total: number };

export function noticeText(n: Notice): { title: string; message: string; urgent: boolean } | null {
  if (n.kind === 'finished')
    return { title: `Batch finished: ${n.submitted} of ${n.total} applied`, message: n.submitted < n.total ? 'Open the Plato panel to see the rest.' : 'Every job in the batch was sent.', urgent: false };
  const job = `${n.meta.title}${n.meta.company ? ` at ${n.meta.company}` : ''}`;
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
