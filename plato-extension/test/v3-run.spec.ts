import { describe, expect, it } from 'vitest';
import type { BrowserCall, CallResult, Outcome, TurnRequest, TurnResponse } from '../src/v3/contract';
import type { PageState } from '../src/dom/page-state';
import { CAPTCHA_WHY, LOOP_WHY, NO_SOLVE, SITE_WHY, TOO_MANY_WHY, newCode, onPage, runV3, type V3RunDeps } from '../src/v3/run';

// A scripted brain: each entry is what the backend answers to the next turn request. The loop under test
// executes the calls through a fake executor and must post the results in order.
type Step = Partial<TurnResponse> & ({ calls: BrowserCall[]; submit_allowed?: boolean } | { outcome: NonNullable<Extract<TurnResponse, { outcome: unknown }>['outcome']> });
// A page as the classifier reports it; the signature is kind + URL + fields (here: the URL alone).
const form = (href: string, kind: PageState['kind'] = 'APPLICATION_FORM'): PageState => ({ href, formPresent: true, captcha: false, closed: false, confirmed: null, kind, fields: 4, sig: `${kind}\n${href}` });
const call = (name: string, input: Record<string, unknown> = {}, id = `${name}-${Math.random().toString(36).slice(2, 6)}`): BrowserCall => ({ call_id: id, name, input });

