import {
  ASSISTANT_TOOLS,
  buildGreeting,
  createOrchestratorAgent,
  describeSeeker,
} from './orchestrator.agent';
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

describe('assistant-only panel', () => {
  it('keeps only read-only tools and open_path', () => {
    const live = {
      thread: { id: 't', title: null },
      searches: [],
      latestRun: null,
      results: null,
      othersRunning: [],
      ui: {},
    } as never;
    const names = (assistantOnly: boolean) =>
      createOrchestratorAgent(
        'gpt-4.1-mini',
        { firstName: 'Y', snapshot },
        live,
        '',
        [],
        assistantOnly,
      ).tools.map((t) => t.name);
    expect(names(false)).toContain('start_job_search');
    const docked = names(true);
    expect(docked).toContain('open_path');
    for (const t of docked) expect(ASSISTANT_TOOLS.has(t)).toBe(true);
    expect(docked).not.toContain('start_job_search');
    expect(docked).not.toContain('click_element');
  });
});
