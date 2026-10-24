import { aggregate, skillsIn } from './skills-gap';

it('finds vocabulary skills by whole word and alias', () => {
  const s = skillsIn(
    'We use PowerBI, Node.js and C++. Javascripty is not a skill; Java is.',
  );
  expect(s).toEqual(
    expect.arrayContaining(['Power BI', 'Node.js', 'C++', 'Java']),
  );
  expect(s).not.toContain('JavaScript');
});

it('counts missing jobs and the ones a single skill unlocks', () => {
  const r = aggregate([['SQL'], ['SQL', 'Tableau'], ['Tableau'], []]);
  expect(r).toEqual([
    { skill: 'SQL', missingIn: 2, unlocks: 1 },
    { skill: 'Tableau', missingIn: 2, unlocks: 1 },
  ]);
});