function harness(script: Step[], o: { autoSubmit?: boolean; fail?: (c: BrowserCall) => boolean; pageText?: string; pages?: Partial<PageState>[]; createAccounts?: boolean } = {}) {
  const reqs: TurnRequest[] = [];
  const execd: { call: BrowserCall; allowed: boolean }[] = [];
  const log: string[] = [];
  let armed = 0;
  let armedBeforeReady = false;
  const pages = [...(o.pages ?? [])];
  let looks = 0;
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
    page: async () => ({ ...form(`https://x/apply?${++looks}`), ...pages.shift() }), // by default a new page every look: no loop
    createAccounts: o.createAccounts,
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
    expect(r).toMatchObject({ kind: 'needs-user', why: 'stop', stop: 'blocked' });
    expect(h.execd.map((e) => e.call.call_id)).toEqual(['a', 'b']); // c never ran
    const posted = h.reqs[1]!;
    expect(posted.event).toBe('results');
    expect(posted.results!.map((x) => [x.call_id, x.ok, x.error ?? ''])).toEqual([
      ['a', true, ''],
      ['b', false, 'left_click failed'],
      ['c', false, 'Not executed: an earlier action in this turn failed.'],
    ]);
    expect(h.reqs[0]).toMatchObject({ event: 'start' });
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

  it('a run that begins at Submit (armed item, "Submit for me"): no arm, no refill; a SUBMIT_READY after it is "unconfirmed", never a second press', async () => {
    const h = harness([{ calls: [call('left_click', { target: { type: 'ref', ref: 'ref_9' } }, 's')], submit_allowed: true }, { outcome: { kind: 'submit_ready', summary: 'still here' } }], { autoSubmit: true });
    const r = await h.run({ event: 'submit' });
    expect(h.reqs[0]).toMatchObject({ event: 'submit' });
    expect(h.execd.map((e) => [e.call.call_id, e.allowed])).toEqual([['s', true]]);
    expect(h.armed()).toBe(0);
    expect(r).toEqual({ kind: 'unconfirmed' });
    expect(h.reqs.filter((q) => q.event === 'submit')).toHaveLength(1);
  });

  it('maps the brain’s other outcomes: ASK and CAPTCHA remember how to continue; CLOSED/already applied skips; REFUSED quotes the site', async () => {
    expect(await harness([{ outcome: { kind: 'ask', question: 'Are you authorised to work in Peru?' } }]).run()).toMatchObject({ kind: 'needs-user', why: 'Are you authorised to work in Peru?', resume: 'seeker_answer', stop: 'ask' });
    expect(await harness([{ outcome: { kind: 'captcha', text: 'CAPTCHA' } }]).run()).toMatchObject({ kind: 'needs-user', why: `A human check (captcha) appeared on the page. ${NO_SOLVE}`, resume: 'solved', stop: 'captcha' });
    expect(await harness([{ outcome: { kind: 'closed', reason: 'You already applied to this job' } }]).run()).toEqual({ kind: 'skip', reason: 'already_applied', why: 'You already applied to this job' });
    expect(await harness([{ outcome: { kind: 'closed', reason: 'The posting is closed' } }]).run()).toEqual({ kind: 'skip', reason: 'closed', why: 'The posting is closed' });
    expect(await harness([{ outcome: { kind: 'refused', quote: 'flagged as possible spam' } }]).run()).toMatchObject({ kind: 'needs-user', why: 'The site did not accept the submission. Its words: “flagged as possible spam”', stop: 'refused' });
    expect(await harness([{ outcome: { kind: 'unconfirmed', text: 'form still there' } }]).run()).toEqual({ kind: 'unconfirmed' });
  });

  it('continues a stopped conversation with the event the panel remembered (the seeker’s answer)', async () => {
    const h = harness([{ outcome: { kind: 'submit_ready', summary: 'ok' } }]);
    await h.run({ event: 'seeker_answer', text: 'Yes' });
    expect(h.reqs[0]).toMatchObject({ event: 'seeker_answer', text: 'Yes' });
  });

  it('a brain error is retried with the same event, then handed to the seeker', async () => {
    const raw = '529: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}';
    const h = harness([{ outcome: { kind: 'error', message: raw, code: 'PL-AAAAAA' } }, { outcome: { kind: 'error', message: raw, code: 'PL-BBBBBB' } }, { outcome: { kind: 'error', message: raw, code: 'PL-CCCCCC' } }]);
    const r = await h.run();
    // the seeker reads plain words and the server's code; the raw error is kept for us, never shown
    expect(r).toMatchObject({ kind: 'needs-user', stop: 'error', code: 'PL-CCCCCC', raw });
    expect((r as { why: string }).why).toMatch(/AI is not answering/);
    expect((r as { why: string }).why).not.toMatch(/[{}]|529/);
    expect(h.reqs.map((r) => r.event)).toEqual(['start', 'start', 'start']);
    const ok = harness([{ outcome: { kind: 'error', message: 'blip' } }, { outcome: { kind: 'submit_ready', summary: 'ok' } }]);
    expect(await ok.run()).toEqual({ kind: 'ready' });
  });

  it('a fatal brain error (a bad request) stops at once: no retry, no "try again in a moment"', async () => {
    const h = harness([{ outcome: { kind: 'error', message: '400: image dimensions', fatal: true, code: 'PL-DDDDDD' } }]);
    const r = await h.run();
    expect(r).toMatchObject({ kind: 'needs-user', stop: 'error', code: 'PL-DDDDDD' });
    expect((r as { why: string }).why).toMatch(/internal error/);
    expect((r as { why: string }).why).not.toMatch(/moment|image dimensions/);
    expect(h.reqs.length).toBe(1);
  });

  it('error codes: PL- and 6 characters without 0, O, 1 or I, the format the backend accepts', () => {
    const codes = Array.from({ length: 200 }, newCode);
    for (const c of codes) expect(c).toMatch(/^PL-[A-HJ-NP-Z2-9]{6}$/);
    expect(new Set(codes).size).toBe(200);
  });

  it('a human check the page itself shows stops the run, whatever the brain planned next', async () => {
    const h = harness([{ calls: [call('read_page')] }, { calls: [call('read_page')] }], { pages: [{}, { captcha: true }] });
    expect(await h.run()).toMatchObject({ kind: 'needs-user', why: CAPTCHA_WHY, resume: 'solved', stop: 'captcha' });
    expect(h.reqs.length).toBe(1); // the results were never posted: the seeker goes first
  });

  it('journals each action briefly and never the whole page', async () => {
    const h = harness([{ calls: [call('type', { text: 'a very long cover letter '.repeat(20) }), call('form_input', { target: { type: 'ref', ref: 'ref_3' }, value: 'Egypt' })] }, { outcome: { kind: 'blocked', reason: 'x' } }]);
    await h.run();
    const acts = h.log.filter((l) => !l.startsWith('Page: ')); // each look at the page is journaled too
    expect(acts[0]!.length).toBeLessThan(140);
    expect(acts[1]).toContain('form_input ref_3 "Egypt"');
  });
});

