import { Candidate } from '../apply/apply.types';
import { profileSummary } from './profile-summary';

const c = {
  fullName: 'Youssif Salama', headline: 'Full-Stack Engineer', location: 'Cairo', country: 'EG', email: 'y@x.co', phone: '+20100', summary: 'I build backends.',
  skills: ['Node.js', 'NestJS'], links: { portfolio: 'https://p.dev' }, totalYears: 4, languages: [{ language: 'English', proficiency: 'C1' }], certifications: [],
  preferences: { salaryMin: 3000, salaryMax: 4000, salaryCurrency: 'USD', salaryPeriod: 'MONTHLY', availability: 'immediately', yearsExperience: null, willingToRelocate: true, visaSponsorshipRequired: false, workAuthorization: ['EG'], autoApplyConsent: true },
  experiences: [{ title: 'Backend Engineer', company: 'Acme', start: '2022-01', end: null, description: 'Built a wallet.' }],
  educations: [{ institution: 'Cairo University', degree: 'BSc', field: 'CS', end: '2021' }], answerBank: { secret: 'x' },
} as unknown as Candidate;

describe('profileSummary', () => {
  it('lists the facts an answer can use, including what the seeker answered before (never asked again)', () => {
    const s = profileSummary(c);
    expect(s).toContain('Experience: Backend Engineer at Acme (2022-01 to present): Built a wallet.');
    expect(s).toContain('Expected salary: 3000-4000 USD per monthly');
    expect(s).toContain('Skills: Node.js, NestJS');
    expect(s).toContain('Answered before: "secret": x'); // the seeker's own answer, reused
  });
  it('is capped so a huge profile stays cheap', () => {
    expect(profileSummary({ ...c, summary: 'x'.repeat(20000) } as Candidate, 1000).length).toBeLessThanOrEqual(1000);
  });
});
