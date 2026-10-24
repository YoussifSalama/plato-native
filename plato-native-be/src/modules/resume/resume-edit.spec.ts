import { applyEdits, docEditsSchema } from './resume-edit';
import { ResumeDoc } from './resume.types';

const doc = {
  name: 'T',
  headline: 'Full Stack Developer',
  summary: 'Old.',
  skills: ['React'],
  experiences: [
    { title: 'Dev', company: 'Acme', start: null, end: null, bullets: ['a'] },
  ],
  projects: [],
} as unknown as ResumeDoc;

it('applies wording edits only and keeps employer facts', () => {
  const out = applyEdits(doc, {
    headline: 'Frontend Developer',
    skills: ['React', 'CSS'],
    experiences: [{ bullets: ['Built dashboards', 'Cut load time'] }],
    // company is not part of the schema, so it cannot arrive
    ...({ company: 'Evil' } as object),
  });
  expect(out.headline).toBe('Frontend Developer');
  expect(out.summary).toBe('Old.');
  expect(out.skills).toEqual(['React', 'CSS']);
  expect(out.experiences[0]).toMatchObject({
    company: 'Acme',
    title: 'Dev',
    bullets: ['Built dashboards', 'Cut load time'],
  });
  expect(
    docEditsSchema.safeParse({ experiences: [{ bullets: ['x'.repeat(301)] }] })
      .success,
  ).toBe(false);
});
