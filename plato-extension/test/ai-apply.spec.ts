import { describe, expect, it } from 'vitest';
import { runAiApply, type Decided } from '../src/panel/ai-apply';

// A fake browser: the current page is a name; pressing a ref moves to another page (or nowhere).
function harness(o: {
  start: string;
  moves?: Record<string, Record<string, string>>;
  decide: (page: string) => Partial<Decided>;
  fails?: string[][]; // what each fill() call reports as not sticking
  reveals?: number; // how many fill() calls reveal new fields
  repaired?: string[]; // what repair() still reports
  autoSubmit?: boolean;
  confirmOn?: string;
  loadingLooks?: number; // the first N looks see a page still loading / changing
}) {
  let page = o.start;
  let looks = 0;
  const calls = { decide: 0, fill: 0, repair: 0, press: 0, arm: 0 };
  const fails = [...(o.fails ?? [])];
  const run = runAiApply({
    look: async () => {
      looks++;
      const loading = looks <= (o.loadingLooks ?? 0);
      return { sig: loading ? `${page}#loading${looks}` : page, confirmed: !loading && page === (o.confirmOn ?? 'done') ? 'Thank you for applying' : null, loading };
    },
    decide: async () => {
      calls.decide++;
      return { action: 'wait', ref: null, intent: null, reason: '', skip_reason: null, missing: [], ...o.decide(page) };
    },
    fill: async () => ({ failed: (calls.fill++, fails.shift() ?? []), revealed: calls.fill <= (o.reveals ?? 0) }),
    repair: async () => (calls.repair++, o.repaired ?? []),
    press: async (ref) => {
      calls.press++;
      page = o.moves?.[page]?.[ref] ?? page;
      return { clicked: true };
    },
    arm: async () => void calls.arm++,
    autoSubmit: o.autoSubmit ?? true,
    sleep: async () => undefined,
  });
  return { run, calls };
}
const press = (ref: string, intent: Decided['intent']): Partial<Decided> => ({ action: 'press', ref, intent, label: ref });

