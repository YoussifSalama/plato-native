import { dayStart, nextDay, tzDay, weekOf } from './tz';
import { daysOf, parseRange } from './usage-stats';

describe('admin calendar (Africa/Cairo)', () => {
  it('a day starts at Cairo midnight: UTC+2 in winter, UTC+3 in summer time', () => {
    expect(dayStart('2026-11-28', 'Africa/Cairo').toISOString()).toBe(
      '2026-11-27T22:00:00.000Z',
    );
    expect(dayStart('2026-07-15', 'Africa/Cairo').toISOString()).toBe(
      '2026-07-14T21:00:00.000Z',
    );
  });
  it('an instant is filed under the Cairo day', () => {
    expect(tzDay(new Date('2026-11-27T22:30:00Z'), 'Africa/Cairo')).toBe(
      '2026-11-28',
    );
    expect(tzDay(new Date('2026-11-27T21:59:00Z'), 'Africa/Cairo')).toBe(
      '2026-11-27',
    );
  });
  it('a bare-date range covers whole Cairo days, and daysOf lists them', () => {
    const r = parseRange('2026-11-01', '2026-11-03');
    expect(r.from.toISOString()).toBe('2026-10-31T22:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-11-03T22:00:00.000Z');
    expect(daysOf(r)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
  it('day arithmetic', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(weekOf('2026-11-28')).toBe('2026-11-23'); // a Saturday -> its Monday
  });
});
