import { describe, expect, it } from 'vitest';
import { cell, toCsv } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell('two\nlines')).toBe('"two\nlines"');
    expect(cell(null)).toBe('');
    expect(cell(12.5)).toBe('12.5');
  });
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('-12.5')).toBe('-12.5');
    expect(cell('@cmd')).toBe("'@cmd");
  });
  it('starts with a BOM so Excel reads Arabic names', () => {
    const csv = toCsv([{ n: 'منى', c: 1 }], [['Name', (r) => r.n], ['Cost', (r) => r.c]]);
    expect(csv.startsWith('﻿Name,Cost\r\n')).toBe(true);
    expect(csv).toContain('منى,1');
  });
});