describe('onPage: the quoted proof must be on the page', () => {
  it('ignores case and punctuation, refuses short quotes', () => {
    expect(onPage('Thank you for applying!', 'thanks.\nTHANK YOU, for applying — we got it')).toBe(true);
    expect(onPage('Thanks', 'Thanks')).toBe(false);
    expect(onPage('Your application was received', 'Please fill the form')).toBe(false);
  });
});

describe('runV3: the brain goes away after Submit was pressed', () => {
  const turnThrows = (pressed: boolean) => {
    const log: string[] = [];
    const deps: V3RunDeps = {
      turn: async () => { throw new Error('Internal server error'); },
      exec: async (c) => ({ call_id: c.call_id, ok: true }),
      pageText: async () => '',
      page: async () => undefined,
      arm: async () => undefined,
      pressed: () => pressed,
      autoSubmit: true,
      jot: (l) => log.push(l),
      sleep: async () => undefined,
    };
    return { deps, log };
  };
  it('after the press: "unconfirmed" (the page gets checked, else VERIFY), never a restart that navigates away', async () => {
    const h = turnThrows(true);
    expect(await runV3(h.deps, { event: 'results', results: [] })).toEqual({ kind: 'unconfirmed' });
    expect(h.log.join('\n')).toMatch(/could not be reached after Submit \(Internal server error\)/);
  });
  it('before any press: the error still surfaces (nothing was sent)', async () => {
    await expect(runV3(turnThrows(false).deps)).rejects.toThrow('Internal server error');
  });
});


describe('runV3: stops carry their kind and the questions to draw', () => {
  const only = (outcome: Outcome) => runV3({ turn: async () => ({ version: 1, turn: 1, outcome }), exec: async (c) => ({ call_id: c.call_id, ok: true }), pageText: async () => '', page: async () => undefined, arm: async () => undefined, autoSubmit: false, jot: () => undefined, sleep: async () => undefined });
  it('ASK with structured questions passes them through; without them the line becomes one free-text question', async () => {
    const qs = [{ id: 'relocate', label: 'Relocate to Munich?', type: 'boolean' as const, options: ['Yes', 'No'] }];
    expect(await only({ kind: 'ask', question: 'Two facts missing.', questions: qs })).toMatchObject({ kind: 'needs-user', why: 'Two facts missing.', resume: 'seeker_answer', stop: 'ask', ask: qs });
    expect(await only({ kind: 'ask', question: 'Authorised to work in Peru?' })).toMatchObject({ stop: 'ask', ask: [{ id: 'answer', label: 'Authorised to work in Peru?', type: 'textarea', required: true }] });
  });
  it('CAPTCHA keeps the brain’s description of the check; REFUSED quotes the site; BLOCKED and the turn cap are "blocked"; a brain failure is "error"', async () => {
    const c = await only({ kind: 'captcha', text: 'CAPTCHA hCaptcha challenge right after Submit' });
    expect(c).toMatchObject({ stop: 'captcha', resume: 'solved' });
    expect((c as { why: string }).why).toMatch(/^hCaptcha challenge right after Submit/);
    expect(await only({ kind: 'refused', quote: 'flagged as possible spam' })).toMatchObject({ stop: 'refused', why: 'The site did not accept the submission. Its words: “flagged as possible spam”' });
    expect(await only({ kind: 'blocked', reason: 'The Apply button needs a login.' })).toMatchObject({ stop: 'blocked', why: 'The Apply button needs a login.' });
    const e = await runV3({ turn: async () => ({ version: 1, turn: 1, outcome: { kind: 'error', message: 'overloaded' } }), exec: async (c) => ({ call_id: c.call_id, ok: true }), pageText: async () => '', page: async () => undefined, arm: async () => undefined, autoSubmit: false, jot: () => undefined, sleep: async () => undefined });
    expect(e).toMatchObject({ stop: 'error' });
  });
});

