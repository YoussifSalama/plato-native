import { buildGreeting, describeSeeker } from './orchestrator.agent';
import { JobSeekerSnapshot } from '../discovery/job-seeker-snapshot';

const snapshot: JobSeekerSnapshot = {
  skills: ['React', 'Node.js'],
  roles: ['Full Stack Developer'],
  preferredIndustries: [],
  preferredLocations: ['Cairo, Egypt'],
  workSetup: ['remote'],
  jobTypes: ['full_time'],
  experienceKeywords: ['Software Engineer', 'React'],
  seniority: null,
  experiences: [],
  yearsExperience: '3-5',
  willingToRelocate: false,
  visaSponsorshipRequired: false,
  residenceCountry: 'EG',
  employmentStatus: 'employed',
  salary: { min: null, currency: null, period: 'MONTHLY' as const },
};

describe('buildGreeting', () => {
  it('asks about the top role', () => {
    expect(buildGreeting('Ahmed Hassan', snapshot)).toBe(
      'Are you looking for Full Stack Developer positions today, or something different?',
    );
  });

  it('falls back when no role is known', () => {
    expect(buildGreeting('', { ...snapshot, roles: [] })).toBe(
      'What kind of role are you looking for today?',
    );
  });
});

describe('describeSeeker', () => {
  it('skips empty sections', () => {
    const text = describeSeeker('Ahmed Hassan', snapshot);
    expect(text).toContain('- Name: Ahmed Hassan');
    expect(text).toContain('- Skills: React, Node.js');
    expect(text).not.toContain('Industries');
  });
});
