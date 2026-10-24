import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/core/api';
import { createOrchestrator, HEARTBEAT_MS, OrchestratorError } from '../src/core/orchestrator';
import { createOutbox } from '../src/core/outbox';
import { canMove, TRANSITIONS } from '../src/core/contract';
import { planReconcile } from '../src/core/reconcile';
import type { ApiItem, Evidence, ItemState } from '../src/core/types';
import { createRegistry } from '../src/providers/registry';
import type { ProviderAdapter, ProviderDefinition } from '../src/providers/types';

// A tiny backend that follows the real contract (plato-native-be batch-state.ts).
const NEXT = TRANSITIONS; // the shared contract, same table the backend enforces
function backend(initial: Partial<ApiItem> = {}) {
  const item: ApiItem = { id: 'i1', batch_id: 'b', job_id: 'j', provider: 'fx', state: 'PENDING', attempt_id: null, seq: 0, lease_expires_at: null, detail: null, verify_reason: null, job: { title: 'Dev', company: 'Acme', url: 'https://fx.test/1' }, ...initial };
  const log: { to: ItemState; seq: number; detail?: unknown }[] = [];
  const state = { offline: false, dropResponse: false, hb409: false, unauthorized: false, claims: 0, heartbeats: 0 };
  const api = {
    claim: async () => { state.claims++; Object.assign(item, { state: 'CLAIMED', attempt_id: 'att1', seq: 0 }); return { ...item }; },
    heartbeat: async () => { state.heartbeats++; if (state.hb409) throw new ApiError(409, 'Not the active attempt'); return { ok: true as const }; },
    transition: async (_id: string, b: { attempt_id: string; seq: number; to: ItemState; detail?: unknown }) => {
      if (state.unauthorized) throw new ApiError(401, 'x');
      if (state.offline) throw new ApiError(0, 'offline');
      if (b.attempt_id !== item.attempt_id) throw new ApiError(409, 'Stale attempt');
      if (b.seq <= item.seq) { if (b.seq === item.seq && b.to === item.state) return { ...item }; throw new ApiError(409, 'Out of order'); }
      if (b.seq !== item.seq + 1) throw new ApiError(409, 'Out of order');
      if (!NEXT[item.state].includes(b.to)) throw new ApiError(409, `Cannot move ${item.state} -> ${b.to}`);
      Object.assign(item, { state: b.to, seq: b.seq });
      log.push({ to: b.to, seq: b.seq, detail: b.detail });
      if (state.dropResponse) { state.dropResponse = false; throw new ApiError(0, 'response lost'); }
      return { ...item };
    },
  };
  return { item, log, state, api };
}

const memOutbox = () => {
  const d: Record<string, unknown> = {};
  return createOutbox({ get: async (k) => (k in d ? { [k]: d[k] } : {}), set: async (i) => void Object.assign(d, i) });
};
const spyAdapter = (over: Partial<ProviderAdapter> = {}) => {
  const a = { prepare: vi.fn(async () => ({ kind: 'ready' as const })), inspectOutcome: vi.fn(async (): Promise<Evidence> => ({ kind: 'unknown' })), ...over };
  return a as ProviderAdapter & { prepare: ReturnType<typeof vi.fn>; inspectOutcome: ReturnType<typeof vi.fn> };
};
const setup = (opts: { initial?: Partial<ApiItem>; adapter?: ProviderAdapter | null; policy?: Record<string, 'FILL_ONLY' | 'BLOCKED'> | undefined } = {}) => {
  const be = backend(opts.initial);
  const adapter = opts.adapter === undefined ? spyAdapter() : opts.adapter;
  const def: ProviderDefinition = { id: 'fx', label: 'Fx', hosts: ['fx.test'], policy: 'FILL_ONLY', urlPatterns: ['https://fx.test/*'], capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false }, classify: () => ({ provider: 'fx', page: 'apply-form', applyVia: 'internal-form' }), ...(adapter && { adapter: async () => adapter }) };
  const outbox = memOutbox();
  const timers: (() => void)[] = [];
  const lost = vi.fn();
  const orch = createOrchestrator({
    api: be.api as never, outbox, registry: createRegistry([def]),
    policy: () => ('policy' in opts ? opts.policy : { fx: 'FILL_ONLY' }),
    setInterval: ((fn: () => void) => (timers.push(fn), timers.length)) as never, clearInterval: (() => undefined) as never, onLost: lost,
  });
  return { be, orch, adapter, outbox, timers, lost };
};

describe('claim gate', () => {
  it('claims nothing on the server when the provider is blocked, unknown, or has no adapter', async () => {
    for (const o of [{ policy: { fx: 'BLOCKED' as const } }, { policy: undefined }, { adapter: null }, { initial: { provider: 'other' } }, { initial: { provider: null } }]) {
      const { be, orch } = setup(o);
      await expect(orch.claim(be.item)).rejects.toBeInstanceOf(OrchestratorError);
      expect(be.state.claims).toBe(0);
    }
  });
});

