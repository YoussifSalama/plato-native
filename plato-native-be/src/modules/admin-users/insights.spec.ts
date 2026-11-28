import { retentionDays } from '../error-log/error-log.service';
import { change, previousRange } from './admin-insights.service';
import { clearMemo, memo } from './memo';

describe('dashboard comparisons', () => {
  it('the previous period is the same length, just before', () => {
    const p = previousRange({
      from: new Date('2026-11-10T00:00:00Z'),
      to: new Date('2026-11-20T00:00:00Z'),
    });
    expect([p.from.toISOString(), p.to.toISOString()]).toEqual([
      '2026-10-31T00:00:00.000Z',
      '2026-11-10T00:00:00.000Z',
    ]);
  });
  it('change as a fraction; null with nothing to compare', () => {
    expect(change(112, 100)).toBe(0.12);
    expect(change(50, 100)).toBe(-0.5);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

describe('memo', () => {
  afterEach(clearMemo);
  it('answers the same key from memory within the minute, and retries after a failure', async () => {
    const f = jest.fn().mockResolvedValue(1);
    await memo('k', f);
    await memo('k', f);
    expect(f).toHaveBeenCalledTimes(1);
    const bad = jest
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue(2);
    await expect(memo('b', bad)).rejects.toThrow('db');
    await new Promise((r) => setImmediate(r));
    await expect(memo('b', bad)).resolves.toBe(2);
  });
});

describe('error log retention', () => {
  it.each([
    [undefined, 90],
    ['', 90],
    ['30', 30],
    ['0', 0],
    ['nonsense', 90],
    ['-5', 90],
  ])('%s -> %s days', (env, days) => expect(retentionDays(env)).toBe(days));
});
