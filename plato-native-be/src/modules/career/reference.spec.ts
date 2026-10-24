import { askWhatFor, intentFor, withReference } from './reference';

describe('withReference', () => {
  const jobs = new Map([['j1', { id: 'j1', title: 'Full Stack Dev', company: 'Acme', location: 'Cairo', description: 'Build React + Node apps.' }]]);
  it('appends the pinned job for the model, marked as data', () => {
    const out = withReference('Interview me', { type: 'reference', reference: { jobId: 'j1', title: 'Full Stack Dev', company: 'Acme' } }, jobs);
    expect(out).toContain('[Referenced job');
    expect(out).toContain('"Full Stack Dev" at Acme, Cairo');
    expect(out).toContain('Build React + Node apps.');
  });
  it('leaves other messages alone', () => {
    expect(withReference('hi', null, jobs)).toBe('hi');
    expect(withReference('hi', { type: 'reference', reference: { jobId: 'gone', title: 'x', company: 'y' } }, jobs)).toBe('hi');
  });
});

describe('intentFor', () => {
  it('only acts on a clear ask, in English or Arabic', () => {
    for (const t of ['hi', 'اه', 'yes', 'help', 'this one', 'About this job']) expect(intentFor(t)).toBeNull();
    for (const t of ['tailor my resume', 'Tailor my resume to this job', 'عايز سي في للوظيفة دي', 'فصّل السيرة الذاتية على الوظيفة دي']) expect(intentFor(t)).toBe('resume');
    for (const t of ['mock interview please', 'Mock interview for this job', 'عايز مقابلة تجريبية', 'مقابلة تجريبية للوظيفة دي']) expect(intentFor(t)).toBe('interview');
  });
  it('asks in the seeker\'s language, with the two choices', () => {
    expect(askWhatFor('hi', { title: 'Dev', company: 'Acme' }).choices).toEqual(['Tailor my resume to this job', 'Mock interview for this job']);
    expect(askWhatFor('اه', { title: 'Dev', company: 'Acme' }).reply).toContain('Dev');
  });
});
