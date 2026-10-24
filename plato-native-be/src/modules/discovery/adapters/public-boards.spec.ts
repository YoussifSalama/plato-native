import { JobRemoteType, JobSource } from '@prisma/client';
import { DiscoveryQuery, NormalizedJob } from './types';
import {
  boardFromUrl,
  fromGreenhouse,
  fromWorkable,
  matchesQuery,
} from './public-boards.adapter';

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const query: DiscoveryQuery = {
  titles: ['Backend Developer'],
  locations: ['Cairo, Egypt'],
  countries: ['EG'],
  remoteTypes: ['remote'],
  jobTypes: [],
  industries: [],
  yearsExperience: null,
  willingToRelocate: false,
  visaSponsorshipRequired: false,
};

describe('public boards', () => {
  it('finds the board in any stored URL', () => {
    expect(
      boardFromUrl(JobSource.LEVER, 'https://jobs.lever.co/masterborn-2/abc'),
    ).toEqual({ source: 'LEVER', slug: 'masterborn-2', eu: false });
    expect(
      boardFromUrl(JobSource.LEVER, 'https://jobs.eu.lever.co/acme/abc'),
    ).toMatchObject({ eu: true, slug: 'acme' });
    expect(
      boardFromUrl(
        JobSource.GREENHOUSE,
        'https://job-boards.greenhouse.io/embed/job_app?for=airbnb&token=1',
      )?.slug,
    ).toBe('airbnb');
    expect(
      boardFromUrl(
        JobSource.GREENHOUSE,
        'https://boards.greenhouse.io/stripe/jobs/1',
      )?.slug,
    ).toBe('stripe');
    expect(
      boardFromUrl(JobSource.ASHBY, 'https://jobs.ashbyhq.com/Linear/123')
        ?.slug,
    ).toBe('Linear');
    expect(
      boardFromUrl(
        JobSource.GREENHOUSE,
        'https://careers.airbnb.com/positions/1',
      ),
    ).toBeNull();
  });

  it('maps a Workable search hit with the short id the apply adapter uses', () => {
    const j = fromWorkable({
      id: 'cd65ed21',
      title: 'Backend Developer',
      url: 'https://jobs.workable.com/view/rn5BkSBt/backend-dev',
      workplace: 'hybrid',
      location: { city: 'Cairo', countryName: 'Egypt' },
      created: recent,
      company: { title: 'Integrant' },
    });
    expect(j).toMatchObject({
      source: 'WORKABLE',
      external_id: 'rn5BkSBt',
      company: 'Integrant',
      location: 'Cairo, Egypt',
      remote_type: 'HYBRID',
    });
  });

  it('gives Greenhouse jobs the embeddable apply form', () => {
    const j = fromGreenhouse(
      {
        id: 42,
        title: 'Backend Developer',
        absolute_url: 'https://careers.acme.com/42',
        location: { name: 'Remote - EMEA' },
        first_published: recent,
      },
      { source: 'GREENHOUSE', slug: 'acme', company: 'Acme' },
    );
    expect(j.apply_url).toBe(
      'https://job-boards.greenhouse.io/embed/job_app?for=acme&token=42',
    );
    expect(j.remote_type).toBe(JobRemoteType.REMOTE);
  });

  it('keeps only recent, on-title jobs the seeker can work', () => {
    const base = {
      source: JobSource.LEVER,
      external_id: '1',
      company: 'A',
      url: 'u',
      easy_apply: true,
      posted_at: new Date(recent),
      raw: {},
    } as unknown as NormalizedJob;
    const at = (over: Partial<NormalizedJob>) => ({
      ...base,
      title: 'Senior Backend Developer',
      location: 'Cairo, Egypt',
      remote_type: JobRemoteType.ONSITE,
      ...over,
    });
    expect(matchesQuery(at({}), query)).toBe(true);
    expect(matchesQuery(at({ title: 'Product Designer' }), query)).toBe(false);
    expect(matchesQuery(at({ location: 'Berlin, Germany' }), query)).toBe(
      false,
    );
    expect(
      matchesQuery(
        at({ location: 'Anywhere', remote_type: JobRemoteType.REMOTE }),
        query,
      ),
    ).toBe(true);
    expect(
      matchesQuery(
        at({ posted_at: new Date(Date.now() - 90 * 86_400_000) }),
        query,
      ),
    ).toBe(false);
  });
});
