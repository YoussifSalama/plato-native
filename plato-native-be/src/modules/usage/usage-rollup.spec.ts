import { lastFinishedDay } from './usage-rollup.service';
import { dayStart } from './tz';
import { mergeGroups, splitForRollup, type UsageGroup } from './usage-stats';

const iso = (r: { from: Date; to: Date }) => [
  r.from.toISOString(),
  r.to.toISOString(),
];

describe('reading from the daily rollup', () => {
  it('whole days up to the last rolled day come from the rollup, the rest raw', () => {
    // 1–10 Nov in Cairo, rolled through 7 Nov: 8–10 Nov are read raw
    const r = { from: dayStart('2026-11-01'), to: dayStart('2026-11-11') };
    const s = splitForRollup(r, '2026-11-07');
    expect(s.rolled).toEqual({ first: '2026-11-01', last: '2026-11-07' });
    expect(s.raw.map(iso)).toEqual([
      [
        dayStart('2026-11-08').toISOString(),
        dayStart('2026-11-11').toISOString(),
      ],
    ]);
  });

  it('a range starting and ending mid-day reads those partial days raw', () => {
    const r = {
      from: new Date(dayStart('2026-11-01').getTime() + 5 * 3600e3),
      to: new Date(dayStart('2026-11-05').getTime() + 3 * 3600e3),
    };
    const s = splitForRollup(r, '2026-11-20');
    expect(s.rolled).toEqual({ first: '2026-11-02', last: '2026-11-04' });
    expect(s.raw.map(iso)).toEqual([
      [r.from.toISOString(), dayStart('2026-11-02').toISOString()],
      [dayStart('2026-11-05').toISOString(), r.to.toISOString()],
    ]);
  });

  it('nothing rolled, or no whole day in range: everything raw', () => {
    const r = { from: dayStart('2026-11-01'), to: dayStart('2026-11-03') };
    expect(splitForRollup(r, null)).toEqual({ rolled: null, raw: [r] });
    expect(splitForRollup(r, '2026-10-20')).toEqual({ rolled: null, raw: [r] });
  });

  it('rows with the same key are added together', () => {
    const g = (o: Partial<UsageGroup>): UsageGroup => ({
      model: 'gpt-4o-mini',
      provider: 'openai',
      costUsd: 1,
      events: 1,
      inputTokens: 10,
      outputTokens: 5,
      ...o,
    });
    const out = mergeGroups(
      [g({ day: 'a' }), g({ day: 'a', costUsd: 2 }), g({ day: 'b' })],
      ['day'],
    );
    expect(out.map((x) => [x.day, x.costUsd, x.events])).toEqual([
      ['a', 3, 2],
      ['b', 1, 1],
    ]);
  });

  it('a day is finished an hour after it ends (Cairo)', () => {
    expect(
      lastFinishedDay(new Date(dayStart('2026-11-28').getTime() + 30 * 60e3)),
    ).toBe('2026-11-26');
    expect(
      lastFinishedDay(new Date(dayStart('2026-11-28').getTime() + 2 * 3600e3)),
    ).toBe('2026-11-27');
  });
});
