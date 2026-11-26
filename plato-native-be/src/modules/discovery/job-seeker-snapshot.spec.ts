import { withCv, type JobSeekerSnapshot } from './job-seeker-snapshot';

const profile: JobSeekerSnapshot = {
  skills: ['SQL'],
  roles: ['Data Analyst'],
  preferredIndustries: [],
  preferredLocations: ['Egypt'],
  workSetup: ['remote'],
  jobTypes: [],
  experienceKeywords: ['Data Analyst'],
  yearsExperience: '5-10',
  seniority: 'senior',
  experiences: [],
  willingToRelocate: true,
  visaSponsorshipRequired: true,
  residenceCountry: 'EG',
  workAuthorization: ['AE'],
  employmentStatus: null,
  salary: { min: 2000, currency: 'USD', period: 'MONTHLY' },
};
const cv = {
  skills: ['Figma', 'Roadmaps'],
  experience: [
    { title: 'Associate PM', technologies: ['Jira'], description: null, start_date: '2024-01-01', end_date: null },
    { title: 'Intern', technologies: [], description: null, start_date: '2023-01-01', end_date: '2023-06-01' },
  ],
} as never;

describe('withCv: a search with a different CV', () => {
  it("takes the CV's skills and history, keeps what the person wants, and drops the profile's level", () => {
    const s = withCv(profile, cv);
    expect(s.skills).toEqual(['Figma', 'Roadmaps']);
    expect(s.experiences.map((e) => e.title)).toEqual(['Associate PM', 'Intern']);
    expect(s.experienceKeywords).toEqual(['Associate PM', 'Intern', 'Jira']);
    expect([s.yearsExperience, s.seniority]).toEqual([null, null]);
    expect(s).toMatchObject({
      roles: ['Data Analyst'],
      residenceCountry: 'EG',
      workAuthorization: ['AE'],
      willingToRelocate: true,
      visaSponsorshipRequired: true,
      salary: profile.salary,
    });
  });
});
