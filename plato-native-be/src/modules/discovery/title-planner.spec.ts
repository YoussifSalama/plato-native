import {
  cleanTitle,
  fallbackTitles,
  MAX_TITLES,
  mergeTitles,
  TitleEvidence,
} from './title-planner';

const evidence: TitleEvidence = {
  requested: ['Software Engineer'],
  preferenceRoles: ['Full Stack Developer', 'software engineer'],
  skills: ['React', 'NestJS'],
  seniority: 'mid',
  yearsExperience: '3-5',
  experiences: [
    {
      title: 'Senior Backend Developer (Remote)',
      technologies: ['NestJS'],
      description: null,
      start: '2024-01-01',
      end: null,
    },
    {
      title: 'Frontend Developer - Contract',
      technologies: ['React'],
      description: null,
      start: '2023-01-01',
      end: '2023-12-01',
    },
    {
      title: 'Database Administrator',
      technologies: ['PostgreSQL'],
      description: null,
      start: '2022-01-01',
      end: '2022-12-01',
    },
  ],
};

describe('title planner (deterministic parts)', () => {
  it('strips seniority, brackets and trailing qualifiers', () => {
    expect(cleanTitle('Sr. Full-Stack  Developer (Remote)')).toBe(
      'Full-Stack Developer',
    );
    expect(cleanTitle('Lead Backend Engineer | Payments')).toBe(
      'Backend Engineer',
    );
    expect(cleanTitle('Junior React Developer')).toBe('React Developer');
  });

  it('dedupes across spelling and case, requested first, capped', () => {
    const merged = mergeTitles(
      ['Full Stack Developer'],
      ['full-stack developer', 'Fullstack Developer', 'Backend Developer'],
    );
    expect(merged).toEqual(['Full Stack Developer', 'Backend Developer']);
    const many = mergeTitles(
      Array.from({ length: 20 }, (_, i) => `Role Number ${i}`),
    );
    expect(many).toHaveLength(MAX_TITLES);
  });

  it('one asked title still becomes every role the history shows', () => {
    const plan = fallbackTitles(evidence);
    expect(plan.map((p) => p.title)).toEqual([
      'Software Engineer',
      'Full Stack Developer',
      'Backend Developer',
      'Frontend Developer',
      'Database Administrator',
    ]);
    expect(plan[0].reason).toBe('You asked for it');
    expect(plan[1].reason).toBe('One of your target roles');
    expect(plan[2].reason).toBe('A role you have held');
  });

  it('keeps teaching stints out unless the seeker wants them', () => {
    const taught = {
      ...evidence,
      experiences: [
        ...evidence.experiences,
        {
          title: 'Backend Instructor',
          technologies: [],
          description: null,
          start: null,
          end: null,
        },
      ],
    };
    expect(fallbackTitles(taught).map((p) => p.title)).not.toContain(
      'Backend Instructor',
    );
    const wantsIt = {
      ...taught,
      preferenceRoles: [...taught.preferenceRoles, 'Backend Instructor'],
    };
    expect(fallbackTitles(wantsIt).map((p) => p.title)).toContain(
      'Backend Instructor',
    );
  });
});
