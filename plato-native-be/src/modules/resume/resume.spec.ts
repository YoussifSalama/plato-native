import { WriterOutput } from './resume-ai';
import {
  buildDoc,
  findGaps,
  profileIssues,
  verifyParsedText,
} from './resume-checks';
import { buildFacts } from './resume-facts';
import {
  decideStrategy,
  marketFromCountry,
  needsMarketPreference,
  stageOf,
} from './resume-strategy';
import { ResumeProfile } from './resume.types';

// Fixture only: a Node.js backend dev whose profile never mentions NestJS.
const profile: ResumeProfile = {
  fullName: 'Test User',
  email: 't@example.com',
  phone: '',
  location: 'Cairo, Egypt',
  country: 'EG',
  summary: 'Backend developer.',
  headline: 'Backend Developer',
  skills: ['Node.js', 'TypeScript'],
  links: {},
  experiences: [
    {
      title: 'Backend Developer',
      company: 'Acme',
      start: '2021-01-01',
      end: null,
      description: 'Built REST APIs with Node.js serving 5 services.',
      technologies: ['Node.js'],
    },
  ],
  educations: [
    {
      institution: 'Cairo University',
      degree: 'BSc',
      field: 'CS',
      end: '2020-06-01',
    },
  ],
  languages: [],
  certifications: [],
  projects: [],
  achievements: [
    {
      id: 'a1',
      company: 'Acme',
      projectName: null,
      text: 'Cut API latency',
      metric: '40%',
    },
  ],
  skillEvidence: [],
  nationality: null,
  marketOverrides: {},
  totalYears: 4,
};

describe('strategy', () => {
  it('maps countries to markets and years to stages', () => {
    expect(marketFromCountry('GB')).toBe('UK');
    expect(marketFromCountry('AE')).toBe('GCC');
    expect(marketFromCountry('FR')).toBe('EU');
    expect(marketFromCountry(null)).toBe('OTHER');
    expect([0, 2, 5, 12].map(stageOf)).toEqual([
      'entry',
      'junior',
      'mid',
      'senior',
    ]);
  });
  it('applies market and stage rules', () => {
    const us = decideStrategy({ market: 'US', stage: 'entry' });
    expect(us).toMatchObject({
      maxPages: 1,
      nationality: false,
      photo: 'avoid',
      template: 'classic',
    });
    expect(us.sections[1]).toBe('education');
    const gcc = decideStrategy({ market: 'GCC', stage: 'senior' });
    expect(gcc).toMatchObject({ maxPages: 3, nationality: true });
    expect(
      decideStrategy({ market: 'US', stage: 'mid', careerChanger: true }),
    ).toMatchObject({ format: 'hybrid' });
  });
  it('lets the seeker override a market default, and asks Egypt once', () => {
    expect(
      decideStrategy({
        market: 'GCC',
        stage: 'mid',
        overrides: { GCC: { personalBlock: false } },
      }).nationality,
    ).toBe(false);
    expect(needsMarketPreference('EG', {})).toBe(true);
    expect(needsMarketPreference('EG', { EG: { personalBlock: false } })).toBe(
      false,
    );
    expect(decideStrategy({ market: 'EG', stage: 'mid' })).toMatchObject({
      nationality: false,
      photo: 'none',
    });
  });
});

