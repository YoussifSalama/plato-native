/* eslint-disable */
// ESM-only packages jest can't parse; the loader under test never touches them.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { ApplyService } from '../apply/apply.service';
import { CandidateService } from './candidate.service';

const d = (s: string) => new Date(s);
const base = () => ({
  id: 's1',
  bio: 'Builds things',
  skills: ['TypeScript', 'NestJS'],
  website: 'https://me.dev',
  location: { city: 'Cairo', country: 'Egypt' },
  apply_facts: { notice: '30 days' },
  apply_answers: { why: 'Because' },
  user: { full_name: 'YOUSSIF SALAMA', email: 'y@example.com', phone: '+201001234567' },
  preferences: {
    linkedin_url: null,
    github_url: 'https://github.com/y',
    portfolio_url: null,
    salary_min: 1000,
    salary_max: 2000,
    salary_currency: 'USD',
    salary_period: 'MONTHLY',
    availability: 'IMMEDIATE',
    years_experience: 5,
    willing_to_relocate: true,
    visa_sponsorship_required: false,
    work_authorization: ['EG'],
    auto_apply_consent: true,
  },
  social_links: [{ platform: 'LinkedIn', url: 'https://linkedin.com/in/y' }],
  experiences: [
    { title: 'Dev', company: 'Acme', start_date: d('2022-01-01'), end_date: null, description: 'x' },
    { title: 'Jr', company: 'Old', start_date: d('2019-03-01'), end_date: d('2021-12-01'), description: null },
  ],
  educations: [{ institution: 'Cairo U', degree: 'BSc', field: 'CS', start_date: d('2015-09-01'), end_date: d('2019-01-01') }],
  languages: [{ language: 'English', proficiency: 'FLUENT' }],
  certifications: [{ name: 'AWS', issuer: 'Amazon' }],
  documents: [{ id: 'd1' }],
});

const variants: Record<string, (s: any) => any> = {
  'full profile, ALL CAPS name': (s) => s,
  'mixed-case name': (s) => ({ ...s, user: { ...s.user, full_name: 'Youssif Al-Salama' } }),
  'lowercase single name': (s) => ({ ...s, user: { ...s.user, full_name: 'madonna' } }),
  'no preferences, no social, no website': (s) => ({ ...s, preferences: null, social_links: [], website: null }),
  'github social fallback': (s) => ({ ...s, preferences: null, social_links: [{ platform: 'GitHub Profile', url: 'https://github.com/z' }] }),
  'no location, no bio, no facts': (s) => ({ ...s, location: null, bio: null, apply_facts: null, apply_answers: null }),
  'city only': (s) => ({ ...s, location: { city: 'Giza' } }),
  'no experience, no cv': (s) => ({ ...s, experiences: [], documents: [] }),
  'all experiences ended': (s) => ({ ...s, experiences: s.experiences.map((e: any) => ({ ...e, end_date: d('2023-01-01') })) }),
  'education without a start date': (s) => ({ ...s, educations: [{ ...s.educations[0], start_date: null }] }),
};

describe('CandidateService parity with the legacy loader', () => {
  it.each(Object.keys(variants))('%s', async (name) => {
    const seeker = variants[name](base());
    const prisma: any = { jobSeeker: { findUniqueOrThrow: jest.fn(async () => seeker) } };
    const legacy = await (ApplyService.prototype as any)['loadCandidate'].call({ prisma }, 's1');
    const copy = await new CandidateService(prisma).load('s1');
    // The one intended difference: v3 (2026-10-24) added the education start year, which the
    // frozen v2 loader never had (the model asked for it). Everything else must match.
    const expected = {
      ...legacy,
      educations: legacy.educations.map((e: any, i: number) => ({
        ...e,
        start: seeker.educations[i].start_date ? seeker.educations[i].start_date.toISOString().slice(0, 10) : null,
      })),
    };
    expect(copy).toEqual(expected);
    // Same query, too: a field added to one side only would show here.
    expect(prisma.jobSeeker.findUniqueOrThrow.mock.calls[1]).toEqual(
      prisma.jobSeeker.findUniqueOrThrow.mock.calls[0],
    );
  });
});
