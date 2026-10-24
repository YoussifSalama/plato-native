import { mapAnswers } from './answer-mapper';
import { Candidate, FormField, FormSchema } from './apply.types';
import { checkEligibility, roleKey } from './eligibility';
import { normalizeWorkableForm } from './forms/workable.form';
import { INTERVIEW_FILLER, validateAnswers } from './validate-answers';

// Every case here is a real failure from the 2026-09-19 audit of the first
// live batch (37 applications, 0 submitted). Field definitions are copied
// from the employers' actual Workable forms.

const seeker: Candidate = {
  fullName: 'Youssif Salama',
  firstName: 'Youssif',
  lastName: 'Salama',
  email: 'y@example.com',
  phone: '+201001234567',
  location: 'Cairo, Egypt',
  country: 'Egypt',
  headline: 'AI Integration Engineer',
  currentCompany: 'Plato',
  summary: '',
  skills: ['Node.js', 'NestJS', 'React', 'Next.js', 'MongoDB', 'TypeScript'],
  links: {},
  preferences: {
    salaryMin: 10000,
    salaryMax: 20000,
    salaryCurrency: 'USD',
    salaryPeriod: 'MONTHLY',
    availability: 'one_month',
    yearsExperience: '1-3',
    willingToRelocate: false,
    visaSponsorshipRequired: false,
    workAuthorization: ['Egypt'],
    autoApplyConsent: true,
  },
  languages: [],
  certifications: [],
  hasResume: true,
  totalYears: 3,
  facts: {},
  experiences: [
    {
      title: 'Full Stack Developer',
      company: 'Acme',
      start: '2023-11-01',
      end: null,
      description: 'Node.js, NestJS, React',
    },
  ],
  educations: [
    {
      institution: 'Damanhour University',
      degree: 'BSc',
      field: 'CS',
      end: '2023-06-30',
    },
  ],
  answerBank: {},
};

const form = (fields: FormField[]): FormSchema => ({
  source: 'WORKABLE',
  applyUrl: 'https://jobs.workable.com/view/x/y',
  fields,
});
const num = (id: string, label: string): FormField => ({
  id,
  label,
  type: 'number',
  required: true,
});

describe('audit: number fields (The HR Game, mylo)', () => {
  // Sent before: salary "1,000,020,000" (range 10000-20000 typed into a
  // number box), years "13" (from "1-3"), notice "1".
  const schema = form([
    num('y', 'How many years of experience do you currently have ?'),
    num('s', 'What is your expected salary ?'),
    num('n', 'What is your notice period ?'),
  ]);
  const { answers, questions } = mapAnswers(schema, seeker);

  it('sends one number per field, from facts', () => {
    expect(answers).toEqual({ y: '3', s: '20000', n: '30' });
    expect(questions).toHaveLength(0);
    expect(validateAnswers(schema, answers)).toEqual([]);
  });

  it('follows the unit and period the question names', () => {
    const s2 = form([
      num('d', 'How many days is your notice period?'),
      num('m', 'Notice period in months'),
      num('a', 'Expected annual salary (USD)'),
    ]);
    expect(mapAnswers(s2, seeker).answers).toEqual({
      d: '30',
      m: '1',
      a: '240000',
    });
  });
});

describe('audit: facts Plato does not hold', () => {
  it('never borrows expected salary for "current salary" (mylo, SSC)', () => {
    const schema = form([num('c', 'What is your current net salary?')]);
    const { answers, questions } = mapAnswers(schema, seeker);
    expect(answers.c).toBeUndefined();
    expect(questions.map((q) => q.intakeKey)).toEqual(['current_salary']);
    // Once the seeker has said it, it is used.
    expect(
      mapAnswers(schema, { ...seeker, facts: { current_salary: '8000' } })
        .answers.c,
    ).toBe('8000');
  });

  it('does not convert currencies: lakhs / PHP / EGP questions stay unknown (Weekday AI, Mondia)', () => {
    const schema = form([
      num('l', "What's your current salary? (in lakhs per annum)"),
      num('e', 'Expected salary per month (EGP/NET)'),
    ]);
    expect(mapAnswers(schema, seeker).answers).toEqual({});
  });
});

