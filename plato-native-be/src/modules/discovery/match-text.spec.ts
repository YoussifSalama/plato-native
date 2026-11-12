import { textWhere } from './match-text';

it('needs every word, each anywhere in the job', () => {
  expect(textWhere(undefined)).toEqual([]);
  expect(textWhere('   ')).toEqual([]);
  const w = textWhere('  React   Cairo ');
  expect(w).toHaveLength(2);
  expect(w[0]).toEqual({
    OR: [
      { title: { contains: 'React', mode: 'insensitive' } },
      { company: { contains: 'React', mode: 'insensitive' } },
      { location: { contains: 'React', mode: 'insensitive' } },
      { description: { contains: 'React', mode: 'insensitive' } },
    ],
  });
});
