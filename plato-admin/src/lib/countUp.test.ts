import { describe, expect, it } from 'vitest';
import { easeOutQuart, formatCountable, parseCountable } from './countUp';

describe('parseCountable', () => {
  it.each([
    ['1,612', { to: 1612, prefix: '', suffix: '', decimals: 0 }],
    ['$93.53', { to: 93.53, prefix: '$', suffix: '', decimals: 2 }],
    ['-$4.20', { to: -4.2, prefix: '$', suffix: '', decimals: 2 }],
    ['21%', { to: 21, prefix: '', suffix: '%', decimals: 0 }],
    ['10,465.3', { to: 10465.3, prefix: '', suffix: '', decimals: 1 }],
    [42, { to: 42, prefix: '', suffix: '', decimals: 0 }],
  ])('%s', (v, want) => expect(parseCountable(v)).toEqual(want));

  it.each(['80 / 56 / 61', '—', 'max', '', '1,2,3', NaN, null])('leaves %s alone', (v) => expect(parseCountable(v)).toBeNull());
});

describe('formatCountable', () => {
  it('writes a value the way the original was written', () => {
    expect(formatCountable(1234.5, parseCountable('$93.53')!)).toBe('$1,234.50');
    expect(formatCountable(-4.2, parseCountable('-$4.20')!)).toBe('-$4.20');
    expect(formatCountable(7, parseCountable('21%')!)).toBe('7%');
    expect(formatCountable(1611.6, parseCountable('1,612')!)).toBe('1,612');
  });
  it('the easing starts at 0 and lands on 1', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
    // a frame stamped before the start never runs the number backwards
    expect(easeOutQuart(-0.05)).toBe(0);
    expect(easeOutQuart(1.2)).toBe(1);
  });
});
