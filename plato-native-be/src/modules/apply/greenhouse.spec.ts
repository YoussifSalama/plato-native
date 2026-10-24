import { readFileSync } from 'fs';
import { join } from 'path';
import { mapAnswers } from './answer-mapper';
import { Candidate } from './apply.types';
import {
  GreenhouseJobForm,
  greenhouseApplyUrl,
  greenhouseIds,
  normalizeGreenhouseForm,
} from './forms/greenhouse.form';

// Real public form: boards-api.greenhouse.io/v1/boards/airbnb/jobs/8184174?questions=true
const job = JSON.parse(
  readFileSync(
    join(__dirname, 'forms/__fixtures__/greenhouse-airbnb.json'),
    'utf8',
  ),
) as GreenhouseJobForm;
const schema = normalizeGreenhouseForm(
  job,
  greenhouseApplyUrl('airbnb', '8184174'),
);
const field = (id: string) => schema.fields.find((f) => f.id === id);

describe('Greenhouse form (real Airbnb posting)', () => {
  it('keeps field names as ids, typed', () => {
    expect(field('first_name')).toMatchObject({ type: 'text', required: true });
    expect(field('email')?.type).toBe('email');
    expect(field('phone')?.type).toBe('phone');
    expect(field('question_69024584')).toMatchObject({
      label: 'LinkedIn Profile',
      type: 'url',
    });
  });

  it('attaches the resume as a file, writes the cover letter as text', () => {
    expect(
      schema.fields.some((f) => f.id === 'resume' || f.id === 'resume_text'),
    ).toBe(false);
    expect(field('cover_letter_text')).toMatchObject({
      type: 'paragraph',
      required: true,
    });
  });

  it('turns single and multi selects into choices with their labels', () => {
    expect(field('question_69024587')).toMatchObject({
      label: 'Gender',
      type: 'choice',
    });
    expect(field('question_69024587')?.options?.length).toBeGreaterThan(1);
    expect(field('question_69024586[]')?.type).toBe('multi');
  });

  it('skips hidden latitude/longitude, keeps location', () => {
    expect(field('latitude')).toBeUndefined();
    expect(field('location')?.type).toBe('text');
  });

  it('answers the contact basics from the profile', () => {
    const c = {
      fullName: 'Youssif Salama',
      firstName: 'Youssif',
      lastName: 'Salama',
      email: 'y@example.com',
      phone: '+201001234567',
      location: 'Cairo, Egypt',
      country: 'Egypt',
      headline: '',
      currentCompany: '',
      summary: '',
      skills: [],
      links: {},
      preferences: {
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        availability: null,
        yearsExperience: null,
        willingToRelocate: false,
        visaSponsorshipRequired: false,
        workAuthorization: ['Egypt'],
        autoApplyConsent: false,
      },
      languages: [],
      certifications: [],
      hasResume: true,
      totalYears: 3,
      facts: {},
      experiences: [],
      educations: [],
      answerBank: {},
    } as Candidate;
    const { answers } = mapAnswers(schema, c);
    expect(answers).toMatchObject({
      first_name: 'Youssif',
      last_name: 'Salama',
      email: 'y@example.com',
      country: 'Egypt',
    });
  });
});

describe('Greenhouse URLs', () => {
  it('reads board + id from hosted and embed URLs', () => {
    expect(
      greenhouseIds('https://job-boards.greenhouse.io/airbnb/jobs/8184174'),
    ).toEqual({ board: 'airbnb', id: '8184174' });
    expect(
      greenhouseIds('https://boards.greenhouse.io/stripe/jobs/123?gh_src=x'),
    ).toEqual({ board: 'stripe', id: '123' });
    expect(greenhouseIds(greenhouseApplyUrl('airbnb', '8184174'))).toEqual({
      board: 'airbnb',
      id: '8184174',
    });
  });

  it('refuses a custom careers domain it cannot map to a board', () => {
    expect(
      greenhouseIds(
        'https://careers.airbnb.com/positions/8184174?gh_jid=8184174',
      ),
    ).toBeNull();
  });
});
