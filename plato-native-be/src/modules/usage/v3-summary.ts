// Engine v3 cost per application, from the `extension.v3.turn` usage rows (one row per Claude turn, written by
// v3-session.service.ts bill(): model, input tokens incl. cache, output tokens, cost, meta { item, turn, cache_read }).
// Pure: the controller loads the rows and the items, this groups them. Read-only by design.

export interface V3TurnRow {
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  meta: unknown;
  created_at: Date;
}
export interface V3ItemInfo {
  state: string;
  provider: string | null;
  jobId: string;
  title: string | null;
  company: string | null;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const rate = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 1000) / 1000 : 0;

// One line per (item, model): the same item run again on another model (V3_MODEL switched) is a separate line,
// so Sonnet and Opus on the same page sit side by side.
export function v3Summary(rows: V3TurnRow[], items: Map<string, V3ItemInfo>) {
  const lines = new Map<
    string,
    {
      item: string;
      model: string;
      runs: number;
      turns: number;
      inputTokens: number;
      cacheReadTokens: number;
      outputTokens: number;
      costUsd: number;
      first: Date;
      last: Date;
    }
  >();
  for (const r of rows) {
    const meta = (r.meta ?? {}) as {
      item?: unknown;
      turn?: unknown;
      cache_read?: unknown;
    };
    if (typeof meta.item !== 'string') continue;
    const model = r.model ?? 'unknown';
    const key = `${meta.item}|${model}`;
    const l = lines.get(key) ?? {
      item: meta.item,
      model,
      runs: 0,
      turns: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      first: r.created_at,
      last: r.created_at,
    };
    if (meta.turn === 1) l.runs++; // a session (re)opened: a backend restart or a fresh start counts turns from 1 again
    l.turns++;
    l.inputTokens += r.input_tokens;
    l.cacheReadTokens +=
      typeof meta.cache_read === 'number' ? meta.cache_read : 0;
    l.outputTokens += r.output_tokens;
    l.costUsd += r.cost_usd ?? 0;
    if (r.created_at < l.first) l.first = r.created_at;
    if (r.created_at > l.last) l.last = r.created_at;
    lines.set(key, l);
  }
  const perItem = [...lines.values()]
    .map((l) => {
      const info = items.get(l.item);
      return {
        item: l.item,
        model: l.model,
        jobId: info?.jobId ?? null,
        job: info ? { title: info.title, company: info.company } : null,
        provider: info?.provider ?? null,
        state: info?.state ?? null,
        runs: Math.max(l.runs, 1),
        turns: l.turns,
        inputTokens: l.inputTokens,
        cacheReadTokens: l.cacheReadTokens,
        cacheHitRate: rate(l.cacheReadTokens, l.inputTokens),
        outputTokens: l.outputTokens,
        costUsd: round(l.costUsd),
        seconds: Math.round((l.last.getTime() - l.first.getTime()) / 1000), // first to last turn; excludes the final page work
        at: l.last,
      };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const byModel = new Map<
    string,
    {
      model: string;
      items: number;
      turns: number;
      inputTokens: number;
      cacheReadTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >();
  for (const l of perItem) {
    const m = byModel.get(l.model) ?? {
      model: l.model,
      items: 0,
      turns: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    m.items++;
    m.turns += l.turns;
    m.inputTokens += l.inputTokens;
    m.cacheReadTokens += l.cacheReadTokens;
    m.outputTokens += l.outputTokens;
    m.costUsd += l.costUsd;
    byModel.set(l.model, m);
  }
  const models = [...byModel.values()].map((m) => ({
    ...m,
    costUsd: round(m.costUsd),
    cacheHitRate: rate(m.cacheReadTokens, m.inputTokens),
    avgCostPerItem: round(m.costUsd / m.items),
    avgTurnsPerItem: Math.round((m.turns / m.items) * 10) / 10,
  }));

  // The same job run on more than one model: the Phase 4 comparison, page by page.
  const byJob = new Map<string, typeof perItem>();
  for (const l of perItem)
    if (l.jobId) byJob.set(l.jobId, [...(byJob.get(l.jobId) ?? []), l]);
  const compare = [...byJob.entries()]
    .filter(([, ls]) => new Set(ls.map((l) => l.model)).size > 1)
    .map(([jobId, ls]) => ({
      jobId,
      job: ls[0].job,
      provider: ls[0].provider,
      models: ls.map((l) => ({
        model: l.model,
        item: l.item,
        state: l.state,
        turns: l.turns,
        costUsd: l.costUsd,
        cacheHitRate: l.cacheHitRate,
        seconds: l.seconds,
      })),
    }));

  return {
    totalCostUsd: round(perItem.reduce((s, l) => s + l.costUsd, 0)),
    models,
    compare,
    items: perItem,
  };
}
