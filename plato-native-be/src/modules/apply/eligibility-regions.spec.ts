import { Candidate } from './apply.types';
import { checkEligibility, regionRestrictions } from './eligibility';

const base: Candidate = {
  fullName: 'Y S',
  firstName: 'Y',
  lastName: 'S',
  email: 'y@example.com',
  phone: '+201001234567',
  location: 'Cairo, Egypt',
  country: 'Egypt',
  headline: 'Full Stack Developer',
  currentCompany: '',
  summary: '',
  skills: ['Node.js', 'React'],
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
};
const names = (text: string) => regionRestrictions(text).map((r) => r.name);

describe('region restrictions are recognised by meaning, not by phrase', () => {
  // Every wording from the bug report. The first one is the sentence the old
  // phrase-based rule missed on a real Workana posting.
  it.each([
    'This is a long-term remote opportunity for a senior or expert engineer based in Latin America who can work during U.S. West Coast business hours.',
    'Based in Latin America',
    'For engineers based in Latin America',
    'Candidates must be located in Latin America',
    'Applicants residing in Latin America',
    'This role is open to candidates located in Latin America',
    'You must be located within Latin America',
    'Remote — Latin America',
    'Remote (LATAM)',
    'LATAM only',
    'We are hiring LatAm-based developers only.',
    'Open exclusively to talent living in South America.',
  ])('restricts to Latin America: %s', (text) => {
    expect(names(text)).toContain('Latin America');
    expect(
      checkEligibility(
        { title: 'Full Stack Developer', description: text },
        base,
      ),
    ).toMatchObject({ eligible: false });
    expect(
      checkEligibility(
        { title: 'Full Stack Developer', description: text },
        { ...base, country: 'Brazil' },
      ).eligible,
    ).toBe(true);
  });

  it('reads a restriction in the job title too', () => {
    expect(
      checkEligibility(
        { title: 'Backend Developer (Remote - LATAM)', description: '' },
        base,
      ).eligible,
    ).toBe(false);
  });

  it.each([
    'We have offices in Latin America and Europe.',
    'Our clients are located in Latin America.',
    'You will integrate payment providers used across Latin America.',
    'We are expanding our operations in the United States.',
    'Work during U.S. West Coast business hours.',
    'Experience with the Latin America market is a plus.',
  ])('does not treat a mention as a restriction: %s', (text) => {
    expect(names(text)).toEqual([]);
  });

  it('accepts the seeker when any listed region fits', () => {
    const text = 'Candidates must be based in Latin America or EMEA.';
    expect(names(text).sort()).toEqual(['EMEA', 'Latin America']);
    // Egypt is in EMEA.
    expect(
      checkEligibility({ title: 'Developer', description: text }, base)
        .eligible,
    ).toBe(true);
  });

  it('handles other regions the same way', () => {
    expect(
      checkEligibility(
        { title: 'Developer', description: 'US-based candidates only.' },
        base,
      ).eligible,
    ).toBe(false);
    expect(
      checkEligibility(
        {
          title: 'Developer',
          description: 'Open to applicants located in the Middle East.',
        },
        base,
      ).eligible,
    ).toBe(true);
    expect(
      checkEligibility(
        { title: 'Developer', description: 'You must reside in the UK.' },
        base,
      ).eligible,
    ).toBe(false);
  });

  it('work authorization counts, not just where they live', () => {
    const authorised = {
      ...base,
      preferences: {
        ...base.preferences,
        workAuthorization: ['Egypt', 'United States'],
      },
    };
    expect(
      checkEligibility(
        {
          title: 'Developer',
          description: 'Must be located in the United States.',
        },
        authorised,
      ).eligible,
    ).toBe(true);
  });
});
