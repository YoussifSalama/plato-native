import { BadRequestException } from '@nestjs/common';
import { outcomeUpdate } from './outcome';

describe('the seeker marks what they heard back', () => {
  const now = new Date('2026-11-09T10:00:00Z');

  it('a sent application can be marked as an interview, and cleared', () => {
    expect(outcomeUpdate('SUBMITTED', 'INTERVIEW', now)).toEqual({
      outcome: 'INTERVIEW',
      outcome_at: now,
    });
    expect(outcomeUpdate('SUBMITTED', null, now)).toEqual({
      outcome: null,
      outcome_at: null,
    });
  });

  it('one that was never sent cannot', () => {
    for (const s of ['QUEUED', 'NEEDS_INPUT', 'FAILED'])
      expect(() => outcomeUpdate(s, 'INTERVIEW')).toThrow(BadRequestException);
  });
});
