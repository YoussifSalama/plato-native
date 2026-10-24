import { describe, expect, it } from 'vitest';
import type { BrowserCall, CallResult, TurnRequest, TurnResponse } from '../src/v3/contract';
import { CAPTCHA_WHY, onPage, runV3, type V3RunDeps } from '../src/v3/run';

// A scripted brain: each entry is what the backend answers to the next turn request. The loop under test
// executes the calls through a fake executor and must post the results in order.
type Step = Partial<TurnResponse> & ({ calls: BrowserCall[]; submit_allowed?: boolean } | { outcome: NonNullable<Extract<TurnResponse, { outcome: unknown }>['outcome']> });
const call = (name: string, input: Record<string, unknown> = {}, id = `${name}-${Math.random().toString(36).slice(2, 6)}`): BrowserCall => ({ call_id: id, name, input });

function harness(script: Step[], o: { autoSubmit?: boolean; fail?: (c: BrowserCall) => boolean; pageText?: string; captcha?: boolean[] } = {}) {
  const reqs: TurnRequest[] = [];
  const execd: { call: BrowserCall; allowed: boolean }[] = [];
  const log: string[] = [];
  let armed = 0;
  let armedBeforeReady = false;
  const captchas = [...(o.captcha ?? [])];
  const deps: V3RunDeps = {
    turn: async (req) => {
      reqs.push(req);
      const s = script.shift();
      if (!s) throw new Error('script exhausted');
      return { version: 1, turn: reqs.length, ...('calls' in s ? { submit_allowed: false } : {}), ...s } as TurnResponse;
    },
    exec: async (c, allowed) => {
      execd.push({ call: c, allowed });
      const r: CallResult = o.fail?.(c) ? { call_id: c.call_id, ok: false, error: `${c.name} failed` } : { call_id: c.call_id, ok: true, text: `${c.name} done`, state: { tabs: [{ tab_id: 'tab_1', title: '', url: 'https://x' }] } };
      return r;
    },
    pageText: async () => o.pageText ?? '',
    captcha: async () => captchas.shift() ?? false,
    arm: async () => void armed++,
    autoSubmit: o.autoSubmit ?? false,
    jot: (l) => log.push(l),
    sleep: async () => undefined,
  };
  const run = async (first?: TurnRequest) => {
    const r = await runV3(deps, first);
    armedBeforeReady = armed > 0;
    return r;
  };
  return { run, reqs, execd, log, armed: () => armed, armedBeforeReady: () => armedBeforeReady };
}

