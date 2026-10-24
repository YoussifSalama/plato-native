import { jobEligibility } from './job-eligibility';

const job = (over: object) => ({
  title: 'Developer',
  description: null as string | null,
  location: null as string | null,
  remote_type: 'REMOTE',
  ...over,
});

// Fixture text only.
it('says whether the seeker can take the job', () => {
  const eg = ['egypt'];
  expect(
    jobEligibility(job({ description: 'Remote, US only.' }), eg).status,
  ).toBe('restricted');
  expect(
    jobEligibility(job({ description: 'Work from anywhere.' }), eg).status,
  ).toBe('unknown');
  const onsite = jobEligibility(
    job({ location: 'Toronto, Canada', remote_type: 'ONSITE' }),
    eg,
  );
  expect(onsite.status).toBe('relocation');
  expect(onsite.note).toContain('Canada');
  // remote in another country is not a relocation
  expect(
    jobEligibility(
      job({ location: 'Toronto, Canada', remote_type: 'REMOTE' }),
      eg,
    ).status,
  ).toBe('unknown');
  // same country: nothing to flag
  expect(
    jobEligibility(job({ location: 'Cairo, Egypt', remote_type: 'ONSITE' }), eg)
      .status,
  ).toBe('unknown');
});
