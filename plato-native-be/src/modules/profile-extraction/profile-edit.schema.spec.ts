import { profileEditSchema } from './profile-edit.schema';

describe('profileEditSchema: a profile edit is checked, never silently dropped', () => {
  const base = {
    experiences: [],
    educations: [],
    certifications: [],
    languages: [],
    skills: [],
    location: null,
    editedSections: ['experience'],
  };
  const job = { company: 'Acme', title: 'Consultant' };
  const ok = (patch: object) =>
    profileEditSchema.safeParse({ ...base, ...patch }).success;

  it('a job needs a title and a company', () => {
    expect(ok({ experiences: [job] })).toBe(true);
    expect(ok({ experiences: [{ ...job, title: '  ' }] })).toBe(false);
    expect(ok({ experiences: [{ ...job, company: '' }] })).toBe(false);
  });
  it('a date that does not parse, or an end before the start, is an error', () => {
    expect(ok({ experiences: [{ ...job, start_date: 'soon' }] })).toBe(false);
    expect(
      ok({
        experiences: [
          { ...job, start_date: '2022-05-01', end_date: '2021-01-01' },
        ],
      }),
    ).toBe(false);
    expect(
      ok({ experiences: [{ ...job, start_date: '2021-01-01', end_date: '' }] }),
    ).toBe(true);
  });
});
