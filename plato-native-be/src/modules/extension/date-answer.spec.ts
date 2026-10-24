import { dateAnswer } from './answers.service';

const today = new Date('2026-10-23T12:00:00Z');
const q = (label: string, type: 'text' | 'date' = 'text') => ({ id: 'x', label, type, required: true }) as Parameters<typeof dateAnswer>[0];
const c = (availability: string | null) => ({ preferences: { availability } });

describe('dateAnswer: a start date from the onboarding availability, no AI', () => {
  it('formats by the label pattern, mm/dd/yyyy by default', () => {
    expect(dateAnswer(q('When Are You Available To Start? (mm/dd/yyyy)'), c('immediately'), today)).toBe('10/23/2026');
    expect(dateAnswer(q('Earliest start date (dd/mm/yyyy)'), c('two_weeks'), today)).toBe('06/11/2026');
    expect(dateAnswer(q('Start date'), c('one_month'), today)).toBe('11/22/2026');
    expect(dateAnswer(q('Available from', 'date'), c('three_plus_months'), today)).toBe('2027-01-21');
  });
  it('a signature "Date" is today; a model value that is a word is replaced, a real date is kept', () => {
    expect(dateAnswer(q('Date'), c(null), today)).toBe('10/23/2026');
    expect(dateAnswer(q('When Are You Available To Start? (mm/dd/yyyy)'), c('immediately'), today, 'immediately')).toBe('10/23/2026');
    expect(dateAnswer(q('When Are You Available To Start? (mm/dd/yyyy)'), c('immediately'), today, '11/01/2026')).toBeNull();
  });
  it('never a date of birth, never without an availability, never for an unrelated field', () => {
    expect(dateAnswer(q('Date of birth', 'date'), c('immediately'), today)).toBeNull();
    expect(dateAnswer(q('Start date'), c(null), today)).toBeNull();
    expect(dateAnswer(q('Desired salary'), c('immediately'), today)).toBeNull();
  });
});