describe('generic AI apply loop', () => {
  it('one-shot form: one decision, fill, submit once, confirmed by the page', async () => {
    const h = harness({ start: 'form', moves: { form: { e2: 'done' } }, decide: () => press('e2', 'submit') });
    expect(await h.run).toEqual({ kind: 'confirmed', marker: 'Thank you for applying' });
    expect(h.calls).toMatchObject({ decide: 1, fill: 1, repair: 0, press: 1, arm: 1 });
  });

  it('multi-step: exactly one decision per page', async () => {
    const h = harness({
      start: 'p1',
      moves: { p1: { e1: 'p2' }, p2: { e1: 'p3' }, p3: { e9: 'done' } },
      decide: (p) => (p === 'p3' ? press('e9', 'submit') : press('e1', 'next')),
    });
    expect((await h.run).kind).toBe('confirmed');
    expect(h.calls.decide).toBe(3);
    expect(h.calls.repair).toBe(0);
  });

  it('repair is called only after a fill actually failed', async () => {
    const h = harness({ start: 'form', moves: { form: { e2: 'done' } }, decide: () => press('e2', 'submit'), fails: [['Phone (the page changed it)']] });
    expect((await h.run).kind).toBe('confirmed');
    expect(h.calls.repair).toBe(1);
  });

  it('a field still failing after repair blocks the press and is named', async () => {
    const h = harness({ start: 'form', decide: () => press('e1', 'next'), fails: [['Phone']], repaired: ['Phone (the page rejected it)'] });
    expect(await h.run).toEqual({ kind: 'needs-user', why: 'Required fields are empty. Still needed: Phone (the page rejected it)' });
    expect(h.calls.press).toBe(0);
  });

  it('a required field the profile cannot answer stops before Next', async () => {
    const h = harness({ start: 'form', decide: () => ({ ...press('e1', 'next'), missing: ['Salary (not in your profile)'] }) });
    expect((await h.run).kind).toBe('needs-user');
    expect(h.calls.press).toBe(0);
  });

  it('an unchanged page is never decided or filled again', async () => {
    const h = harness({ start: 'stuck', decide: () => press('e1', 'next') }); // pressing does nothing
    expect(await h.run).toEqual({ kind: 'needs-user', why: 'Pressing “e1” did not move the page.' });
    expect(h.calls).toMatchObject({ decide: 1, fill: 1, press: 1 });
  });

  it('wait: no new AI call until the page changes', async () => {
    const h = harness({ start: 'loading', decide: () => ({ action: 'wait' }) });
    expect((await h.run).kind).toBe('needs-user');
    expect(h.calls.decide).toBe(1);
  });

  it('autoSubmit off: a complete form is armed and handed to the seeker, never pressed', async () => {
    const h = harness({ start: 'form', autoSubmit: false, decide: () => ({ action: 'ask', intent: 'submit', reason: 'Ready for you to submit.' }) });
    expect(await h.run).toEqual({ kind: 'ready' });
    expect(h.calls).toMatchObject({ arm: 1, press: 0 });
  });

  it('autoSubmit off but a gap left: the seeker is asked, nothing armed', async () => {
    const h = harness({ start: 'form', autoSubmit: false, decide: () => ({ action: 'ask', intent: 'submit', reason: 'Some fields are still empty.', missing: ['Salary'] }) });
    expect((await h.run).kind).toBe('needs-user');
    expect(h.calls.arm).toBe(0);
  });

  it('Submit is pressed once; no proof means unconfirmed, never a resend', async () => {
    const h = harness({ start: 'form', moves: { form: { e2: 'after' } }, decide: () => press('e2', 'submit') });
    expect(await h.run).toEqual({ kind: 'unconfirmed' });
    expect(h.calls.press).toBe(1);
  });

  it('fields revealed by filling (a city after the country) get their own decision before any move', async () => {
    const h = harness({ start: 'form', moves: { form: { e2: 'done' } }, decide: () => press('e2', 'submit'), reveals: 1 });
    expect((await h.run).kind).toBe('confirmed');
    expect(h.calls).toMatchObject({ decide: 2, fill: 2, press: 1 });
  });

  it('a page still loading is never decided: the decision waits until two looks agree', async () => {
    const h = harness({ start: 'form', moves: { form: { e2: 'done' } }, decide: () => press('e2', 'submit'), loadingLooks: 3 });
    expect((await h.run).kind).toBe('confirmed');
    expect(h.calls.decide).toBe(1);
  });

  it('a job listing: Apply opens the form, then the form is decided', async () => {
    const h = harness({
      start: 'listing',
      moves: { listing: { e5: 'form' }, form: { e2: 'done' } },
      decide: (p) => (p === 'listing' ? press('e5', 'open_apply') : press('e2', 'submit')),
    });
    expect((await h.run).kind).toBe('confirmed');
    expect(h.calls.decide).toBe(2);
  });
});

describe('after Submit, the page says it in its own words', () => {
  const run = (o: { text: string; read: Partial<Decided> }) => {
    let n = 0;
    const calls = { press: 0, decide: 0 };
    return { calls, run: runAiApply({
      look: async () => ({ sig: 'p' + n, confirmed: null, text: o.text }),
      decide: async () => (calls.decide++, calls.decide === 1 ? { action: 'press', ref: 'e2', intent: 'submit', reason: '', skip_reason: null, missing: [], label: 'Submit' } : { action: 'wait', ref: null, intent: null, reason: '', skip_reason: null, missing: [], ...o.read }),
      fill: async () => ({ failed: [], revealed: false }),
      repair: async () => [],
      press: async () => (calls.press++, n++, { clicked: true }),
      arm: async () => undefined,
      afterSubmit: async () => ({ errors: [] }),
      autoSubmit: true,
      sleep: async () => undefined,
    }) };
  };
  it('a thank-you the patterns do not know: the AI quotes it, the quote is on the page -> confirmed', async () => {
    const h = run({ text: 'Great news. We have your application on file and will be in touch.', read: { action: 'done', reason: 'We have your application on file' } });
    expect(await h.run).toEqual({ kind: 'confirmed', marker: 'page:We have your application on file' });
    expect(h.calls.press).toBe(1);
  });
  it('"already submitted" -> skipped as already applied, never pressed again', async () => {
    const h = run({ text: 'Your application was already submitted. We received your previous application on October 19, 2026.', read: { action: 'skip', skip_reason: 'already_applied', reason: 'Your application was already submitted' } });
    expect(await h.run).toMatchObject({ kind: 'skip', reason: 'already_applied' });
    expect(h.calls.press).toBe(1);
  });
  it('a quote that is NOT on the page proves nothing: unconfirmed', async () => {
    const h = run({ text: 'Fullstack Developer. Submit your application.', read: { action: 'done', reason: 'Thank you for applying' } });
    expect(await h.run).toEqual({ kind: 'unconfirmed' });
    expect(h.calls.press).toBe(1);
  });
});