describe('runV3: what the page is decides before the brain acts', () => {
  const click = () => call('left_click', { target: { type: 'ref', ref: 'ref_1' } });
  const signup = form('https://x/register', 'ACCOUNT_SIGNUP');

  it('an account to make, "create accounts" off: stops before any turn, nothing typed, Continue resumes', async () => {
    const h = harness([], { pages: [signup] });
    expect(await h.run()).toMatchObject({ kind: 'needs-user', why: SITE_WHY.ACCOUNT_SIGNUP, stop: 'site', resume: 'continue', reason: 'account-signup', states: ['ACCOUNT_SIGNUP https://x/register'] });
    expect(h.reqs).toEqual([]);
    expect(h.execd).toEqual([]);
  });
  it('"create accounts" on: a sign-up page is the brain\'s to handle; it is told what the page is', async () => {
    const h = harness([{ outcome: { kind: 'blocked', reason: 'x' } }], { pages: [signup], createAccounts: true });
    await h.run();
    expect(h.reqs[0]).toEqual({ event: 'start', page: { kind: 'ACCOUNT_SIGNUP', url: 'https://x/register', fields: 4 } });
  });
  it('an email code always stops, setting on or off, also when a press leads there', async () => {
    const h = harness([{ calls: [click()] }], { pages: [{}, form('https://x/verify', 'EMAIL_VERIFICATION')], createAccounts: true });
    expect(await h.run()).toMatchObject({ stop: 'site', reason: 'email-verification', why: SITE_WHY.EMAIL_VERIFICATION });
  });
  it('Continue on the same page does not stop again (the seeker was just there); a new such page does', async () => {
    const h = harness([{ calls: [click()] }], { pages: [signup, form('https://x/verify', 'EMAIL_VERIFICATION')] });
    expect(await h.run({ event: 'continue' })).toMatchObject({ reason: 'email-verification' });
    expect(h.reqs[0]).toMatchObject({ event: 'continue', page: { kind: 'ACCOUNT_SIGNUP' } });
  });
  it('the brain\'s own reading: ACCOUNT_REQUIRED / UNKNOWN_PAGE stop with Continue; UNKNOWN_PAGE says what it saw', async () => {
    expect(await harness([{ outcome: { kind: 'site', page: 'ACCOUNT_SIGNUP', reason: 'acme.workday.com' } }]).run()).toMatchObject({ stop: 'site', reason: 'account-signup', resume: 'continue' });
    const u = await harness([{ outcome: { kind: 'site', page: 'UNKNOWN', reason: 'a page about cookies with no form' } }]).run();
    expect(u).toMatchObject({ stop: 'site', reason: 'unknown-page' });
    expect((u as { why: string }).why).toMatch(/not sure what this page is \(a page about cookies with no form\)/);
  });
  it('a loop: 3 action turns that change nothing stop the run; read-only turns neither count nor reset', async () => {
    const same = form('https://x/apply');
    const h = harness([{ calls: [click()] }, { calls: [call('read_page')] }, { calls: [call('screenshot')] }, { calls: [click()] }, { calls: [click()] }], { pages: Array(6).fill(same) });
    expect(await h.run()).toMatchObject({ kind: 'needs-user', why: LOOP_WHY, stop: 'loop', resume: 'continue', reason: 'loop' });
    expect(h.reqs.length).toBe(5);
  });
  it('a press that changes the page resets the loop count', async () => {
    const a = form('https://x/apply'), b = form('https://x/apply?step=2');
    const h = harness([{ calls: [click()] }, { calls: [click()] }, { calls: [click()] }, { calls: [click()] }, { outcome: { kind: 'blocked', reason: 'done' } }], { pages: [a, a, a, b, b, b] });
    expect(await h.run()).toMatchObject({ reason: 'blocked' });
  });
  it('40 steps at most, by the extension or the backend\'s turn limit: "too many steps"', async () => {
    const h = harness(Array.from({ length: 40 }, () => ({ calls: [call('read_page')] })));
    expect(await h.run()).toMatchObject({ why: TOO_MANY_WHY, reason: 'too-many-steps' });
    expect(h.reqs.length).toBe(40);
    expect(await harness([{ outcome: { kind: 'blocked', reason: 'Turn limit (40) reached.' } }]).run()).toMatchObject({ reason: 'too-many-steps' });
  });
});