describe('audit: link fields (ClassWallet)', () => {
  // Sent before: "I would be glad to go into this in detail in an interview."
  const schema = normalizeWorkableForm(
    [
      {
        fields: [
          { id: 'li', label: 'LinkedIn URL', type: 'text', required: true },
          { id: 'gh', label: 'GitHub URL', type: 'text', required: true },
        ],
      },
    ],
    'https://jobs.workable.com/view/x/y',
  );

  it('types them as url and leaves them unknown without a saved link', () => {
    expect(schema.fields.map((f) => f.type)).toEqual(['url', 'url']);
    expect(mapAnswers(schema, seeker).questions).toHaveLength(2);
    const linked = {
      ...seeker,
      links: { linkedin: 'https://linkedin.com/in/ys' },
    };
    expect(mapAnswers(schema, linked).answers.li).toBe(
      'https://linkedin.com/in/ys',
    );
  });

  it('the validator blocks a sentence in a link or short field, and internal notes', () => {
    const bad = validateAnswers(schema, {
      li: INTERVIEW_FILLER,
      gh: 'https://github.com/ys',
    });
    expect(bad.map((p) => p.fieldId)).toEqual(['li']);
    const text = form([
      {
        id: 't',
        label: 'Monthly salary expectation (PHP)',
        type: 'text',
        required: true,
      },
    ]);
    expect(
      validateAnswers(text, {
        t: '20000 USD per month (converted currency and period not supported by snapshot)',
      })[0].problem,
    ).toBe('contains internal wording');
    expect(
      validateAnswers(form([num('n', 'Expected salary')]), {
        n: '10000-20000',
      })[0].problem,
    ).toContain('not a valid number');
  });
});

describe('audit: sensitive questions (Arpu, SSC HR)', () => {
  const gender: FormField = {
    id: 'g',
    label: 'Gender',
    type: 'choice',
    required: true,
    options: ['Male', 'Female'],
  };
  const military: FormField = {
    id: 'm',
    label: 'Military Status',
    type: 'choice',
    required: true,
    options: ['Exemption', 'Complete the service Military', 'Postponed', 'N/A'],
  };
  const pronouns: FormField = {
    id: 'p',
    label: 'Pronouns',
    type: 'choice',
    required: true,
    options: ['Him/Mr.', 'Her/Ms.'],
  };

  it('never guesses; "N/A" is not treated as a way to decline', () => {
    const { answers, questions } = mapAnswers(
      form([gender, military, pronouns]),
      seeker,
    );
    expect(answers).toEqual({});
    expect(questions.every((q) => q.sensitive)).toBe(true);
  });

  it("uses the form's own decline option when there is one", () => {
    const withDecline = {
      ...gender,
      options: ['Male', 'Female', 'Prefer not to say'],
    };
    expect(mapAnswers(form([withDecline]), seeker).answers.g).toBe(
      'Prefer not to say',
    );
  });

  it("maps what the seeker chose to tell us onto each form's wording", () => {
    const told = {
      ...seeker,
      facts: {
        gender: 'Male',
        pronouns: 'He/Him',
        military_status: 'Completed',
      },
    };
    expect(
      mapAnswers(form([gender, military, pronouns]), told).answers,
    ).toEqual({ g: 'Male', m: 'Complete the service Military', p: 'Him/Mr.' });
  });
});

describe('audit: jobs Plato should not have applied to', () => {
  const job = (title: string, description = '') => ({ title, description });

  it('skips a stack the title demands and the history lacks', () => {
    expect(
      checkEligibility(
        job(
          'Senior Java Backend Engineer | Spring Boot | Microservices | Kafka',
        ),
        seeker,
      ),
    ).toMatchObject({ eligible: false });
    expect(
      checkEligibility(job('Java Full Stack Developer'), seeker).reason,
    ).toContain('Java');
    expect(
      checkEligibility(job('JavaScript Full Stack Developer'), seeker).eligible,
    ).toBe(true);
  });

  it('skips management roles without management history', () => {
    expect(
      checkEligibility(job('Engineering Manager, Full-Stack'), seeker).eligible,
    ).toBe(false);
  });

  it('respects hard region restrictions (Workana: LATAM only)', () => {
    const latam = job(
      'Full Stack MERN Developer',
      'Must be based in Latam. Fluent English.',
    );
    expect(checkEligibility(latam, seeker).eligible).toBe(false);
    expect(
      checkEligibility(latam, { ...seeker, country: 'Brazil' }).eligible,
    ).toBe(true);
    // The exact sentence from the Workana posting in the audit.
    const soft = job(
      'Full Stack MERN Developer',
      'This is a long-term remote opportunity for a senior or expert engineer based in Latin America who can work during U.S. West Coast business hours.',
    );
    expect(checkEligibility(soft, seeker).eligible).toBe(false);
    // Mentioning the region is not a restriction.
    expect(
      checkEligibility(
        job(
          'Backend Developer',
          'We have offices in Latin America and Europe.',
        ),
        seeker,
      ).eligible,
    ).toBe(true);
  });

  it('applies to what fits', () => {
    expect(
      checkEligibility(job('Full Stack Developer ( Nest.JS & Next.js)'), seeker)
        .eligible,
    ).toBe(true);
  });

  it('treats one role posted per location as one role (SSC HR x4, Lago x6)', () => {
    expect(
      roleKey(
        'SSC HR Solutions',
        'Senior Java Backend Engineer | Spring Boot.',
      ),
    ).toBe(
      roleKey('SSC HR Solutions', 'Senior Java Backend Engineer | Spring Boot'),
    );
  });
});