describe('adopt (the panel was reloaded)', () => {
  it('takes over the same attempt without claiming again, and keeps the heartbeat going', async () => {
    const { be, orch, timers } = setup({ initial: { state: 'REVIEW', attempt_id: 'att1', seq: 3 } });
    const s = await orch.adopt({ ...be.item }, 7);
    expect(be.state.claims).toBe(0); // no new claim: the server's attempt continues
    expect([s.attemptId, s.seq, s.tabId]).toEqual(['att1', 3, 7]);
    expect(orch.session(be.item.id)).toBe(s);
    expect(timers.length).toBe(1); // heartbeat restarted
    await orch.armForSubmit(s);
    expect(be.log.map((l) => [l.to, l.seq])).toEqual([['AWAITING_SUBMIT', 4]]); // continues from seq 3
  });

  it('refuses a job that holds no attempt', async () => {
    const { be, orch } = setup();
    await expect(orch.adopt({ ...be.item, attempt_id: null })).rejects.toBeInstanceOf(OrchestratorError);
  });
});

describe('nothing to apply to', () => {
  it('a closed or already-applied job is SKIPPED with the true reason, not FAILED and not "needs you"', async () => {
    const adapter = spyAdapter({ prepare: vi.fn(async () => ({ kind: 'skip' as const, reason: 'closed' as const, message: 'No longer accepting applications.' })) });
    const { be, orch } = setup({ adapter });
    const s = await orch.claim(be.item);
    expect(await orch.prepare(s, 'https://fx.test/1')).toBe('skipped');
    expect(be.log.map((l) => l.to)).toEqual(['PREPARING', 'SKIPPED']);
    expect(be.log.at(-1)!.detail).toEqual({ reason: 'closed', message: 'No longer accepting applications.' });
    expect(be.item.state).toBe('SKIPPED');
  });
});

describe('happy path', () => {
  it('prepares, arms BEFORE the person is told to submit, and never submits itself', async () => {
    const { be, orch, adapter } = setup();
    const s = await orch.claim(be.item);
    expect(await orch.prepare(s, 'https://fx.test/1')).toBe('review');
    expect(be.log.map((l) => l.to)).toEqual(['PREPARING', 'FILLING', 'REVIEW']);
    await orch.armForSubmit(s);
    expect(be.item.state).toBe('AWAITING_SUBMIT');
    // the adapter contract has no way to submit
    expect(Object.keys(adapter!).sort()).toEqual(['inspectOutcome', 'prepare']);
    // an unclear page is NOT a confirmation
    for (const ev of [{ kind: 'unknown' }, { kind: 'form-present' }, { kind: 'gone' }] as Evidence[]) {
      adapter!.inspectOutcome = vi.fn(async () => ev);
      await orch.observe(s);
    }
    expect(be.item.state).toBe('AWAITING_SUBMIT');
    adapter!.inspectOutcome = vi.fn(async () => ({ kind: 'confirmed', marker: 'Application received' }) as Evidence);
    s.tabId = 7;
    await orch.observe(s);
    expect(be.item.state).toBe('SUBMITTED_CONFIRMED');
    expect(be.log.at(-1)).toMatchObject({ detail: { marker: 'Application received' } });
  });

  it('observe without a tab never confirms', async () => {
    const { be, orch } = setup();
    const s = await orch.claim(be.item);
    await orch.prepare(s, 'u');
    await orch.armForSubmit(s);
    expect((await orch.observe(s)).kind).toBe('unknown');
    expect(be.item.state).toBe('AWAITING_SUBMIT');
  });

  it('login / CAPTCHA / unsupported pause or fail; nothing is bypassed', async () => {
    const a = setup({ adapter: spyAdapter({ prepare: vi.fn(async () => ({ kind: 'needs-user' as const, reason: 'captcha' as const })) }) });
    const s = await a.orch.claim(a.be.item);
    expect(await a.orch.prepare(s, 'u')).toBe('needs-user');
    expect(a.be.item.state).toBe('NEEDS_USER');
    const b = setup({ adapter: spyAdapter({ prepare: vi.fn(async () => ({ kind: 'unsupported' as const, message: 'blocked' })) }) });
    const s2 = await b.orch.claim(b.be.item);
    expect(await b.orch.prepare(s2, 'u')).toBe('failed');
    expect(b.be.log.at(-1)).toMatchObject({ to: 'FAILED', detail: { failure_kind: 'blocked_by_site' } });
  });

  it('attest and not-sure are recorded as the person’s word', async () => {
    const { be, orch } = setup();
    const s = await orch.claim(be.item);
    await orch.prepare(s, 'u');
    await orch.armForSubmit(s);
    await orch.notSure(s);
    expect(be.item.state).toBe('VERIFY');
    await orch.attest(s);
    expect(be.item.state).toBe('SUBMITTED_ATTESTED');
  });
});

