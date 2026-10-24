import { excludesCountry } from './eligibility';

// Fixture postings only.
it('excludes only postings whose stated region leaves the country out', () => {
  const egypt = ['egypt'];
  expect(
    excludesCountry(
      { title: 'Backend Engineer', description: 'Remote, US only. Apply now.' },
      egypt,
    ),
  ).toBe(true);
  expect(
    excludesCountry(
      {
        title: 'Backend Engineer',
        description: 'Fully remote, work from anywhere.',
      },
      egypt,
    ),
  ).toBe(false);
  expect(excludesCountry({ title: 'Designer', description: null }, egypt)).toBe(
    false,
  );
});
