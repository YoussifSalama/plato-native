import { current, overall, Turn } from './interview';

const t = (o: Partial<Turn> = {}): Turn => ({
  kind: 'technical',
  question: 'q',
  ...o,
});

it('walks questions and a follow-up in order, then ends', () => {
  expect(current([t(), t()])).toEqual({ index: 0, text: 'q', followUp: false });
  expect(current([t({ answer: 'a', followUp: 'f' }), t()])).toEqual({
    index: 0,
    text: 'f',
    followUp: true,
  });
  expect(
    current([t({ answer: 'a', followUp: 'f', followUpAnswer: 'x' }), t()])
      ?.index,
  ).toBe(1);
  expect(current([t({ answer: 'a' })])).toBeNull();
});

it('overall counts unscored questions as 1 and maps 1..5 to 0..100', () => {
  const card = (qs: number[], comm: number) => ({
    questions: qs.map((score, index) => ({ index, score, feedback: '' })),
    communication: { score: comm, note: '' },
    strengths: [],
    gaps: [],
    nextSteps: [],
  });
  expect(overall(card([5, 5], 5), 2)).toBe(100);
  expect(overall(card([1, 1], 1), 2)).toBe(0);
  expect(overall(card([5], 5), 2)).toBe(75);
});
