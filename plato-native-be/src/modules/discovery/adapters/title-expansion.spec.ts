import { expandTitle } from './title-expansion';

describe('expandTitle', () => {
  it('adds prefix and hyphenated prefix variants for multi-word stems', () => {
    expect(expandTitle('Full Stack Developer')).toEqual([
      'Full Stack Developer',
      'Full Stack:*',
      'Full-Stack:*',
    ]);
  });

  it('adds a plain prefix for single-word stems', () => {
    expect(expandTitle('Backend Engineer')).toEqual([
      'Backend Engineer',
      'Backend:*',
    ]);
  });

  it('leaves titles without a role suffix as-is', () => {
    expect(expandTitle('Product Owner')).toEqual(['Product Owner']);
  });
});
