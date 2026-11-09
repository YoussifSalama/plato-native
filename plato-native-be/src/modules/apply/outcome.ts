import { BadRequestException } from '@nestjs/common';

export const OUTCOMES = ['VIEWED', 'INTERVIEW', 'OFFER', 'REJECTED'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * The seeker's own mark on what they heard back ("I got an interview").
 * Only a sent application can carry one; null clears it.
 */
export function outcomeUpdate(
  status: string,
  outcome: Outcome | null,
  now = new Date(),
) {
  if (status !== 'SUBMITTED')
    throw new BadRequestException(
      'Only a sent application can have a reply marked',
    );
  return { outcome, outcome_at: outcome ? now : null };
}
