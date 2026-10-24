import { readFileSync } from 'fs';
import { join } from 'path';
import { assertLegacy } from './engine-guard';

// apply.service can't be loaded under jest (ESM deps), so check the source:
// every legacy action on an existing row must go through the engine guard.
describe('legacy endpoints vs extension rows', () => {
  const src = readFileSync(join(__dirname, 'apply.service.ts'), 'utf8');
  const body = (name: string) => {
    const i = src.indexOf(`  async ${name}(`);
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n  }\n', i));
  };
  it.each([
    'retry',
    'withdraw',
    'markSubmitted',
    'continueVerification',
    'provideAnswers',
  ])('%s guards extension-owned rows', (fn) => {
    expect(body(fn)).toMatch(/ownLegacy\(|assertLegacy\(/);
  });

  it('throws for extension rows only', () => {
    expect(() => assertLegacy({ engine: 'EXTENSION' })).toThrow('extension');
    expect(() => assertLegacy({ status: 'EXTENSION_ACTIVE' })).toThrow();
    expect(() =>
      assertLegacy({ engine: null, status: 'FAILED' }),
    ).not.toThrow();
  });
});
