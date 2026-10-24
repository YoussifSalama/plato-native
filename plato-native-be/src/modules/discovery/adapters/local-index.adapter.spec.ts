import { titlePattern } from './local-index.adapter';

describe('titlePattern', () => {
  it('matches spacing/hyphen variants of the stem', () => {
    const re = new RegExp(titlePattern('Full Stack Developer'), 'i');
    expect(re.test('Senior Full-Stack Engineer')).toBe(true);
    expect(re.test('Fullstack Developer (React)')).toBe(true);
    expect(re.test('Backend Engineer')).toBe(false);
  });

  it('keeps single-word titles intact', () => {
    expect(
      new RegExp(titlePattern('Backend Engineer'), 'i').test(
        'Backend Developer',
      ),
    ).toBe(true);
  });
});
