import type { ApiItem } from './types';
import type { SessionStep } from '../panel/view';

// The batch: which items this panel is applying to right now, and what became of each. One batch at a time,
// at most MAX_BATCH_JOBS jobs. The guards live HERE (start throws), not in the buttons that call it.
// Persisted in chrome.storage.session by the caller's store: a reloaded panel picks the batch back up; a browser
// restart loses it (the server's lease sweep then settles the open items; see docs/REDESIGN_SPEC_2026-10-29.md §9.3).
// The server lists only items that still need attention, so terminal outcomes are recorded here when this panel
// causes them; an item that vanishes without a recorded outcome is "gone" (settled elsewhere).
export const MAX_BATCH_JOBS = 10;

export type OutcomeKind = 'submitted' | 'failed' | 'skipped' | 'cancelled' | 'gone';
export interface Outcome {
  kind: OutcomeKind;
  note: string;
  at: number;
  ms?: number; // how long the job ran (start to outcome), for the estimate
}
export interface JobMeta {
  jobId: string;
  title: string;
  company: string;
  provider: string | null;
}
export interface BatchRun {
  id: string;
  label: string;
  itemIds: string[];
  meta: Record<string, JobMeta>; // the job behind each item, kept so finished rows still have a name
  autoSubmit: boolean;
  startedAt: number;
  finishedAt: number | null;
  status: 'running' | 'finished';
  started: Record<string, number>; // item id -> when this panel opened it
  outcomes: Record<string, Outcome>;
}
export class BatchError extends Error {
  constructor(
    public code: 'active' | 'cap' | 'empty' | 'dup',
    message: string,
  ) {
    super(message);
  }
}

export type RowStatus = 'queued' | 'running' | 'needs' | 'verify' | 'interrupted' | 'elsewhere' | OutcomeKind;
export interface Row {
  itemId: string;
  meta: JobMeta;
  status: RowStatus;
  item?: ApiItem; // the server's view, while it still lists the item
  outcome?: Outcome;
  startedAt?: number;
}
/** What this panel knows beyond the server: which items it holds a session for, and whose tab is still open. */
export interface Live {
  sessions: Record<string, { step: SessionStep; message?: string } | undefined>;
  tabsAlive: Set<string>;
}
export interface RunStore {
  get(): Promise<BatchRun | null>;
  set(run: BatchRun | null): Promise<void>;
}

const OPEN: RowStatus[] = ['queued', 'running', 'needs', 'interrupted', 'elsewhere'];

/** The selection before a batch exists: toggling past the cap is refused (false), never silently truncated. */
export function pickToggle<K extends string>(picked: K[], key: K, max = MAX_BATCH_JOBS): { picked: K[]; refused: boolean } {
  if (picked.includes(key)) return { picked: picked.filter((k) => k !== key), refused: false };
  if (picked.length >= max) return { picked, refused: true };
  return { picked: [...picked, key], refused: false };
}

