import { listingGone } from './job-freshness.service';

it('closed means gone or says so; blocked or errored means unknown', () => {
  expect(listingGone(404, '')).toBe(true);
  expect(listingGone(410, '')).toBe(true);
  expect(listingGone(200, 'Sorry, this position has been filled.')).toBe(true);
  expect(
    listingGone(200, 'The job you are looking for is no longer open'),
  ).toBe(true);
  expect(listingGone(200, 'Apply now for Backend Engineer at Acme')).toBe(
    false,
  );
  // a block page must not close the job
  expect(listingGone(403, 'Access denied')).toBeNull();
  expect(listingGone(429, '')).toBeNull();
  expect(listingGone(500, '')).toBeNull();
});
