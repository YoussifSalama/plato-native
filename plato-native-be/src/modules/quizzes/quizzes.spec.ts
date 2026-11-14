import type { Question, Section } from './quiz.contract';
import {
  buildSection,
  pickLibrary,
  roleFamily,
  toDetail,
  toQuestion,
  type QuestionDraft,
} from './quiz-build';
import { fallbackSummary, scoreAttempt, scoreQuestion } from './quiz-scoring';

const draft = (over: Partial<QuestionDraft>): QuestionDraft => ({
  type: 'single_choice',
  scenarioId: null,
  prompt: 'Q?',
  media: [],
  choices: [],
  items: [],
  pick: null,
  scale: null,
  left: null,
  right: null,
  sequence: [],
  correct: [],
  ideal: null,
  order: [],
  preferred: null,
  trait: null,
  explanation: 'Because.',
  ...over,
});
const fig = {
  shapes: [
    {
      shape: 'circle' as const,
      x: 50,
      y: 50,
      size: 20,
      rotation: null,
      fill: 'solid' as const,
    },
  ],
};

describe('scoring, per question type', () => {
  const rating: Question = {
    id: 'r',
    type: 'rating',
    prompt: 'p',
    scale: {
      min: 1,
      max: 4,
      minLabel: 'Ineffective',
      maxLabel: 'Highly effective',
    },
  };
  const ranking: Question = {
    id: 'k',
    type: 'ranking',
    prompt: 'p',
    items: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })),
  };
  const ws: Question = { id: 'w', type: 'work_style', left: 'L', right: 'R' };
  const choice: Question = {
    id: 'c',
    type: 'single_choice',
    prompt: 'p',
    choices: [],
  };
  const multi: Question = {
    id: 'm',
    type: 'multi_choice',
    prompt: 'p',
    choices: [],
  };

  it('single and pattern: right or wrong', () => {
    expect(
      scoreQuestion(
        choice,
        { type: 'single_choice', correct: 'b' },
        { type: 'single_choice', choice: 'b' },
      ),
    ).toBe(1);
    expect(
      scoreQuestion(
        choice,
        { type: 'single_choice', correct: 'b' },
        { type: 'single_choice', choice: 'a' },
      ),
    ).toBe(0);
  });
  it('multi: overlap over union', () => {
    expect(
      scoreQuestion(
        multi,
        { type: 'multi_choice', correct: ['a', 'b'] },
        { type: 'multi_choice', choices: ['a', 'c'] },
      ),
    ).toBeCloseTo(1 / 3);
  });
  it('rating: partial credit by distance on the scale', () => {
    const k = { type: 'rating' as const, ideal: 4 };
    expect(scoreQuestion(rating, k, { type: 'rating', value: 4 })).toBe(1);
    expect(scoreQuestion(rating, k, { type: 'rating', value: 3 })).toBeCloseTo(
      2 / 3,
    );
    expect(scoreQuestion(rating, k, { type: 'rating', value: 1 })).toBe(0);
  });
  it('ranking: by how far each item sits from its place; a full reversal scores 0', () => {
    const k = { type: 'ranking' as const, ideal: ['a', 'b', 'c', 'd'] };
    expect(
      scoreQuestion(ranking, k, {
        type: 'ranking',
        order: ['a', 'b', 'c', 'd'],
      }),
    ).toBe(1);
    expect(
      scoreQuestion(ranking, k, {
        type: 'ranking',
        order: ['b', 'a', 'c', 'd'],
      }),
    ).toBeCloseTo(1 - 2 / 8);
    expect(
      scoreQuestion(ranking, k, {
        type: 'ranking',
        order: ['d', 'c', 'b', 'a'],
      }),
    ).toBe(0);
  });
  it('work style: preferred side most 1, more 0.75; other side more 0.25, most 0; either is always 1', () => {
    const k = {
      type: 'work_style' as const,
      preferred: 'left' as const,
      trait: 'ownership',
    };
    expect(
      scoreQuestion(ws, k, {
        type: 'work_style',
        side: 'left',
        strength: 'most',
      }),
    ).toBe(1);
    expect(
      scoreQuestion(ws, k, {
        type: 'work_style',
        side: 'left',
        strength: 'more',
      }),
    ).toBe(0.75);
    expect(
      scoreQuestion(ws, k, {
        type: 'work_style',
        side: 'right',
        strength: 'more',
      }),
    ).toBe(0.25);
    expect(
      scoreQuestion(ws, k, {
        type: 'work_style',
        side: 'right',
        strength: 'most',
      }),
    ).toBe(0);
    expect(
      scoreQuestion(
        ws,
        { ...k, preferred: 'either' },
        { type: 'work_style', side: 'right', strength: 'most' },
      ),
    ).toBe(1);
  });
  it('a missing or mismatched answer scores 0', () => {
    expect(scoreQuestion(rating, { type: 'rating', ideal: 3 }, null)).toBe(0);
    expect(
      scoreQuestion(
        rating,
        { type: 'rating', ideal: 3 },
        { type: 'single_choice', choice: 'a' },
      ),
    ).toBe(0);
  });
  it('attempt: sections are means x100, the quiz is weighted by question count; unanswered count as 0', () => {
    const sections: Section[] = [
      {
        id: 's1',
        kind: 'technical',
        title: 'Tech',
        instructions: '',
        scenarios: [],
        questions: [choice, { ...choice, id: 'c2' }],
      },
      {
        id: 's2',
        kind: 'work_style',
        title: 'Style',
        instructions: '',
        scenarios: [],
        questions: [ws],
      },
    ];
    const keys = {
      c: {
        key: { type: 'single_choice' as const, correct: 'a' },
        explanation: 'e',
      },
      c2: {
        key: { type: 'single_choice' as const, correct: 'a' },
        explanation: 'e',
      },
      w: {
        key: {
          type: 'work_style' as const,
          preferred: 'left' as const,
          trait: 't',
        },
        explanation: 'e',
      },
    };
    const r = scoreAttempt(sections, keys, {
      c: { type: 'single_choice', choice: 'a' },
      w: { type: 'work_style', side: 'left', strength: 'most' },
    });
    expect(r.sections.map((s) => s.score)).toEqual([50, 100]);
    expect(r.score).toBe(67); // (1 + 0 + 1) / 3
    expect(r.questions.find((q) => q.questionId === 'c2')).toMatchObject({
      score: 0,
      answer: null,
    });
    expect(fallbackSummary(r)).toContain('Tech');
  });
});

