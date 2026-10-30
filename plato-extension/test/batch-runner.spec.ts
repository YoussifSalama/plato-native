import { describe, expect, it } from 'vitest';
import { BatchError, createBatchRunner, MAX_BATCH_JOBS, pickToggle, type BatchRun, type Live } from '../src/core/batch-runner';
import type { ApiItem, ItemState } from '../src/core/types';

const item = (id: string, state: ItemState, over: Partial<ApiItem> = {}): ApiItem => ({ id, batch_id: 'b', job_id: 'j' + id, provider: 'fx', state, attempt_id: state === 'PENDING' ? null : 'a', seq: 0, lease_expires_at: null, detail: null, verify_reason: null, job: { title: 'Engineer ' + id, company: 'Acme', url: 'https://fx.test/' + id }, ...over });
const pick = (ids: string[]) => ids.map((id) => ({ itemId: id, meta: { jobId: 'j' + id, title: 'Engineer ' + id, company: 'Acme', provider: 'fx' } }));
const mem = () => {
  let saved: BatchRun | null = null;
  return { store: { get: async () => saved, set: async (r: BatchRun | null) => void (saved = r ? JSON.parse(JSON.stringify(r)) : null) }, saved: () => saved };
};
const quiet: Live = { sessions: {}, tabsAlive: new Set() };
let t = 1_000_000;
const clock = () => t;

describe('pickToggle: the selection before a batch exists', () => {
  it('adds, removes, and refuses the 11th instead of truncating', () => {
    expect(pickToggle(['a'], 'b')).toEqual({ picked: ['a', 'b'], refused: false });
    expect(pickToggle(['a', 'b'], 'a')).toEqual({ picked: ['b'], refused: false });
    const full = Array.from({ length: MAX_BATCH_JOBS }, (_, i) => `k${i}`);
    expect(pickToggle(full, 'extra')).toEqual({ picked: full, refused: true });
    expect(pickToggle(full, 'k3').picked).toHaveLength(MAX_BATCH_JOBS - 1); // removing from a full batch always works
  });
});

describe('start: the guards live in the runner, not in the buttons', () => {
  it('refuses a second batch while one is running, with how much is left', () => {
    const r = createBatchRunner(mem().store, clock);
    r.start(pick(['1', '2', '3']), 'Frontend', true);
    r.record('1', 'submitted', 'ok');
    expect(() => r.start(pick(['4']), 'x', true)).toThrow(BatchError);
    try {
      r.start(pick(['4']), 'x', true);
    } catch (e) {
      expect((e as BatchError).code).toBe('active');
      expect((e as BatchError).message).toContain('2 of 3');
    }
  });
  it('refuses more than the cap, nothing, and a repeated job', () => {
    const r = createBatchRunner(mem().store, clock);
    expect(() => r.start(pick(Array.from({ length: MAX_BATCH_JOBS + 1 }, (_, i) => String(i))), 'x', true)).toThrow(/at most 10/);
    expect(() => r.start([], 'x', true)).toThrow(/at least one/);
    expect(() => r.start([...pick(['1']), { itemId: '2', meta: { jobId: 'j1', title: '', company: '', provider: null } }], 'x', true)).toThrow(/only be in a batch once/);
    expect(r.current()).toBeNull();
  });
  it('a finished batch no longer blocks; a new one may start, and clear() removes the record', async () => {
    const m = mem();
    const r = createBatchRunner(m.store, clock);
    r.start(pick(['1']), 'x', true);
    r.record('1', 'failed', 'no');
    r.settle([], quiet);
    expect(r.isActive()).toBe(false);
    expect(r.current()?.status).toBe('finished');
    const next = r.start(pick(['2']), 'y', true);
    expect(next.itemIds).toEqual(['2']);
    r.clear();
    await Promise.resolve();
    expect(m.saved()).toBeNull();
  });
});

