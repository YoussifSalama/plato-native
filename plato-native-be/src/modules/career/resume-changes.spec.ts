import { resumeChanges } from './resume-changes';

const profile = {
  summary: 'Senior SCM & ERP consultant with 7 years of experience.',
  skills: ['SAP', 'Odoo'],
  experiences: [
    {
      title: 'ERP Consultant',
      company: 'Inspire',
      start: '2022',
      end: null,
      description: 'ERP rollouts',
      technologies: [],
    },
    {
      title: 'Presales Lead',
      company: 'Raya',
      start: '2019',
      end: '2022',
      description: 'client demos',
      technologies: [],
    },
  ],
};

describe('resumeChanges', () => {
  it('reports a new summary, a reordered experience and only keywords the profile lacked', () => {
    const doc = {
      summary:
        'Senior consultant with 7 years in presales and solution design for applied AI.',
      experiences: [
        { ...profile.experiences[1], bullets: [] },
        { ...profile.experiences[0], bullets: [] },
      ],
    };
    const changes = resumeChanges(profile, doc, {
      matched: ['client demos', 'proof of concept', 'SAP', 'applied AI'],
    });
    expect(changes.map((c) => c.section)).toEqual([
      'summary',
      'experience',
      'keywords',
    ]);
    expect(changes[0].before).toBe(profile.summary);
    expect(changes[1].after).toContain('Presales Lead work at Raya');
    expect(changes[2].after).toBe('Added: proof of concept, applied AI.');
  });

  it('nothing changed: nothing reported', () => {
    const doc = {
      summary: profile.summary,
      experiences: profile.experiences.map((e) => ({ ...e, bullets: [] })),
    };
    expect(resumeChanges(profile, doc, { matched: ['SAP'] })).toEqual([]);
  });
});
