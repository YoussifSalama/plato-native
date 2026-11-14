import {
  abilityOf,
  catalogue,
  findAssessment,
  itemsOf,
  MATRIX_SETS,
  pooledReasoning,
  scoreAssessment,
} from './assessments';
import type { AssessmentAnswer } from './quiz.contract';

describe('standard assessments', () => {
  it('builds 11 matrix sets from the 219 rated OMIB items plus six IPIP inventories', () => {
    const { list, example } = catalogue();
    const sets = list.filter((a) => a.category === 'reasoning');
    expect(sets).toHaveLength(MATRIX_SETS);
    expect(sets.reduce((n, a) => n + a.matrices!.length, 0)).toBe(219);
    expect(example?.b).toBeNull();
    // every set spans easy to hard, easiest first
    for (const s of sets) {
      const bs = s.matrices!.map((m) => m.b!);
      expect(bs).toEqual([...bs].sort((x, y) => x - y));
      expect(bs[0]).toBeLessThan(-1);
      expect(bs[bs.length - 1]).toBeGreaterThan(0.5);
    }
    const inv = list
      .filter((a) => a.inventory)
      .map((a) => [a.slug, a.inventory!.items.length]);
    expect(inv).toEqual([
      ['big-five', 120],
      ['big-five-quick', 20],
      ['workplace-style', 70],
      ['role-potential', 60],
      ['integrity', 40],
      ['emotional-intelligence', 68],
    ]);
  });

  it('never sends the answer cell or the keys', () => {
    const m = itemsOf(findAssessment('matrix-1')!);
    expect(m.every((i) => i.type === 'matrix' && i.cells.length === 8)).toBe(
      true,
    );
    const l = itemsOf(findAssessment('integrity')!);
    expect(JSON.stringify(l)).not.toMatch(/reverse|scale/);
  });

  it('ability rises with correct answers and is centred for a coin-flip pattern', () => {
    const items = findAssessment('matrix-2')!.matrices!;
    const all = (correct: boolean) =>
      abilityOf(items.map((m) => ({ a: m.a!, b: m.b!, correct })));
    expect(all(true).percentile).toBeGreaterThan(90);
    expect(all(false).percentile).toBeLessThan(10);
    expect(abilityOf([]).percentile).toBe(50);
  });

  it('scores matrices by exact match of the built cell; blanks are wrong', () => {
    const a = findAssessment('matrix-3')!;
    const answers: Record<string, AssessmentAnswer> = {};
    a.matrices!.slice(0, 10).forEach(
      (m) => (answers[m.id] = { type: 'matrix', mask: m.cells[8] }),
    );
    answers[a.matrices![10].id] = { type: 'matrix', mask: '0'.repeat(20) };
    const r = scoreAssessment(a, answers, 600);
    expect(r.reasoning!.correct).toBe(10);
    expect(r.reasoning!.items[10]).toMatchObject({
      correct: false,
      given: '0'.repeat(20),
    });
    expect(r.reasoning!.items[11].given).toBeNull();
    expect(r.headline).toMatch(/^(Top|Better than) \d+%$/);
  });

  it('scores Likert scales with reverse keys and rolls Big Five facets into traits', () => {
    const a = findAssessment('big-five')!;
    const answers: Record<string, AssessmentAnswer> = {};
    // agree with every + item and disagree with every - item: every facet at 100
    for (const it of a.inventory!.items)
      answers[it.id] = { type: 'likert', value: it.reverse ? 1 : 5 };
    const r = scoreAssessment(a, answers, 900);
    expect(r.scales).toHaveLength(30);
    expect(
      r.scales!.every((s) => s.score === 100 && s.band === 'high' && s.about),
    ).toBe(true);
    expect(r.domains!.map((d) => d.name)).toEqual([
      'Neuroticism',
      'Extraversion',
      'Openness',
      'Agreeableness',
      'Conscientiousness',
    ]);
    // all 3s: the middle of the range
    for (const it of a.inventory!.items)
      answers[it.id] = { type: 'likert', value: 3 };
    expect(
      scoreAssessment(a, answers, 900).domains!.every(
        (d) => d.score === 50 && d.band === 'mid',
      ),
    ).toBe(true);
  });

  it('pools reasoning over attempts, newest answer per item first', () => {
    const a = findAssessment('matrix-1')!;
    const right = scoreAssessment(
      a,
      Object.fromEntries(
        a.matrices!.map((m) => [
          m.id,
          { type: 'matrix', mask: m.cells[8] } as AssessmentAnswer,
        ]),
      ),
      1,
    );
    const wrong = scoreAssessment(a, {}, 1);
    expect(pooledReasoning([right, wrong])!.percentile).toBe(
      right.reasoning!.percentile,
    );
    expect(pooledReasoning([wrong, right])!.percentile).toBe(
      wrong.reasoning!.percentile,
    );
    expect(pooledReasoning([])).toBeNull();
  });
});
