import { v3Summary, type V3ItemInfo, type V3TurnRow } from './v3-summary';

const at = (s: number) => new Date(Date.UTC(2026, 9, 24, 16, 0, s));
const row = (
  item: string,
  model: string,
  turn: number,
  s: number,
  input = 10_000,
  cacheRead = 8_000,
  cost = 0.01,
): V3TurnRow => ({
  model,
  input_tokens: input,
  output_tokens: 200,
  cost_usd: cost,
  meta: { item, turn, cache_read: cacheRead },
  created_at: at(s),
});
const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const items = new Map<string, V3ItemInfo>([
  [
    A,
    {
      state: 'AWAITING_SUBMIT',
      provider: 'lever',
      jobId: 'j1',
      title: 'Engineer',
      company: 'Redbee',
    },
  ],
  [
    B,
    {
      state: 'VERIFY',
      provider: 'lever',
      jobId: 'j1',
      title: 'Engineer',
      company: 'Redbee',
    },
  ],
]);

describe('v3Summary', () => {
  it('groups turns per item and model, with cache hit rate, runs and wall time', () => {
    const rows = [
      row(A, 'claude-sonnet-5-5', 1, 0, 10_000, 0, 0.03),
      row(A, 'claude-sonnet-5-5', 2, 20),
      row(A, 'claude-sonnet-5-5', 1, 50), // the session reopened (backend restart)
      row(B, 'claude-opus-5-5', 1, 0, 10_000, 5_000, 0.05),
    ];
    const r = v3Summary(rows, items);
    const a = r.items.find((l) => l.item === A)!;
    expect(a).toMatchObject({
      model: 'claude-sonnet-5-5',
      runs: 2,
      turns: 3,
      inputTokens: 30_000,
      cacheReadTokens: 16_000,
      cacheHitRate: 0.533,
      outputTokens: 600,
      costUsd: 0.05,
      seconds: 50,
      provider: 'lever',
      state: 'AWAITING_SUBMIT',
      job: { title: 'Engineer', company: 'Redbee' },
    });
    expect(r.totalCostUsd).toBe(0.1);
  });

  it('totals per model and lists a job run on two models side by side', () => {
    const r = v3Summary(
      [
        row(A, 'claude-sonnet-5-5', 1, 0),
        row(A, 'claude-sonnet-5-5', 2, 5),
        row(B, 'claude-opus-5-5', 1, 0, 10_000, 9_000, 0.04),
      ],
      items,
    );
    expect(r.models.find((m) => m.model === 'claude-sonnet-5-5')).toMatchObject(
      {
        items: 1,
        turns: 2,
        avgCostPerItem: 0.02,
        avgTurnsPerItem: 2,
        cacheHitRate: 0.8,
      },
    );
    expect(r.models.find((m) => m.model === 'claude-opus-5-5')).toMatchObject({
      items: 1,
      avgCostPerItem: 0.04,
      cacheHitRate: 0.9,
    });
    expect(r.compare).toHaveLength(1);
    expect(r.compare[0].jobId).toBe('j1');
    expect(r.compare[0].models.map((m) => m.model).sort()).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
  });

  it('the same item on two models is two lines; rows without an item are ignored; unknown items still count', () => {
    const r = v3Summary(
      [
        row(A, 'claude-sonnet-5-5', 1, 0),
        row(A, 'claude-opus-5-5', 1, 0),
        { ...row(A, 'claude-sonnet-5-5', 1, 0), meta: null },
        row('c'.repeat(24), 'claude-sonnet-5-5', 1, 0),
      ],
      items,
    );
    expect(r.items).toHaveLength(3);
    expect(r.items.find((l) => l.item === 'c'.repeat(24))).toMatchObject({
      jobId: null,
      job: null,
      state: null,
    });
    expect(r.compare).toHaveLength(1); // item A: one job, two models
  });

  it('no rows: zeros, no division by zero', () => {
    expect(v3Summary([], items)).toEqual({
      totalCostUsd: 0,
      models: [],
      compare: [],
      items: [],
    });
  });
});