describe('rows and settle: the batch seen through the server list and what this panel holds', () => {
  const live = (sessions: Live['sessions'], tabs: string[] = []): Live => ({ sessions, tabsAlive: new Set(tabs) });
  it('maps every server state and session step to one of the seeker-facing statuses', () => {
    const r = createBatchRunner(mem().store, clock);
    r.start(pick(['p', 'c', 'n', 'a', 'v', 'e', 'i', 'g']), 'x', true);
    const items = [item('p', 'PENDING'), item('c', 'FILLING'), item('n', 'NEEDS_USER'), item('a', 'AWAITING_SUBMIT'), item('v', 'VERIFY'), item('e', 'CLAIMED', { mine: false }), item('i', 'REVIEW')];
    const rows = r.rows(items, live({ c: { step: 'review' }, n: { step: 'needs-user' }, a: { step: 'armed' } }));
    expect(Object.fromEntries(rows.map((x) => [x.itemId, x.status]))).toEqual({ p: 'queued', c: 'running', n: 'needs', a: 'running', v: 'verify', e: 'elsewhere', i: 'interrupted', g: 'gone' });
  });
  it('an armed item is "needs you" when the person presses Submit (auto-submit off) or when Plato could not press it', () => {
    const r = createBatchRunner(mem().store, clock);
    r.start(pick(['a', 'b']), 'x', false);
    const rows = r.rows([item('a', 'AWAITING_SUBMIT'), item('b', 'AWAITING_SUBMIT')], live({ a: { step: 'armed' }, b: { step: 'armed', message: 'submit_failed' } }));
    expect(rows.map((x) => x.status)).toEqual(['needs', 'needs']);
  });
  it('a recorded outcome wins over anything the server says; the first record sticks', () => {
    const r = createBatchRunner(mem().store, clock);
    r.start(pick(['1']), 'x', true);
    r.markStarted('1');
    t += 42_000;
    r.record('1', 'submitted', 'The page confirmed it.');
    r.record('1', 'failed', 'later nonsense');
    const [row] = r.rows([item('1', 'FILLING')], live({ 1: { step: 'review' } }));
    expect(row).toMatchObject({ status: 'submitted', outcome: { kind: 'submitted', ms: 42_000 } });
  });
  it('settle: an item the server dropped without this panel recording anything is "gone"; VERIFY does not hold the batch open; it finishes when nothing is open', () => {
    const m = mem();
    const r = createBatchRunner(m.store, clock);
    r.start(pick(['1', '2', '3']), 'x', true);
    r.record('1', 'submitted', 'ok');
    let rows = r.settle([item('2', 'VERIFY'), item('3', 'FILLING')], live({ 3: { step: 'review' } }));
    expect(rows.map((x) => x.status)).toEqual(['submitted', 'verify', 'running']);
    expect(r.isActive()).toBe(true);
    rows = r.settle([item('2', 'VERIFY')], quiet); // 3 vanished: settled elsewhere
    expect(rows.map((x) => x.status)).toEqual(['submitted', 'verify', 'gone']);
    expect(r.current()?.status).toBe('finished');
    expect(r.isActive()).toBe(false);
  });
  it('an item the server put back to PENDING (lease lost) is queued again, never counted as finished', () => {
    const r = createBatchRunner(mem().store, clock);
    r.start(pick(['1']), 'x', true);
    r.markStarted('1');
    const rows = r.settle([item('1', 'PENDING')], quiet);
    expect(rows[0]!.status).toBe('queued');
    expect(r.isActive()).toBe(true);
  });
});

describe('eta: only from this batch, only after the first finished job', () => {
  it('says "first" before any job finished, null when nothing is left, else the median over what is left', () => {
    const r = createBatchRunner(mem().store, clock);
    r.start(pick(['1', '2', '3', '4', '5']), 'x', true);
    const items = ['1', '2', '3', '4', '5'].map((id) => item(id, 'PENDING'));
    expect(r.eta(r.rows(items, quiet), 4)).toBe('first');
    for (const id of ['1', '2']) {
      r.markStarted(id);
      t += id === '1' ? 60_000 : 90_000;
      r.record(id, 'submitted', 'ok');
    }
    r.markStarted('3'); // running for 10 s of a 90 s median
    t += 10_000;
    const rows = r.rows([item('3', 'FILLING'), item('4', 'PENDING'), item('5', 'PENDING')], { sessions: { 3: { step: 'review' } }, tabsAlive: new Set() });
    expect(r.eta(rows, 4)).toEqual({ ms: 80_000 + 90_000, basis: 2 }); // the running one finishes in 80 s, then one more round for the 2 queued
    r.record('3', 'skipped', 'closed');
    r.record('4', 'cancelled', 'stopped'); // a cancelled run teaches nothing about duration
    r.record('5', 'failed', 'refused');
    expect(r.eta(r.rows([], quiet), 4)).toBeNull();
  });
});

describe('adopt: after a browser restart the open items on the server become the batch on screen', () => {
  it('adopts without guards, and does nothing when a batch record already exists', () => {
    const r = createBatchRunner(mem().store, clock);
    const adopted = r.adopt(pick(['1', '2']), 'Picked on Plato', true);
    expect(adopted?.itemIds).toEqual(['1', '2']);
    expect(r.isActive()).toBe(true);
    expect(r.adopt(pick(['9']), 'x', true)?.itemIds).toEqual(['1', '2']); // the existing record wins
    expect(() => r.start(pick(['3']), 'x', true)).toThrow(/already running/);
  });
});

describe('persistence: a reloaded panel finds its batch again', () => {
  it('saves on every change and restores the same record', async () => {
    const m = mem();
    const r = createBatchRunner(m.store, clock);
    r.start(pick(['1', '2']), 'Frontend', true);
    r.markStarted('1');
    r.record('1', 'submitted', 'ok');
    await Promise.resolve();
    const again = createBatchRunner(m.store, clock);
    const restored = await again.restore();
    expect(restored).toEqual(m.saved());
    expect(again.has('2')).toBe(true);
    expect(again.rows([item('2', 'PENDING')], quiet).map((x) => x.status)).toEqual(['submitted', 'queued']);
  });
});
