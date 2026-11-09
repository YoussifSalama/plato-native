import type { AtsReport } from './resume-ats';
import {
  bandOf,
  bulletsOf,
  scoreMatch,
  scoreProfile,
  sendDecision,
  THRESHOLDS,
} from './resume-score';
import type { ResumeDoc, ResumeProfile } from './resume.types';

const base: ResumeProfile = {
  fullName: 'Raef Samir',
  email: 'raef@example.com',
  phone: '+20 100 000 0000',
  location: 'Cairo, Egypt',
  country: 'EG',
  headline: 'Senior SCM & ERP Consultant',
  summary:
    'Senior SCM and ERP consultant with 7 years leading SAP and Oracle rollouts across Egypt and the Gulf. Cut order-to-cash time by 30% for a retail group and trained 120 users on new planning tools. Known for clear client demos and on-time go-lives.',
  skills: [
    'SAP S/4HANA',
    'Oracle Fusion',
    'Odoo',
    'Supply chain planning',
    'ERP rollouts',
    'Presales',
    'Power BI',
    'SQL',
  ],
  links: { linkedin: 'https://linkedin.com/in/raef' },
  experiences: [
    {
      title: 'Senior SCM & ERP Consultant',
      company: 'Inspire Consulting',
      start: '2022-01-01',
      end: null,
      description: [
        'Led 6 ERP rollouts on SAP S/4HANA across Egypt and the Gulf, all live on time.',
        'Cut order-to-cash time by 30% for a retail client with Oracle Fusion.',
        'Built Power BI dashboards that 40 planners use every week for supply chain planning.',
        'Ran presales demos that won 3 new clients worth $1.2M.',
      ].join('\n'),
      technologies: ['SAP S/4HANA', 'Oracle Fusion', 'Power BI'],
    },
    {
      title: 'ERP Consultant',
      company: 'Raya Holding',
      start: '2019-01-01',
      end: '2021-12-01',
      description: [
        'Implemented Odoo for 4 business units with 300 users.',
        'Automated stock reports with SQL, saving 10 hours a week.',
        'Trained 120 users on ERP rollouts and new planning tools.',
      ].join('\n'),
      technologies: ['Odoo', 'SQL'],
    },
  ],
  educations: [
    {
      institution: 'Cairo University',
      degree: 'BSc',
      field: 'Engineering',
      end: '2018',
    },
  ],
  languages: [],
  certifications: [],
  projects: [],
  achievements: [],
  skillEvidence: [],
  nationality: null,
  marketOverrides: {},
  totalYears: 7,
};

describe('resume quality score (master resume)', () => {
  it('a complete, specific resume scores strong', () => {
    const s = scoreProfile(base);
    expect(s.score).toBeGreaterThanOrEqual(85);
    expect(s.band).toBe('strong');
    expect(s.categories.reduce((n, c) => n + c.max, 0)).toBe(100);
  });

  it('duties without numbers, filler and no contact score low, with the fixes that matter most', () => {
    const weak: ResumeProfile = {
      ...base,
      phone: '',
      links: {},
      summary: 'Results-driven team player.',
      skills: ['Communication'],
      experiences: [
        {
          ...base.experiences[0],
          description:
            'I was responsible for ERP projects and my tasks included many things.',
        },
        {
          ...base.experiences[1],
          start: '2015-01-01',
          end: '2016-01-01',
          description: null,
        },
      ],
    };
    const s = scoreProfile(weak);
    expect(s.score).toBeLessThan(THRESHOLDS.masterWarn);
    expect(s.topFixes.length).toBe(3);
    expect(s.topFixes[0]).toMatch(/number/i);
  });

  it('is the same every time for the same resume', () => {
    expect(scoreProfile(base)).toEqual(scoreProfile(base));
  });

  it('splits a role description into bullets', () => {
    expect(
      bulletsOf(
        '• Led 6 rollouts across the Gulf\n• Cut costs by 30% in a year',
      ),
    ).toHaveLength(2);
    expect(
      bulletsOf('Led 6 rollouts across the Gulf. Cut costs by 30% in a year.'),
    ).toHaveLength(2);
  });
});

describe('resume match score (one job)', () => {
  const doc = {
    headline: 'Senior SCM & ERP Consultant',
    experiences: [
      {
        title: 'Senior SCM & ERP Consultant',
        company: 'Inspire',
        start: null,
        end: null,
        bullets: ['Led SAP S/4HANA rollouts', 'Ran presales demos for clients'],
      },
    ],
  } as unknown as ResumeDoc;
  const ats = (score: number, aligned: boolean): AtsReport => ({
    score,
    matched: ['SAP S/4HANA', 'presales'],
    missing: ['Python'],
    headline: { text: 'x', jobTitle: 'ERP Consultant', aligned, note: '' },
  });

  it('good keyword coverage, matching title, skills in recent roles: fine to send', () => {
    const s = scoreMatch(doc, ats(90, true), { title: 'ERP Consultant' }, 88);
    expect(s.score).toBeGreaterThanOrEqual(THRESHOLDS.autoApply);
    expect(sendDecision(s.score)).toBe('send');
  });

  it('low coverage and another title: held, and the tip names what is missing honestly', () => {
    const s = scoreMatch(doc, ats(30, false), { title: 'Data Scientist' }, 60);
    expect(sendDecision(s.score)).toBe('hold');
    expect(s.topFixes.join(' ')).toMatch(/Python.*only if you have done it/);
  });

  it('keywords alone never reach 100', () => {
    const s = scoreMatch(
      { ...doc, experiences: [] } as unknown as ResumeDoc,
      { ...ats(100, false), matched: [] },
      { title: 'Other' },
      0,
    );
    expect(s.score).toBeLessThanOrEqual(50);
  });
});

it('bands and send rules follow the thresholds', () => {
  expect([bandOf(90), bandOf(80), bandOf(65), bandOf(40)]).toEqual([
    'strong',
    'good',
    'fair',
    'needs_work',
  ]);
  expect([sendDecision(80), sendDecision(70), sendDecision(50)]).toEqual([
    'send',
    'confirm',
    'hold',
  ]);
});
