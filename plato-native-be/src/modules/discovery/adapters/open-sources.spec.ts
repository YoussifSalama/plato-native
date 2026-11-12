import { JobSource } from '@prisma/client';

// @nestjs/config and @nestjs/jwt ship as ESM, which this Jest setup does not load; neither runs here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
import { applyAtsResult, initialProgress } from '../discovery-run.helpers';
import { AtsAggregatorAdapter, toSource } from './ats-aggregator.adapter';
import { googleJobs } from './boards/google-jobs';
import { isEasyApply, LinkedInAdapter } from './linkedin.adapter';
import { DiscoveryQuery } from './types';

// Large employers (PwC, Vodafone, Orange...) post "Apply on company website" on
// LinkedIn and run their own career sites on Workday, SuccessFactors and the
// like. Discovery used to keep only Easy Apply and three startup hiring
// systems, so none of their jobs were found. These pin the opened sources.

const query = (over: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({
  titles: ['Software Engineer'],
  locations: ['Cairo, Egypt'],
  countries: ['EG'],
  remoteTypes: ['onsite'],
  jobTypes: [],
  industries: [],
  yearsExperience: null,
  willingToRelocate: false,
  visaSponsorshipRequired: false,
  ...over,
});

function fakeApify(items: unknown[] = []) {
  const calls: { actor: string; input: Record<string, unknown> }[] = [];
  return {
    calls,
    apify: {
      runActor: jest.fn(
        async (actor: string, input: Record<string, unknown>) => {
          calls.push({ actor, input });
          return items;
        },
      ),
    },
  };
}

describe('LinkedIn: every job, not only Easy Apply', () => {
  it('searches without the Easy Apply filter', async () => {
    const { apify, calls } = fakeApify();
    await new LinkedInAdapter(apify as never).discover(query());
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      const url = new URL((c.input.urls as string[])[0]);
      expect(url.searchParams.has('f_AL')).toBe(false);
      expect(url.searchParams.get('keywords')).toBe('Software Engineer');
    }
  });

  it('tells Easy Apply from "apply on the company site"', () => {
    expect(isEasyApply({ applyMethod: 'SimpleOnsiteApply' })).toBe(true);
    expect(isEasyApply({ applyMethod: 'ComplexOnsiteApply' })).toBe(true);
    expect(
      isEasyApply({
        applyMethod: 'OffsiteApply',
        applyUrl: 'https://pwc.wd3.myworkdayjobs.com/x',
      }),
    ).toBe(false);
    // No method reported: the apply link decides.
    expect(
      isEasyApply({ applyUrl: 'https://www.linkedin.com/jobs/view/123' }),
    ).toBe(true);
    expect(
      isEasyApply({ applyUrl: 'https://careers.vodafone.com/job/123' }),
    ).toBe(false);
    expect(isEasyApply({})).toBe(false);
  });
});

describe('Company career sites: every hiring system', () => {
  it('no longer limits the search to Lever, Greenhouse and Ashby', async () => {
    const { apify, calls } = fakeApify();
    await new AtsAggregatorAdapter(apify as never).discover(query());
    expect(calls).toHaveLength(1);
    expect(calls[0].input).not.toHaveProperty('ats');
    expect(calls[0].input.locationSearch).toBeDefined();
  });

  it('a Workday posting is a company career site, applied to on the site; Greenhouse stays fillable', async () => {
    const { apify } = fakeApify([
      {
        id: 1,
        title: 'Software Engineer',
        organization: 'PwC',
        url: 'https://pwc.wd3.myworkdayjobs.com/en-US/Global/job/Cairo/SE_123',
        source: 'workday',
        locations_derived: ['Cairo, Egypt'],
      },
      {
        id: 2,
        title: 'Software Engineer',
        organization: 'Acme',
        url: 'https://job-boards.greenhouse.io/acme/jobs/42',
        source: 'greenhouse',
      },
    ]);
    const jobs = await new AtsAggregatorAdapter(apify as never).discover(
      query(),
    );
    expect(jobs.map((j) => [j.company, j.source, j.easy_apply])).toEqual([
      ['PwC', JobSource.CAREER_SITE, false],
      ['Acme', JobSource.GREENHOUSE, true],
    ]);
  });

  it('an unknown hiring system is never labelled as Workable', () => {
    expect(toSource('successfactors')).toBe(JobSource.CAREER_SITE);
    expect(toSource(undefined)).toBe(JobSource.CAREER_SITE);
    expect(toSource('lever.co')).toBe(JobSource.LEVER);
  });

  it('company career sites get their own card in the search progress', () => {
    const p = applyAtsResult(initialProgress(), {
      status: 'fulfilled',
      value: [
        { source: JobSource.CAREER_SITE } as never,
        { source: JobSource.CAREER_SITE } as never,
      ],
    });
    expect(p.sources.career_site).toEqual({ status: 'DONE', fetched: 2 });
  });
});

describe('Google Jobs: Egypt and the Gulf too', () => {
  it('runs for Egypt and the Gulf as well as North America', () => {
    for (const c of ['EG', 'AE', 'SA', 'US', 'CA'])
      expect(googleJobs.countries).toContain(c);
  });
});
