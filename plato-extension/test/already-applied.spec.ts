import { describe, expect, it } from 'vitest';
import { ALREADY_APPLIED } from '../src/v3/run';

describe('a site saying the seeker already applied', () => {
  it.each([
    'This email or LinkedIn URL has already been used to apply for this job.', // FullStack Connect, 2026-11-13
    'You have already applied to this job',
    "You've already applied for this position",
    'An application for this job already exists',
    'You already submitted an application',
    'Duplicate application',
  ])('recognises: %s', (t) => expect(ALREADY_APPLIED.test(t)).toBe(true));
  it.each(['Apply now', 'Applications close on 30 May', 'Your application was sent', 'Have you applied to Acme before? (Yes/No)'])('ignores: %s', (t) =>
    expect(ALREADY_APPLIED.test(t)).toBe(false),
  );
});
