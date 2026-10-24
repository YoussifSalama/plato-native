import { Candidate } from './apply.types';

// Auto-apply means Plato never stops mid-application to ask something. The
// price is that the snapshot must hold, up front, the facts employers' forms
// ask for again and again. (Permission to apply is not asked: it is the
// service itself, covered by the terms accepted at signup.) This is that list, in one place: onboarding, the
// chat agent and the worker all read it.

export interface MissingDetail {
  key: string;
  label: string;
  // Why an employer's form needs it, for the seeker and the chat agent.
  why: string;
}

const CHECKS: { detail: MissingDetail; ok: (c: Candidate) => boolean }[] = [
  {
    detail: {
      key: 'resume',
      label: 'A processed CV',
      why: 'Every application form requires a resume file.',
    },
    ok: (c) => c.hasResume,
  },
  {
    detail: {
      key: 'phone',
      label: 'Phone number',
      why: 'Required on almost every form.',
    },
    ok: (c) => !!c.phone,
  },
  {
    detail: {
      key: 'location',
      label: 'Current city and country',
      why: 'Forms ask where you live; employers filter on it.',
    },
    ok: (c) => !!c.location,
  },
  {
    detail: {
      key: 'salary',
      label: 'Expected salary (amount and currency)',
      why: 'The most common screening question.',
    },
    ok: (c) =>
      (c.preferences.salaryMin != null || c.preferences.salaryMax != null) &&
      !!c.preferences.salaryCurrency,
  },
  {
    detail: {
      key: 'years_experience',
      label: 'Years of experience',
      why: 'Asked directly on many forms.',
    },
    ok: (c) => !!c.preferences.yearsExperience,
  },
  {
    detail: {
      key: 'availability',
      label: 'Notice period / when you can start',
      why: 'Asked directly on many forms.',
    },
    ok: (c) => !!c.preferences.availability,
  },
  {
    detail: {
      key: 'work_authorization',
      label: 'Countries you can work in without sponsorship',
      why: 'Forms ask about work authorization and visas.',
    },
    // Eligibility already treats the country they live in as authorized, so
    // a seeker who never listed countries is not blocked on this.
    ok: (c) => c.preferences.workAuthorization.length > 0 || !!c.country,
  },
];

export function applyReadiness(candidate: Candidate) {
  const missing = CHECKS.filter((c) => !c.ok(candidate)).map((c) => c.detail);
  return { ready: missing.length === 0, missing };
}