describe('runV3: the loop over the backend brain', () => {
  it('executes the calls of a turn in order, stops at the first failure, answers the rest "not executed", posts every result', async () => {
    const h = harness([{ calls: [call('read_page', {}, 'a'), call('left_click', { target: { type: 'ref', ref: 'ref_1' } }, 'b'), call('type', { text: 'x' }, 'c')] }, { outcome: { kind: 'blocked', reason: 'stop' } }], { fail: (c) => c.call_id === 'b' });
    const r = await h.run();
    expect(r).toEqual({ kind: 'needs-user', why: 'stop' });
    expect(h.execd.map((e) => e.call.call_id)).toEqual(['a', 'b']); // c never ran
    const posted = h.reqs[1]!;
    expect(posted.event).toBe('results');
    expect(posted.results!.map((x) => [x.call_id, x.ok, x.error ?? ''])).toEqual([
      ['a', true, ''],
      ['b', false, 'left_click failed'],
      ['c', false, 'Not executed: an earlier action in this turn failed.'],
    ]);
    expect(h.reqs[0]).toEqual({ event: 'start' });
  });

  it('SUBMIT_READY with auto-submit off: arms on the server, then the person presses', async () => {
    const h = harness([{ outcome: { kind: 'submit_ready', summary: 'all filled' } }]);
    expect(await h.run()).toEqual({ kind: 'ready' });
    expect(h.armed()).toBe(1);
    expect(h.log.join('\n')).toContain('submit_ready');
  });

  it('auto-submit: arms FIRST, then sends the submit event once; the press runs with submit allowed; CONFIRMED counts only with its quote on the page', async () => {
    const h = harness(
      [{ outcome: { kind: 'submit_ready', summary: 'ok' } }, { calls: [call('left_click', { target: { type: 'ref', ref: 'ref_9' } }, 'p')], submit_allowed: true }, { outcome: { kind: 'confirmed', quote: 'Thank you for applying' } }],
      { autoSubmit: true, pageText: 'Engineer\nThank you for applying! We will be in touch.' },
    );
    expect(await h.run()).toEqual({ kind: 'confirmed', marker: 'page:Thank you for applying' });
    expect(h.reqs.map((r) => r.event)).toEqual(['start', 'submit', 'results']);
    expect(h.armed()).toBe(1);
    expect(h.execd[0]).toMatchObject({ call: { call_id: 'p' }, allowed: true });
  });

  it('CONFIRMED whose quote is not on the page is "unconfirmed": never a claimed success, never a resend', async () => {
    const h = harness([{ outcome: { kind: 'submit_ready', summary: 'ok' } }, { outcome: { kind: 'confirmed', quote: 'Application submitted successfully' } }], { autoSubmit: true, pageText: 'Engineer form still here' });
    expect(await h.run()).toEqual({ kind: 'unconfirmed' });
    expect(h.log.at(-1)).toMatch(/not on the page/);
  });

  it('a second SUBMIT_READY after the press is "unconfirmed" (no second submit event)', async () => {
    const h = harness([{ outcome: { kind: 'submit_ready', summary: 'ok' } }, { outcome: { kind: 'submit_ready', summary: 'again' } }], { autoSubmit: true });
    expect(await h.run()).toEqual({ kind: 'unconfirmed' });
    expect(h.reqs.map((r) => r.event)).toEqual(['start', 'submit']);
    expect(h.armed()).toBe(1);
  });

  it('maps the brain’s other outcomes: ASK and CAPTCHA remember how to continue; CLOSED/already applied skips; REFUSED quotes the site', async () => {
    expect(await harness([{ outcome: { kind: 'ask', question: 'Are you authorised to work in Peru?' } }]).run()).toEqual({ kind: 'needs-user', why: 'Are you authorised to work in Peru?', resume: 'seeker_answer' });
    expect(await harness([{ outcome: { kind: 'captcha', text: 'CAPTCHA' } }]).run()).toEqual({ kind: 'needs-user', why: CAPTCHA_WHY, resume: 'solved' });
    expect(await harness([{ outcome: { kind: 'closed', reason: 'You already applied to this job' } }]).run()).toEqual({ kind: 'skip', reason: 'already_applied', why: 'You already applied to this job' });
    expect(await harness([{ outcome: { kind: 'closed', reason: 'The posting is closed' } }]).run()).toEqual({ kind: 'skip', reason: 'closed', why: 'The posting is closed' });
    expect(await harness([{ outcome: { kind: 'refused', quote: 'flagged as possible spam' } }]).run()).toEqual({ kind: 'needs-user', why: 'The site refused the submission: flagged as possible spam' });
    expect(await harness([{ outcome: { kind: 'unconfirmed', text: 'form still there' } }]).run()).toEqual({ kind: 'unconfirmed' });
  });

  it('continues a stopped conversation with the event the panel remembered (the seeker’s answer)', async () => {
    const h = harness([{ outcome: { kind: 'submit_ready', summary: 'ok' } }]);
    await h.run({ event: 'seeker_answer', text: 'Yes' });
    expect(h.reqs[0]).toEqual({ event: 'seeker_answer', text: 'Yes' });
  });

  it('a brain error is retried with the same event, then handed to the seeker', async () => {
    const h = harness([{ outcome: { kind: 'error', message: 'overloaded' } }, { outcome: { kind: 'error', message: 'overloaded' } }, { outcome: { kind: 'error', message: 'overloaded' } }]);
    const r = await h.run();
    expect(r.kind).toBe('needs-user');
    expect((r as { why: string }).why).toMatch(/could not be reached \(overloaded\)/);
    expect(h.reqs.map((r) => r.event)).toEqual(['start', 'start', 'start']);
    const ok = harness([{ outcome: { kind: 'error', message: 'blip' } }, { outcome: { kind: 'submit_ready', summary: 'ok' } }]);
    expect(await ok.run()).toEqual({ kind: 'ready' });
  });

  it('a human check the page itself shows stops the run, whatever the brain planned next', async () => {
    const h = harness([{ calls: [call('read_page')] }, { calls: [call('read_page')] }], { captcha: [true] });
    expect(await h.run()).toEqual({ kind: 'needs-user', why: CAPTCHA_WHY, resume: 'solved' });
    expect(h.reqs.length).toBe(1); // the results were never posted: the seeker goes first
  });

  it('journals each action briefly and never the whole page', async () => {
    const h = harness([{ calls: [call('type', { text: 'a very long cover letter '.repeat(20) }), call('form_input', { target: { type: 'ref', ref: 'ref_3' }, value: 'Egypt' })] }, { outcome: { kind: 'blocked', reason: 'x' } }]);
    await h.run();
    expect(h.log[0]!.length).toBeLessThan(140);
    expect(h.log[1]).toContain('form_input ref_3 "Egypt"');
  });
});

describe('onPage: the quoted proof must be on the page', () => {
  it('ignores case and punctuation, refuses short quotes', () => {
    expect(onPage('Thank you for applying!', 'thanks.\nTHANK YOU, for applying — we got it')).toBe(true);
    expect(onPage('Thanks', 'Thanks')).toBe(false);
    expect(onPage('Your application was received', 'Please fill the form')).toBe(false);
  });
});