describe('claims gate', () => {
  const facts = buildFacts(profile);
  const strategy = decideStrategy({ market: 'US', stage: 'mid' });
  const out: WriterOutput = {
    summary: {
      text: 'Backend developer with NestJS experience.',
      facts: ['exp:0:role'],
    },
    skills: ['TypeScript', 'NestJS', 'Kubernetes'],
    experiences: [
      {
        ref: 'exp:0',
        bullets: [
          {
            text: 'Built REST APIs with Node.js across 5 services.',
            facts: ['exp:0:desc'],
          },
          { text: 'Migrated services to NestJS.', facts: ['exp:0:desc'] },
          { text: 'Cut API latency by 40%.', facts: ['ach:a1'] },
          { text: 'Grew revenue by 90%.', facts: ['ach:a1'] },
          { text: 'Led a team of 12.', facts: [] },
          { text: 'Shipped on time.', facts: ['exp:9:desc'] },
        ],
      },
      {
        ref: 'exp:9',
        bullets: [{ text: 'Ghost role.', facts: ['exp:0:desc'] }],
      },
    ],
    projects: [],
  };

  it('finds the required skill the profile does not show', () => {
    expect(findGaps(['NestJS', 'Node.js'], profile, [])).toEqual(['NestJS']);
    expect(findGaps(['NestJS'], profile, ['NestJS'])).toEqual([]);
  });

  it('removes unsupported claims and keeps true ones', () => {
    const { doc, dropped } = buildDoc(
      out,
      profile,
      facts,
      strategy,
      ['NestJS'],
      [],
    );
    expect(doc.skills).toEqual(['TypeScript']);
    expect(doc.summary).toBe('Backend developer.');
    expect(doc.experiences).toHaveLength(1);
    expect(doc.experiences[0].bullets).toEqual([
      'Built REST APIs with Node.js across 5 services.',
      'Cut API latency by 40%.',
    ]);
    expect(dropped).toBeGreaterThan(0);
  });

  it('includes a confirmed skill and its bullet', () => {
    const { doc } = buildDoc(out, profile, facts, strategy, [], ['NestJS']);
    expect(doc.skills).toContain('NestJS');
    expect(doc.experiences[0].bullets).toContain(
      'Migrated services to NestJS.',
    );
  });

  it('omits personal details the market does not want', () => {
    const withNat = { ...profile, nationality: 'Egyptian' };
    expect(
      buildDoc(out, withNat, facts, strategy, [], []).doc.nationality,
    ).toBeNull();
    const gcc = decideStrategy({ market: 'GCC', stage: 'mid' });
    expect(buildDoc(out, withNat, facts, gcc, [], []).doc.nationality).toBe(
      'Egyptian',
    );
  });
});

describe('parse check and issues', () => {
  const strategy = decideStrategy({ market: 'US', stage: 'mid' });
  const { doc } = buildDoc(
    { summary: null, skills: [], experiences: [], projects: [] },
    profile,
    buildFacts(profile),
    strategy,
    [],
    [],
  );
  it('passes text with fields in order and flags what is lost', () => {
    const good =
      'TEST USER t@example.com SUMMARY Backend developer. EXPERIENCE Backend Developer Acme SKILLS Node.js EDUCATION BSc';
    expect(verifyParsedText(good, doc).every((c) => c.ok)).toBe(true);
    const bad = 'EXPERIENCE Backend Developer SKILLS';
    expect(
      verifyParsedText(
        'TEST USER t@example.com SUMMARY x EDUCATION BSc EXPERIENCE Acme',
        doc,
      ).find((c) => c.name === 'parse_order')?.ok,
    ).toBe(false);
    expect(
      verifyParsedText(bad, doc).find((c) => c.name === 'parse_fields')?.ok,
    ).toBe(false);
  });
  it('lists what makes the profile weak', () => {
    const issues = profileIssues({ ...profile, skills: ['A'], projects: [] });
    expect(issues.join(' ')).toMatch(/Fewer than 3 skills/);
    expect(issues.join(' ')).toMatch(/No projects saved/);
  });
});

describe('implied skills and learning', () => {
  const web: ResumeProfile = {
    ...profile,
    skills: ['Next.js', 'React', 'PostgreSQL'],
    links: { github: 'https://github.com/x' },
    experiences: [{ ...profile.experiences[0], technologies: ['Docker'] }],
    skillEvidence: [
      { skill: '.NET', level: 'LEARNING', proof: 'learning it now', url: null },
    ],
  };
  it('does not ask for what a related skill already proves', () => {
    expect(
      findGaps(['JavaScript', 'HTML', 'CSS', 'Git', 'SQL', 'Ruby'], web, []),
    ).toEqual(['Ruby']);
  });
  it('still reports real gaps, including a skill only being learned', () => {
    expect(findGaps(['Kubernetes', '.NET', 'Docker'], web, [])).toEqual([
      'Kubernetes',
      '.NET',
    ]);
  });
  it('shows a learning skill as such and never as a skill', () => {
    const strategy = decideStrategy({ market: 'EU', stage: 'mid' });
    const { doc } = buildDoc(
      {
        summary: null,
        skills: ['.NET', 'React'],
        experiences: [],
        projects: [],
      },
      web,
      buildFacts(web),
      strategy,
      ['.NET'],
      [],
    );
    expect(doc.skills).toEqual(['React']);
    expect(doc.learning).toEqual(['.NET']);
  });
});
