import { cefrOf, languageOption, mapAnswers } from './answer-mapper';
import { Candidate, FormField, FormSchema } from './apply.types';
import { validateAnswers } from './validate-answers';

// The first real Lever dry run (MasterBorn, Middle Backend Developer). The
// questions and options below are copied from that form. Before these rules
// a model answered Polish "C1" for someone who doesn't speak Polish, and
// guessed "Search Engine".

const seeker: Candidate = {
  fullName: 'Youssif Salama',
  firstName: 'Youssif',
  lastName: 'Salama',
  email: 'y@example.com',
  phone: '+201001234567',
  location: 'Cairo, Egypt',
  country: 'Egypt',
  headline: 'Backend Developer',
  currentCompany: 'Plato',
  summary: '',
  skills: ['Node.js'],
  links: {},
  preferences: {
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    availability: 'one_month',
    yearsExperience: null,
    willingToRelocate: false,
    visaSponsorshipRequired: false,
    workAuthorization: ['Egypt'],
    autoApplyConsent: false,
  },
  languages: [
    { language: 'Arabic', proficiency: 'Native' },
    { language: 'English', proficiency: 'Professional' },
  ],
  certifications: [],
  hasResume: true,
  totalYears: 3,
  facts: {},
  experiences: [],
  educations: [],
  answerBank: {},
};

const choice = (id: string, label: string, options: string[]): FormField => ({
  id,
  label,
  type: 'choice',
  required: true,
  options,
});
const form: FormSchema = {
  source: 'LEVER',
  applyUrl: 'https://jobs.lever.co/masterborn-2/x/apply',
  fields: [
    {
      id: 'city',
      label: 'Where are you currently located? Specify the city:',
      type: 'paragraph',
      required: true,
    },
    choice('heard', 'How did you hear about us?', [
      'Search Engine (e.g. Google)',
      'NoFluffJobs',
      'JustJoinIT',
      'LinkedIn',
      'Facebook',
      'Word of mouth',
      'MasterBorn Website',
      'Friends',
      'Other',
    ]),
    {
      id: 'notice',
      label: 'When are you ready to start? What is your notice period?',
      type: 'paragraph',
      required: true,
    },
    choice(
      'gdpr',
      'I agree that my personal data will be processed by MasterBorn in order to take part in the recruitment process (Please note that if you mark "no", your application will be rejected)',
      ['Yes', 'No'],
    ),
    choice('pl', 'What is your Polish language level?', [
      'C2 / native',
      'C1',
      'B2',
      'B1 or lower',
    ]),
    choice('en', 'What is your English language level?', [
      'C1 or higher',
      'B2',
      'B1 or lower',
    ]),
    choice(
      'mkt',
      'By providing your e-mail address you give a consent to its use for direct e-mail marketing',
      ["Sure, I'm in!", 'No, thanks'],
    ),
  ],
};

describe('Lever: MasterBorn form, answered from facts and rules only', () => {
  const { answers, questions } = mapAnswers(form, seeker);

  it('needs no model and leaves nothing unanswered', () => {
    expect(questions).toEqual([]);
    expect(validateAnswers(form, answers)).toEqual([]);
  });

  it('never claims a language the profile does not list', () => {
    expect(answers.pl).toBe('B1 or lower');
  });

  it("maps the profile's English wording onto the form's buckets", () => {
    expect(answers.en).toBe('B2');
    expect(
      mapAnswers(form, {
        ...seeker,
        languages: [{ language: 'English', proficiency: 'Fluent' }],
      }).answers.en,
    ).toBe('C1 or higher');
    expect(
      mapAnswers(form, {
        ...seeker,
        languages: [{ language: 'English', proficiency: 'Intermediate' }],
      }).answers.en,
    ).toBe('B1 or lower');
  });

  it('says how the posting was really found', () => {
    expect(answers.heard).toBe('Other');
  });

  it('agrees to process the application, declines marketing', () => {
    expect(answers.gdpr).toBe('Yes');
    expect(answers.mkt).toBe('No, thanks');
  });

  it('fills location and notice period from facts', () => {
    expect(answers.city).toBe('Cairo, Egypt');
    expect(answers.notice).toBe('1 month');
  });
});

describe('language helpers', () => {
  it('reads CEFR from common profile wording', () => {
    expect([
      cefrOf('Native'),
      cefrOf('Fluent'),
      cefrOf('Profession'),
      cefrOf('Intermediate'),
      cefrOf('B2 (Upper)'),
      cefrOf(null),
    ]).toEqual(['C2', 'C1', 'B2', 'B1', 'B2', null]);
  });

  it('picks exact, "or higher" and "or lower" buckets; "None" for an unknown language', () => {
    expect(languageOption(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], 'B2')).toBe(
      'B2',
    );
    expect(languageOption(['B2 or higher', 'B1 or lower'], 'C1')).toBe(
      'B2 or higher',
    );
    expect(languageOption(['None', 'Basic', 'Fluent'], null)).toBe('None');
    // No honest option for "don't speak it": stay unanswered rather than guess.
    expect(languageOption(['Fluent', 'Native'], null)).toBeUndefined();
  });
});