export function createBatchRunner(store: RunStore, now: () => number = () => Date.now()) {
  let run: BatchRun | null = null;
  const save = () => store.set(run).catch(() => undefined);

  function rowStatus(id: string, items: ApiItem[], live: Live, autoSubmit: boolean): Pick<Row, 'status' | 'item' | 'outcome'> {
    const outcome = run!.outcomes[id];
    if (outcome) return { status: outcome.kind, outcome };
    const item = items.find((i) => i.id === id);
    if (!item) return { status: 'gone' };
    const sess = live.sessions[id];
    if (item.mine === false) return { status: 'elsewhere', item };
    if (item.state === 'PENDING') return { status: 'queued', item };
    if (item.state === 'VERIFY') return { status: 'verify', item };
    if (!sess) return { status: 'interrupted', item }; // open on the server, not in this panel: a reload or a lost tab
    if (item.state === 'NEEDS_USER' || sess.step === 'needs-user') return { status: 'needs', item };
    if (item.state === 'AWAITING_SUBMIT') return { status: autoSubmit && sess.message !== 'submit_failed' ? 'running' : 'needs', item }; // the person presses Submit, or Plato could not
    return { status: 'running', item };
  }

  const api = {
    current: () => run,
    async restore() {
      run = await store.get().catch(() => null);
      return run;
    },
    isActive: () => !!run && run.status === 'running',
    /** Refused while a batch is active, above the cap, empty, or with a repeated job. */
    start(items: { itemId: string; meta: JobMeta }[], label: string, autoSubmit: boolean): BatchRun {
      if (run && run.status === 'running') {
        const left = run.itemIds.filter((id) => !run!.outcomes[id]).length;
        throw new BatchError('active', `A batch is already running (${left} of ${run.itemIds.length} still to go). Wait for it to finish.`);
      }
      if (!items.length) throw new BatchError('empty', 'Pick at least one job.');
      if (items.length > MAX_BATCH_JOBS) throw new BatchError('cap', `A batch holds at most ${MAX_BATCH_JOBS} jobs.`);
      if (new Set(items.map((i) => i.itemId)).size !== items.length || new Set(items.map((i) => i.meta.jobId)).size !== items.length) throw new BatchError('dup', 'A job can only be in a batch once.');
      run = { id: `run-${now().toString(36)}`, label, itemIds: items.map((i) => i.itemId), meta: Object.fromEntries(items.map((i) => [i.itemId, i.meta])), autoSubmit, startedAt: now(), finishedAt: null, status: 'running', started: {}, outcomes: {} };
      void save();
      return run;
    },
    /**
     * The batch record is gone (a browser restart) but the server still lists open items: show them as the batch,
     * so nothing runs unseen. No guards: this is what already exists, not a new batch.
     */
    adopt(items: { itemId: string; meta: JobMeta }[], label: string, autoSubmit: boolean): BatchRun | null {
      if (run || !items.length) return run;
      run = { id: `run-${now().toString(36)}`, label, itemIds: items.map((i) => i.itemId), meta: Object.fromEntries(items.map((i) => [i.itemId, i.meta])), autoSubmit, startedAt: now(), finishedAt: null, status: 'running', started: {}, outcomes: {} };
      void save();
      return run;
    },
    has: (id: string) => !!run && run.itemIds.includes(id),
    markStarted(id: string) {
      if (!run || !run.itemIds.includes(id) || run.started[id]) return;
      run.started[id] = now();
      void save();
    },
    /** An outcome this panel caused (or saw). The first one wins: an item never changes its mind. */
    record(id: string, kind: OutcomeKind, note: string) {
      if (!run || !run.itemIds.includes(id) || run.outcomes[id]) return;
      const st = run.started[id];
      run.outcomes[id] = { kind, note: note.slice(0, 300), at: now(), ...(st && { ms: now() - st }) };
      void save();
    },
    /** Every row of the batch from what the server lists now and what this panel holds. Pure. */
    rows(items: ApiItem[], live: Live): Row[] {
      if (!run) return [];
      return run.itemIds.map((id) => ({ itemId: id, meta: run!.meta[id]!, startedAt: run!.started[id], ...rowStatus(id, items, live, run!.autoSubmit) }));
    },
    /**
     * After every refresh: an item the server no longer lists and this panel never settled is "gone"; the batch is
     * finished once no row is open. A row waiting for the person's word (VERIFY) does not hold the batch open.
     */
    settle(items: ApiItem[], live: Live): Row[] {
      if (!run) return [];
      for (const id of run.itemIds) if (!run.outcomes[id] && !items.some((i) => i.id === id)) api.record(id, 'gone', 'Settled outside this panel (another browser, or the Plato web app).');
      const rows = api.rows(items, live);
      if (run.status === 'running' && !rows.some((r) => OPEN.includes(r.status))) {
        run.status = 'finished';
        run.finishedAt = now();
        void save();
      }
      return rows;
    },
    /** The queued rows' ids: what "Stop batch" asks the server to drop. */
    queued: (rows: Row[]) => rows.filter((r) => r.status === 'queued').map((r) => r.itemId),
    /** The estimate: the median of this batch's finished runs, over what is still queued or running, `slots` at a time. */
    eta(rows: Row[], slots: number): { ms: number; basis: number } | 'first' | null {
      const done = rows.flatMap((r) => (r.outcome?.ms && r.outcome.kind !== 'cancelled' && r.outcome.kind !== 'gone' ? [r.outcome.ms] : [])).sort((a, b) => a - b);
      const left = rows.filter((r) => r.status === 'queued' || r.status === 'running');
      if (!left.length) return null;
      if (!done.length) return 'first';
      const median = done[Math.floor(done.length / 2)]!;
      const t = now();
      const running = left.filter((r) => r.status === 'running').map((r) => Math.max(0, median - (t - (r.startedAt ?? t))));
      const queued = left.length - running.length;
      return { ms: Math.max(0, ...running) + Math.ceil(queued / Math.max(1, slots)) * median, basis: done.length };
    },
    clear() {
      run = null;
      void save();
    },
  };
  return api;
}
export type BatchRunner = ReturnType<typeof createBatchRunner>;