describe('validation: drafts that would not work are dropped', () => {
  const ids = new Set<string>();
  it('choice questions need 2+ unique choices and a key that names one of them', () => {
    const ok = draft({
      choices: [
        { id: 'a', text: 'A', figure: null },
        { id: 'b', text: 'B', figure: null },
      ],
      correct: ['b'],
    });
    expect(toQuestion(ok, 'q1', ids)?.key.key).toEqual({
      type: 'single_choice',
      correct: 'b',
    });
    expect(toQuestion({ ...ok, correct: ['z'] }, 'q1', ids)).toBeNull();
    expect(
      toQuestion({ ...ok, choices: [ok.choices[0], ok.choices[0]] }, 'q1', ids),
    ).toBeNull();
    expect(toQuestion({ ...ok, explanation: '' }, 'q1', ids)).toBeNull();
  });
  it('multi choice: "all of them" is no question', () => {
    const m = draft({
      type: 'multi_choice',
      choices: ['a', 'b', 'c'].map((id) => ({ id, text: id, figure: null })),
      correct: ['a', 'b', 'c'],
    });
    expect(toQuestion(m, 'q', ids)).toBeNull();
    expect(
      toQuestion({ ...m, correct: ['a', 'c'] }, 'q', ids)?.question.type,
    ).toBe('multi_choice');
  });
  it('rating ideal must sit on the scale', () => {
    const r = draft({
      type: 'rating',
      scale: { max: 4, minLabel: 'Ineffective', maxLabel: 'Highly effective' },
      ideal: 3,
    });
    expect(toQuestion(r, 'q', ids)?.question).toMatchObject({
      type: 'rating',
      scale: { min: 1, max: 4 },
    });
    expect(toQuestion({ ...r, ideal: 5 }, 'q', ids)).toBeNull();
  });
  it('ranking key must be exactly the items, each once', () => {
    const k = draft({
      type: 'ranking',
      items: ['i1', 'i2', 'i3'].map((id) => ({ id, text: id })),
      order: ['i2', 'i1', 'i3'],
    });
    expect(toQuestion(k, 'q', ids)?.key.key).toEqual({
      type: 'ranking',
      ideal: ['i2', 'i1', 'i3'],
    });
    expect(
      toQuestion({ ...k, order: ['i2', 'i2', 'i3'] }, 'q', ids),
    ).toBeNull();
    expect(toQuestion({ ...k, order: ['i2', 'i1'] }, 'q', ids)).toBeNull();
  });
  it('work style needs two different statements and a preferred side', () => {
    const w = draft({
      type: 'work_style',
      prompt: null,
      left: 'I plan.',
      right: 'I adapt.',
      preferred: 'left',
      trait: 'planning',
    });
    expect(toQuestion(w, 'q', ids)?.question).toEqual({
      id: 'q',
      type: 'work_style',
      left: 'I plan.',
      right: 'I adapt.',
    });
    expect(toQuestion({ ...w, preferred: null }, 'q', ids)).toBeNull();
  });
  it('pattern: a sequence and 3+ drawable choices; bad shapes are clamped or dropped', () => {
    const p = draft({
      type: 'pattern',
      prompt: 'Which comes next?',
      sequence: [fig, fig],
      choices: ['a', 'b', 'c'].map((id) => ({ id, text: null, figure: fig })),
      correct: ['c'],
    });
    const built = toQuestion(p, 'q', ids);
    expect(built?.question.type).toBe('pattern');
    const off = {
      shapes: [
        {
          shape: 'circle' as const,
          x: 400,
          y: -5,
          size: 999,
          rotation: null,
          fill: null,
        },
      ],
    };
    const clamped = toQuestion(
      { ...p, sequence: [off, fig] },
      'q',
      ids,
    )?.question;
    expect(
      clamped && clamped.type === 'pattern' && clamped.sequence[0].shapes[0],
    ).toMatchObject({ x: 100, y: 0, size: 60 });
    expect(toQuestion({ ...p, sequence: [fig] }, 'q', ids)).toBeNull();
  });
});

