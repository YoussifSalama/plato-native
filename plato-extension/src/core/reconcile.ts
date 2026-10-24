import type { ApiItem, Evidence } from './types';

/**
 * What to do with an item we find after a restart or crash. Pure and
 * read-only: it can only ever recommend recording evidence, moving to VERIFY,
 * or asking the person. There is no action that fills or submits anything,
 * and "unknown" never means "send it again".
 */
export type ReconcileAction =
  | { action: 'none' }
  | { action: 'continue' } // we still hold this attempt in memory
  | { action: 'offer-release' } // pre-armed work whose page we no longer hold
  | { action: 'confirm'; marker: string } // the page itself shows the confirmation
  | { action: 'to-verify'; reason: string } // armed, but nothing proves it was sent
  | { action: 'ask-user' }; // VERIFY: only a person can settle it

export function planReconcile(
  item: Pick<ApiItem, 'state'>,
  evidence: Evidence,
  holdsAttempt: boolean,
): ReconcileAction {
  switch (item.state) {
    case 'PENDING':
    case 'SUBMITTED_CONFIRMED':
    case 'SUBMITTED_ATTESTED':
    case 'FAILED':
    case 'SKIPPED':
    case 'CANCELLED':
      return { action: 'none' };
    case 'CLAIMED':
    case 'PREPARING':
    case 'NEEDS_USER':
    case 'FILLING':
    case 'REVIEW':
      // Nothing can have been sent before arming.
      return holdsAttempt ? { action: 'continue' } : { action: 'offer-release' };
    case 'AWAITING_SUBMIT':
      if (evidence.kind === 'confirmed') return { action: 'confirm', marker: evidence.marker };
      if (holdsAttempt && evidence.kind === 'form-present') return { action: 'none' }; // user still working
      return {
        action: 'to-verify',
        reason: evidence.kind === 'form-present' ? 'form_still_open_after_restart' : evidence.kind === 'gone' ? 'page_closed' : 'outcome_unknown',
      };
    case 'VERIFY':
      return evidence.kind === 'confirmed' ? { action: 'confirm', marker: evidence.marker } : { action: 'ask-user' };
  }
}
