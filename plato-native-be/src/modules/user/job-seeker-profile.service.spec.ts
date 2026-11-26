import { withVerified } from './job-seeker-profile.service';

describe('withVerified: a re-read of the CV keeps verified credentials', () => {
  const analysis = {
    experiences: [],
    educations: [],
    certifications: [{ name: 'PMP' }],
    languages: [],
    skills: ['SQL'],
    location: null,
    evaluation: {} as never,
    findings: [],
  };
  const credential = {
    skill: 'Docker',
    title: 'Docker Certified Associate',
    provider: 'Docker',
    verified_issuer: 'Credly',
    completed_at: new Date('2026-01-01'),
  };

  it('adds the verified certification and skill back, once', () => {
    const r = withVerified(analysis, [
      credential,
      { ...credential, skill: 'docker' },
    ]);
    expect(r.certifications.map((c) => c.name)).toEqual([
      'PMP',
      'Docker Certified Associate',
    ]);
    expect(r.certifications[1].issuer).toBe('Credly');
    expect(r.skills).toEqual(['SQL', 'Docker']);
  });

  it('what the CV already has is not doubled', () => {
    const r = withVerified(
      {
        ...analysis,
        certifications: [{ name: 'docker certified associate' }],
        skills: ['DOCKER'],
      },
      [credential],
    );
    expect(r.certifications).toHaveLength(1);
    expect(r.skills).toEqual(['DOCKER']);
  });
});
