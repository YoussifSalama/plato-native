import { buildQuestionCard } from './intake';
import { JobSeekerSnapshot } from '../discovery/job-seeker-snapshot';

const snapshot = {
  preferredLocations: ['Toronto, Canada', 'remote_us'],
  workSetup: ['remote'],
  visaSponsorshipRequired: true,
  residenceCountry: 'EG',
  employmentStatus: 'employed',
  salary: { min: 3000, currency: 'USD', period: 'MONTHLY' },
} as unknown as JobSeekerSnapshot;

describe('buildQuestionCard', () => {
  const card = buildQuestionCard(
    [
      'residence_country',
      'target_countries',
      'work_setup',
      'visa',
      'min_salary',
    ],
    snapshot,
  );

  it('keeps the agent-chosen order', () => {
    expect(card.questions.map((q) => q.id)).toEqual([
      'residence_country',
      'target_countries',
      'work_setup',
      'visa',
      'min_salary',
    ]);
  });

  it('pre-fills every answer from the profile (the backup)', () => {
    const by = Object.fromEntries(card.questions.map((q) => [q.id, q]));
    expect(by.residence_country.default).toBe('EG');
    expect(by.target_countries.default).toEqual(['CA']);
    expect(by.work_setup.default).toEqual(['remote']);
    expect(by.visa.default).toBe('yes');
    expect(by.min_salary.default).toEqual({
      amount: 3000,
      currency: 'USD',
      period: 'MONTHLY',
    });
  });

  it("offers the seeker's own countries first, as tappable chips", () => {
    const codes = card.questions[0].options!.map((o) => o.value);
    expect(codes.slice(0, 2)).toEqual(['EG', 'CA']);
    expect(card.questions[0].options![0].label).toBe('Egypt');
  });
});
