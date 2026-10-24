import { readFileSync } from 'fs';
import { join } from 'path';
import { mapAnswers, normalizeLabel, splitName } from './answer-mapper';
import { Candidate } from './apply.types';
import { leverApplyUrl, parseLeverForm } from './forms/lever.form';
import { applyReadiness } from './readiness';
import { normalizeWorkableForm, workableJobId } from './forms/workable.form';

const candidate: Candidate = {
  fullName: 'Youssif Salama',
  firstName: 'Youssif',
  lastName: 'Salama',
  email: 'y@example.com',
  phone: '+201001234567',
  location: 'Cairo, Egypt',
  headline: 'Full Stack Developer',
  currentCompany: 'Acme',
  summary: '',
  skills: ['TypeScript'],
  links: { linkedin: 'https://linkedin.com/in/ys' },
  preferences: {
    salaryMin: 10000,
    salaryMax: 20000,
    salaryCurrency: 'USD',
    salaryPeriod: 'MONTHLY',
    availability: null,
    yearsExperience: '3-5',
    willingToRelocate: false,
    visaSponsorshipRequired: false,
    workAuthorization: ['Egypt'],
    autoApplyConsent: true,
  },
  languages: [],
  certifications: [],
  hasResume: true,
  country: 'Egypt',
  totalYears: 3,
  facts: {},
  experiences: [],
  educations: [],
  answerBank: {},
};

describe('Lever form parser (real apply page)', () => {
  const html = readFileSync(
    join(__dirname, 'forms/__fixtures__/lever-apply.html'),
    'utf8',
  );
  const schema = parseLeverForm(html, 'https://jobs.lever.co/pattern/x/apply');
  const byId = (id: string) => schema.fields.find((f) => f.id === id);

  it('reads the fixed fields with their required flags', () => {
    expect(byId('name')?.required).toBe(true);
    expect(byId('email')?.type).toBe('email');
    expect(byId('org')?.required).toBe(false);
    expect(byId('urls[LinkedIn]')).toBeDefined();
    expect(byId('resume')?.type).toBe('file');
  });

  it('reads custom question cards from their embedded JSON', () => {
    const cards = schema.fields.filter((f) => f.id.startsWith('cards['));
    expect(cards).toHaveLength(8);
    const salary = cards.find((f) => /desired annual salary/.test(f.label));
    expect(salary).toMatchObject({ type: 'text', required: true });
    const choice = cards.find((f) => /legally authorized/.test(f.label));
    expect(choice?.type).toBe('choice');
    expect(choice?.options?.length).toBeGreaterThan(1);
  });

  it('builds the apply URL from a posting URL', () => {
    expect(leverApplyUrl('https://jobs.lever.co/acme/123')).toBe(
      'https://jobs.lever.co/acme/123/apply',
    );
    expect(leverApplyUrl('https://jobs.lever.co/acme/123/apply')).toBe(
      'https://jobs.lever.co/acme/123/apply',
    );
  });
});