describe('connectivity and crashes', () => {
  it('arming that cannot reach the server fails loudly and queues nothing', async () => {
    const { be, orch, outbox } = setup();
    const s = await orch.claim(be.item);
    await orch.prepare(s, 'u');
    be.state.offline = true;
    await expect(orch.armForSubmit(s)).rejects.toMatchObject({ code: 'arm_failed' });
    expect(await outbox.list()).toEqual([]);
    expect(s.seq).toBe(3);
    be.state.offline = false;
    await orch.armForSubmit(s); // the retry works, same seq
    expect(be.item.state).toBe('AWAITING_SUBMIT');
  });

  it('a lost response replays the same (attempt, seq) and is applied once', async () => {
    const { be, orch } = setup();
    const s = await orch.claim(be.item);
    await orch.prepare(s, 'u');
    await orch.armForSubmit(s);
    be.state.dropResponse = true; // server applied it, the panel never heard
    await orch.attest(s);
    expect(be.item.state).toBe('SUBMITTED_ATTESTED');
    const r = await orch.flushOutbox();
    expect(r).toMatchObject({ sent: 1, stopped: null });
    expect(be.log.filter((l) => l.to === 'SUBMITTED_ATTESTED')).toHaveLength(1);
  });

  it('a terminal outcome offline is queued, kept in order, and sent later', async () => {
    const { be, orch, outbox } = setup();
    const s = await orch.claim(be.item);
    await orch.prepare(s, 'u');
    await orch.armForSubmit(s);
    be.state.offline = true;
    await orch.attest(s);
    expect((await outbox.list()).map((e) => e.body.to)).toEqual(['SUBMITTED_ATTESTED']);
    expect(be.item.state).toBe('AWAITING_SUBMIT');
    be.state.offline = false;
    await orch.flushOutbox();
    expect(be.item.state).toBe('SUBMITTED_ATTESTED');
    expect(await outbox.list()).toEqual([]);
  });

  it('401 surfaces as unauthorized', async () => {
    const { be, orch } = setup();
    const s = await orch.claim(be.item);
    be.state.unauthorized = true;
    await expect(orch.prepare(s, 'u')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('heartbeat runs on the interval; a 409 ends the session and reports it', async () => {
    const { be, orch, timers, lost } = setup();
    await orch.claim(be.item);
    expect(HEARTBEAT_MS).toBe(20_000);
    timers[0]!();
    await Promise.resolve();
    expect(be.state.heartbeats).toBe(1);
    be.state.hb409 = true;
    timers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(lost).toHaveBeenCalledWith('i1');
    expect(orch.session('i1')).toBeUndefined();
  });

  it('a stale or conflicting transition drops the session instead of forcing it', async () => {
    const { be, orch } = setup();
    const s = await orch.claim(be.item);
    be.item.state = 'CANCELLED'; // changed elsewhere (e.g. released from the web)
    await expect(orch.prepare(s, 'u')).rejects.toMatchObject({ code: 'lost' });
    expect(orch.session('i1')).toBeUndefined();
  });
});

describe('reconcile after a restart (nothing is ever re-sent)', () => {
  const armed = (state: ItemState = 'AWAITING_SUBMIT'): Partial<ApiItem> => ({ state, attempt_id: 'att1', seq: 4 });

  it.each([
    ['confirmation on the page', { kind: 'confirmed', marker: 'Thank you' }, 'SUBMITTED_CONFIRMED'],
    ['form still open', { kind: 'form-present' }, 'VERIFY'],
    ['page closed', { kind: 'gone' }, 'VERIFY'],
    ['page unreadable', { kind: 'unknown' }, 'VERIFY'],
  ] as const)('armed, panel restarted, %s -> %s', async (_n, ev, expected) => {
    const { be, orch, adapter } = setup({ initial: armed() });
    const out = await orch.reconcile([be.item], async () => ev);
    expect(be.item.state).toBe(expected);
    expect(out[0]!.plan.action).toBe(expected === 'VERIFY' ? 'to-verify' : 'confirm');
    expect(adapter!.prepare).not.toHaveBeenCalled(); // nothing is filled or clicked again
    expect(be.log.every((l) => l.to === 'VERIFY' || l.to === 'SUBMITTED_CONFIRMED')).toBe(true);
  });

  it('a probe that throws is treated as unknown -> VERIFY', async () => {
    const { be, orch } = setup({ initial: armed() });
    await orch.reconcile([be.item], async () => { throw new Error('tab gone'); });
    expect(be.item.state).toBe('VERIFY');
    expect(be.log[0]).toMatchObject({ detail: { reason: 'outcome_unknown' } });
  });

  it('VERIFY stays with the person unless the page itself proves it', async () => {
    const a = setup({ initial: armed('VERIFY') });
    expect((await a.orch.reconcile([a.be.item], async () => ({ kind: 'unknown' })))[0]!.plan.action).toBe('ask-user');
    expect(a.be.log).toEqual([]);
    const b = setup({ initial: armed('VERIFY') });
    await b.orch.reconcile([b.be.item], async () => ({ kind: 'confirmed', marker: 'ok' }));
    expect(b.be.item.state).toBe('SUBMITTED_CONFIRMED');
  });

  it('a live session in this panel is never second-guessed by a probe', async () => {
    const { be, orch } = setup();
    const s = await orch.claim(be.item);
    await orch.prepare(s, 'u');
    await orch.armForSubmit(s);
    const probe = vi.fn(async (): Promise<Evidence> => ({ kind: 'unknown' }));
    const out = await orch.reconcile([{ ...be.item }], probe);
    expect(probe).not.toHaveBeenCalled();
    expect(out[0]!.plan.action).toBe('none');
    expect(be.item.state).toBe('AWAITING_SUBMIT');
  });

  it('pre-armed work we no longer hold is only offered for release, never resumed or released automatically', async () => {
    for (const st of ['CLAIMED', 'PREPARING', 'NEEDS_USER', 'FILLING', 'REVIEW'] as const) {
      const { be, orch } = setup({ initial: armed(st) });
      const out = await orch.reconcile([be.item], async () => ({ kind: 'unknown' }));
      expect(out[0]!.plan.action).toBe('offer-release');
      expect(be.log).toEqual([]);
    }
  });

  it('settle: the person resolves VERIFY from any panel; other states are refused', async () => {
    const a = setup({ initial: armed('VERIFY') });
    await a.orch.settle(a.be.item, 'submitted');
    expect(a.be.item.state).toBe('SUBMITTED_ATTESTED');
    const b = setup({ initial: armed('VERIFY') });
    await b.orch.settle(b.be.item, 'not-submitted');
    expect(b.be.item.state).toBe('FAILED');
    const c = setup({ initial: armed('AWAITING_SUBMIT') });
    await expect(c.orch.settle(c.be.item, 'submitted')).rejects.toMatchObject({ code: 'bad_state' });
  });

  it('release gives a pre-armed job back; it cannot cancel an armed one', async () => {
    const a = setup({ initial: armed('FILLING') });
    await a.orch.release(a.be.item);
    expect(a.be.item.state).toBe('CANCELLED');
    const b = setup({ initial: armed('AWAITING_SUBMIT') });
    await expect(b.orch.release(b.be.item)).rejects.toMatchObject({ code: 'lost' });
    expect(b.be.item.state).toBe('AWAITING_SUBMIT');
  });
});

describe('planReconcile is exhaustive and can never ask for a re-send', () => {
  const STATES: ItemState[] = Object.keys(NEXT) as ItemState[];
  const EVIDENCE: Evidence[] = [{ kind: 'confirmed', marker: 'm' }, { kind: 'form-present' }, { kind: 'gone' }, { kind: 'unknown' }];
  it('every (state, evidence, held) maps to a recommendation from a closed safe set', () => {
    const safe = new Set(['none', 'continue', 'offer-release', 'confirm', 'to-verify', 'ask-user']);
    for (const st of STATES) for (const ev of EVIDENCE) for (const held of [true, false]) {
      const p = planReconcile({ state: st }, ev, held);
      expect(safe.has(p.action)).toBe(true);
      // terminal and PENDING items are left alone
      if (['PENDING', 'SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(st)) expect(p.action).toBe('none');
      // only a page that clearly confirms may ever record success
      if (p.action === 'confirm') expect(ev.kind).toBe('confirmed');
      // armed + unclear evidence never stays silent unless the person is visibly working
      if (st === 'AWAITING_SUBMIT' && ev.kind !== 'confirmed' && !(held && ev.kind === 'form-present')) expect(p.action).toBe('to-verify');
    }
  });
});

describe('orchestrator and reconcile only ever ask for moves the contract allows', () => {
  it('every recommendation that records something is a legal transition from that state', () => {
    const STATES = Object.keys(TRANSITIONS) as ItemState[];
    const EV: Evidence[] = [{ kind: 'confirmed', marker: 'm' }, { kind: 'form-present' }, { kind: 'gone' }, { kind: 'unknown' }];
    for (const st of STATES) for (const ev of EV) for (const held of [true, false]) {
      const p = planReconcile({ state: st }, ev, held);
      if (p.action === 'confirm') expect(canMove(st, 'SUBMITTED_CONFIRMED')).toBe(true);
      if (p.action === 'to-verify') expect(canMove(st, 'VERIFY')).toBe(true);
    }
  });
});
