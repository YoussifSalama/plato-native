import { buildAts, chooseHeadline, cleanTitle } from './resume-ats';
import { buildDoc } from './resume-checks';
import { buildFacts } from './resume-facts';
import { decideStrategy } from './resume-strategy';
import { ResumeProfile } from './resume.types';

// Fixture only: a Full Stack developer who writes React and Node.
const profile: ResumeProfile = {
  fullName: 'Test User',
  email: 't@example.com',
  phone: '',
  location: 'Cairo, Egypt',
  country: 'EG',
  summary: 'Full stack developer.',
  headline: 'Full Stack Developer',
  skills: ['React', 'Node', 'TypeScript'],
  links: {},
  experiences: [
    {
      title: 'Full Stack Developer',
      company: 'Acme',
      start: '2021-01-01',
      end: null,
      description: 'Built React dashboards and Node APIs for 5 teams.',
      technologies: ['React', 'Node.js', 'TypeScript'],
    },
  ],
  educations: [],
  languages: [],
  certifications: [],
  projects: [],
  achievements: [],
  skillEvidence: [],
  nationality: null,
  marketOverrides: {},
  totalYears: 4,
};

describe('headline', () => {
  it('cleans a posting title', () => {
    expect(cleanTitle('Senior Frontend Developer (m/f/d) - Cairo | Acme')).toBe(
      'Frontend Developer',
    );
    expect(cleanTitle('react developer, remote')).toBe('React Developer');
  });

  it('mirrors the job title when the profile shows that work', () => {
    const h = chooseHeadline(profile, 'Senior Frontend Developer');
    expect(h).toMatchObject({ text: 'Frontend Developer', aligned: true });
    expect(h.note).toContain('React');
  });

  it('keeps the own title when the profile does not show the work', () => {
    const h = chooseHeadline(profile, 'Data Engineer');
    expect(h).toMatchObject({ text: 'Full Stack Developer', aligned: false });
    expect(h.note).toContain('stays "Full Stack Developer"');
  });

  it('does not match on generic words alone', () => {
    const h = chooseHeadline(profile, 'Marketing Manager');
    expect(h.aligned).toBe(false);
  });
});

describe('keyword coverage', () => {
  const strategy = decideStrategy({
    market: 'US',
    stage: 'mid',
    careerChanger: false,
    template: 'classic',
    overrides: {},
  });

  it("uses the posting's spelling, lists proven skills, leaves unproven ones off", () => {
    const job = {
      required: ['Node.js', 'React', 'HTML', 'Kubernetes'],
      preferred: [],
      keywords: ['REST'],
    };
    const headline = chooseHeadline(profile, 'Frontend Developer');
    const { doc } = buildDoc(
      { summary: null, skills: [], experiences: [], projects: [] },
      profile,
      buildFacts(profile),
      strategy,
      ['Kubernetes'],
      [],
      { headline: headline.text, terms: [...job.required, ...job.keywords] },
    );
    // "Node" became "Node.js"; HTML is implied by React and is now listed.
    expect(doc.skills).toEqual(
      expect.arrayContaining(['Node.js', 'React', 'HTML']),
    );
    expect(doc.skills).not.toContain('Kubernetes');
    expect(doc.headline).toBe('Frontend Developer');

    const ats = buildAts(doc, headline, job)!;
    expect(ats.matched).toEqual(
      expect.arrayContaining(['Node.js', 'React', 'HTML']),
    );
    expect(ats.missing).toEqual(expect.arrayContaining(['Kubernetes', 'REST']));
    // required weighted x2: 3 of 4 required matched, keyword missed
    expect(ats.score).toBe(Math.round((100 * 6) / 9));
    expect(buildAts(doc, headline, null)).toBeNull();
  });
});