describe('Workable form normalizer', () => {
  const schema = normalizeWorkableForm(
    [
      {
        name: 'Personal information',
        fields: [
          {
            id: 'firstname',
            label: 'First name',
            type: 'text',
            required: true,
          },
          { id: 'phone', label: 'Phone', type: 'phone', required: true },
        ],
      },
      {
        name: 'Details',
        fields: [
          {
            id: 'QA_1',
            label: 'Are you located in LATAM?',
            type: 'boolean',
            required: true,
          },
          {
            id: 'QA_2',
            label: 'Please share your LinkedIn profile URL\n(Required)',
            type: 'text',
            required: true,
          },
          {
            id: 'QA_3',
            label: 'Monthly salary expectation in USD?',
            type: 'text',
            required: true,
            maxLength: 127,
          },
          {
            id: 'CA_1',
            label: 'How often do you use AI tools?',
            type: 'multiple',
            singleOption: true,
            required: false,
            options: [
              { name: '539149', value: 'Daily' },
              { name: '539150', value: 'A few times per week' },
            ],
          },
          { id: 'weird', label: 'x', type: 'unknown-widget', required: false },
        ],
      },
    ],
    'https://jobs.workable.com/view/abc/slug',
  );

  it('keeps ids as selectors and drops unknown widgets', () => {
    expect(schema.fields.map((f) => f.id)).toEqual([
      'firstname',
      'phone',
      'QA_1',
      'QA_2',
      'QA_3',
      'CA_1',
    ]);
    // Options are the visible text, never Workable's internal ids.
    expect(schema.fields[5]).toMatchObject({
      type: 'choice',
      options: ['Daily', 'A few times per week'],
    });
    expect(schema.fields[2].type).toBe('boolean');
  });

  it('extracts the short job id from a board URL', () => {
    expect(
      workableJobId('https://jobs.workable.com/view/pAJNj2/some-slug'),
    ).toBe('pAJNj2');
    expect(workableJobId('https://example.com/x')).toBeNull();
  });

  it('maps facts, and turns everything else into a question', () => {
    const { answers, questions } = mapAnswers(schema, candidate);
    expect(answers).toMatchObject({
      firstname: 'Youssif',
      phone: '+201001234567',
      QA_2: 'https://linkedin.com/in/ys', // a fact in disguise
    });
    // Expected salary is a fact (typed for the question); a judgment call
    // like "are you located in LATAM?" goes to the drafting agent.
    expect(answers.QA_3).toBe('20000 USD per month');
    expect(questions.map((q) => q.id)).toEqual(['QA_1']);
  });

  it('reuses confirmed answers and the answer bank', () => {
    const banked = {
      ...candidate,
      answerBank: {
        [normalizeLabel('Monthly salary expectation in USD?')]: '4000 USD',
      },
    };
    const { answers, questions } = mapAnswers(schema, banked, { QA_1: false });
    expect(answers.QA_1).toBe(false);
    expect(answers.QA_3).toBe('4000 USD');
    expect(questions).toHaveLength(0);
  });

  it('rejects a banked answer that is not a valid option', () => {
    const choice = {
      ...schema,
      fields: [
        {
          id: 'c',
          label: 'Pick',
          type: 'choice' as const,
          required: true,
          options: ['A', 'B'],
        },
      ],
    };
    expect(mapAnswers(choice, candidate, { c: 'Z' }).questions).toHaveLength(1);
    expect(mapAnswers(choice, candidate, { c: 'B' }).answers.c).toBe('B');
  });
});

describe('splitName', () => {
  it('handles single and multi-part names', () => {
    expect(splitName('Youssif Salama Ali')).toEqual({
      firstName: 'Youssif',
      lastName: 'Salama Ali',
    });
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: 'Cher' });
  });
});

describe('apply readiness', () => {
  it('lists exactly what the snapshot is missing, asked once not per job', () => {
    // The fixture candidate has no notice period.
    const { ready, missing } = applyReadiness(candidate);
    expect(ready).toBe(false);
    expect(missing.map((m) => m.key)).toEqual(['availability']);
  });

  it('is ready once the basics are there', () => {
    const complete = {
      ...candidate,
      preferences: { ...candidate.preferences, availability: 'one_month' },
    };
    expect(applyReadiness(complete).ready).toBe(true);
  });

  it('never applies without a CV, and never gates on a consent question', () => {
    const bare = {
      ...candidate,
      hasResume: false,
      preferences: {
        ...candidate.preferences,
        availability: 'immediately',
        autoApplyConsent: false,
      },
    };
    expect(applyReadiness(bare).missing.map((m) => m.key)).toEqual(['resume']);
  });
});

describe('mapAnswers by field type', () => {
  it('fills an optional phone/email field whatever language its label is in', () => {
    const { answers } = mapAnswers(
      {
        source: 'ASHBY',
        applyUrl: 'https://jobs.ashbyhq.com/x/y/application',
        fields: [
          { id: 'p', label: 'Teléfono', type: 'phone', required: false },
          { id: 'e', label: 'Correo', type: 'email', required: false },
        ],
      },
      candidate,
    );
    expect(answers).toEqual({ p: candidate.phone, e: candidate.email });
  });
});