describe('a written section', () => {
  it('stable ids, scenarios linked, unused and invalid scenarios dropped, empty section = null', () => {
    const plan = {
      kind: 'work_simulation' as const,
      title: 'Work Simulation',
      instructions: 'Rate each response.',
      questionCount: 2,
      timeLimitMin: 12,
    };
    const message = {
      kind: 'message' as const,
      from: 'Lina',
      role: 'Team lead',
      body: 'Can you cover a client call at 3?',
      caption: null,
      columns: [],
      rows: [],
      legend: null,
      title: null,
      chart: null,
      labels: [],
      series: [],
      unit: null,
    };
    const built = buildSection(0, plan, {
      scenarios: [
        {
          id: 'sc1',
          title: 'Covering a call',
          context: [message],
          task: 'Decide what to do.',
        },
        { id: 'sc2', title: 'Unused', context: [message], task: 'x' },
        { id: 'sc3', title: 'No context', context: [], task: 'x' },
      ],
      questions: [
        draft({
          type: 'rating',
          scenarioId: 'sc1',
          scale: {
            max: 4,
            minLabel: 'Ineffective',
            maxLabel: 'Highly effective',
          },
          ideal: 4,
        }),
        draft({
          type: 'rating',
          scenarioId: 'sc1',
          scale: {
            max: 4,
            minLabel: 'Ineffective',
            maxLabel: 'Highly effective',
          },
          ideal: 9,
        }), // invalid
      ],
    });
    expect(built?.section).toMatchObject({
      id: 's1',
      timeLimitSec: 720,
      scenarios: [{ id: 's1-sc1', title: 'Covering a call' }],
      questions: [{ id: 's1-q1', scenarioId: 's1-sc1' }],
    });
    expect(Object.keys(built!.keys)).toEqual(['s1-q1']);
    expect(
      buildSection(1, plan, {
        scenarios: [],
        questions: [draft({ correct: ['x'] })],
      }),
    ).toBeNull();
  });
});

describe('library and mapping', () => {
  it('role family drops level words and aliases common short names', () => {
    expect(roleFamily('Senior Software Development Engineer II')).toBe(
      'software development engineer',
    );
    expect(roleFamily('SDE')).toBe('software development engineer');
    expect(roleFamily('Presales Consultant (Riyadh)')).toBe(
      'presales consultant',
    );
  });
  it('reuses the newest entry for the same company and role family, younger than 60 days', () => {
    const now = Date.UTC(2026, 10, 14);
    const day = 86_400_000;
    const rows = [
      {
        id: 'old',
        company_key: 'amazon',
        role_family: 'sde',
        created_at: new Date(now - 90 * day),
      },
      {
        id: 'new',
        company_key: 'amazon',
        role_family: 'sde',
        created_at: new Date(now - 2 * day),
      },
      {
        id: 'mid',
        company_key: 'amazon',
        role_family: 'sde',
        created_at: new Date(now - 20 * day),
      },
      {
        id: 'other',
        company_key: 'pwc',
        role_family: 'sde',
        created_at: new Date(now - 1 * day),
      },
    ];
    expect(pickLibrary(rows, 'amazon', 'sde', now)?.id).toBe('new');
    expect(pickLibrary(rows.slice(0, 1), 'amazon', 'sde', now)).toBeNull();
  });
  it('the detail never carries keys or explanations', () => {
    const leaked = {
      id: 'q',
      type: 'single_choice',
      prompt: 'p',
      choices: [],
      correct: ['a'],
      explanation: 'secret',
      key: { correct: 'a' },
    } as unknown as Question;
    const detail = toDetail({
      id: 'z',
      title: 'T',
      company: 'Acme',
      role: 'Analyst',
      status: 'ready',
      stage: null,
      about: 'a',
      sources: [],
      sections: [
        {
          id: 's1',
          kind: 'technical',
          title: 'Tech',
          instructions: '',
          scenarios: [],
          questions: [leaked],
        },
      ],
      created_at: new Date(),
    });
    const json = JSON.stringify(detail);
    expect(json).not.toContain('secret');
    expect(json).not.toMatch(/"correct"|"key"|"explanation"/);
    expect(detail).toMatchObject({
      questionCount: 1,
      sections: [{ questions: [{ id: 'q', prompt: 'p' }] }],
    });
  });
});