describe('after a Submit that nothing proved', () => {
  const dead = (o: { errors: string[]; repaired: string[]; confirmSecond?: boolean }) => {
    let submits = 0;
    let page = 'form';
    const calls = { press: 0, repair: 0, afterSubmit: 0, decide: 0 };
    const run = runAiApply({
      look: async () => ({ sig: page + submits, confirmed: page === 'done' ? 'Thank you' : null }),
      decide: async () => (calls.decide++, { action: 'press', ref: 'e2', intent: 'submit', reason: '', skip_reason: null, missing: [], label: 'Submit' }),
      fill: async () => ({ failed: [], revealed: false }),
      repair: async () => (calls.repair++, o.repaired),
      press: async () => {
        calls.press++;
        submits++;
        if (submits === 2 && o.confirmSecond) page = 'done';
        return { clicked: true };
      },
      arm: async () => undefined,
      afterSubmit: async () => (calls.afterSubmit++, { errors: o.errors }),
      autoSubmit: true,
      sleep: async () => undefined,
    });
    return { run, calls };
  };

  it('the page shows field errors and the repair fixes one: the page is decided again and Submit pressed a second time', async () => {
    const h = dead({ errors: ['Location: This field is required.'], repaired: [], confirmSecond: true });
    expect(await h.run).toEqual({ kind: 'confirmed', marker: 'Thank you' });
    expect(h.calls).toMatchObject({ press: 2, repair: 1, afterSubmit: 1, decide: 3 }); // decide, read the page after the dead Submit, decide again after the repair
  });

  it('field errors but nothing could be repaired: the seeker is told what the page rejected, no second press', async () => {
    const h = dead({ errors: ['Location: This field is required.'], repaired: ['Location (no matching choice)'] });
    const r = await h.run;
    expect(r.kind).toBe('needs-user');
    expect((r as { why: string }).why).toContain('This field is required');
    expect(h.calls.press).toBe(1);
  });

  it('a human check (captcha) put up on Submit: the seeker is asked, never a second press', async () => {
    let submits = 0; const calls = { press: 0 };
    const r = await runAiApply({
      look: async () => ({ sig: 'form' + submits, confirmed: null }),
      decide: async () => ({ action: 'press', ref: 'e2', intent: 'submit', reason: '', skip_reason: null, missing: [], label: 'Submit' }),
      fill: async () => ({ failed: [], revealed: false }), repair: async () => [],
      press: async () => (calls.press++, submits++, { clicked: true }), arm: async () => undefined,
      afterSubmit: async () => ({ errors: [], captcha: true }), autoSubmit: true, sleep: async () => undefined,
    });
    expect(r.kind).toBe('needs-user'); expect((r as { why: string }).why).toMatch(/captcha/i); expect(calls.press).toBe(1);
  });

  it('the page says it refused the submission (spam filter): the seeker is told in the page\'s words, no second press', async () => {
    let submits = 0; const calls = { press: 0 };
    const r = await runAiApply({
      look: async () => ({ sig: 'form' + submits, confirmed: null }),
      decide: async () => ({ action: 'press', ref: 'e2', intent: 'submit', reason: '', skip_reason: null, missing: [], label: 'Submit' }),
      fill: async () => ({ failed: [], revealed: false }), repair: async () => [],
      press: async () => (calls.press++, submits++, { clicked: true }), arm: async () => undefined,
      afterSubmit: async () => ({ errors: [], refused: 'Your application submission was flagged as possible spam.' }), autoSubmit: true, sleep: async () => undefined,
    });
    expect(r).toMatchObject({ kind: 'needs-user' }); expect((r as { why: string }).why).toContain('flagged as possible spam'); expect(calls.press).toBe(1);
  });

  it('no field error on the page: unconfirmed, never a resend', async () => {
    const h = dead({ errors: [], repaired: [] });
    expect(await h.run).toEqual({ kind: 'unconfirmed' });
    expect(h.calls).toMatchObject({ press: 1, repair: 0, afterSubmit: 1 });
  });

  it('never a third press: errors again after the second Submit end as unconfirmed', async () => {
    const h = dead({ errors: ['Location: This field is required.'], repaired: [] });
    expect(await h.run).toEqual({ kind: 'unconfirmed' });
    expect(h.calls.press).toBe(2);
  });
});
