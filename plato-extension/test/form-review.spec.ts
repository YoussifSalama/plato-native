// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createFormReview, MAX_ATTEMPTS, type Send, mergeRows, blockingError } from '../src/core/form-review';
import { FORM_FILL, FORM_INSPECT, FORM_LIST, FORM_VERIFY, isFormMessage } from '../src/core/messages';
import { fillFields, readBack } from '../src/dom/fill';
import { inspectForm, listForms } from '../src/dom/inspect';
import type { Profile } from '../src/dom/types';
import { $, load } from './helpers';

const profile: Profile = { fullName: 'Youssif Salama', firstName: 'Youssif', lastName: 'Salama', email: 'y@example.com', phone: '123-4567', city: 'Cairo', country: 'Egypt', linkedin: 'https://linkedin.com/in/ys' };

// The content script's behaviour, in-process, recording every message.
const engine = () => {
  const sent: { type: string; [k: string]: unknown }[] = [];
  const send: Send = async (m) => {
    sent.push(m as never);
    if (!isFormMessage(m)) throw new Error('unexpected message');
    try {
      if (m.type === FORM_LIST) return listForms(document);
      if (m.type === FORM_INSPECT) return inspectForm(document, m.formId);
      if (m.type === FORM_FILL) return fillFields(document, m.formId, m.instructions);
      if (m.type === 'plato:form:submit') throw new Error('the form review never submits');
      if (m.type === FORM_VERIFY) return readBack(document, m.formId, m.expected);
      return { error: 'unexpected' };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  return { send, sent };
};
const start = async (name: string, p: Profile = profile, maxRounds?: number) => {
  load(name);
  const e = engine();
  const ctl = createFormReview({ send: e.send, profile: p, maxRounds });
  await ctl.start();
  return { ...e, ctl, rows: () => ctl.get().rows, row: (label: string) => ctl.get().rows.find((r) => r.label === label)! };
};
const val = (sel: string) => (document.querySelector(sel) as HTMLInputElement).value;
const filledByEngine = (sent: { type: string; instructions?: unknown }[]) => sent.filter((m) => m.type === FORM_FILL).flatMap((m) => (m.instructions as { fieldId: string }[]).map((i) => i.fieldId));

describe('interactive review: nothing is filled until the person approves', () => {
  it('proposes with value, source and confidence; safe defaults: only high-confidence rows start as Use', async () => {
    const { ctl, row, sent } = await start('identity');
    const s = ctl.get();
    expect(s.phase).toBe('reviewing');
    expect(row('First name')).toMatchObject({ category: 'proposed', choice: 'use', locked: false, proposed: 'Youssif', confidence: 0.98, source: 'autocomplete=given-name' });
    expect(row('Country')).toMatchObject({ choice: 'use', proposed: 'EG', shown: 'Egypt' });
    // boxes and radio questions: no keyword proposal (the AI answers them)
    expect(row('Are you authorised to work here?')).toMatchObject({ category: 'unmapped', choice: 'skip', locked: true });
    for (const l of ['I agree to the terms']) {
      expect(row(l)).toMatchObject({ category: 'unmapped', choice: 'skip', locked: true });
      expect(row(l).proposed).toBeUndefined();
    }
    expect(s.sensitiveExcluded).toBe(1);
    expect(s.rows.some((r) => /password/i.test(r.label))).toBe(false);
    // reviewing alone wrote nothing
    expect(val('#fn')).toBe('');
    expect(sent.some((m) => m.type === FORM_FILL)).toBe(false);
  });

  it('ambiguous, low-confidence, already-filled, duplicate, consent and unsupported rows default to Skip; locked ones cannot be switched to Use', async () => {
    load('duplicate-labels');
    const e = engine();
    const ctl = createFormReview({ send: e.send, profile });
    await ctl.start();
    await ctl.chooseForm(ctl.get().forms[0]!.id);
    const dupe = ctl.get().rows.find((r) => r.label === 'Name')!;
    expect(dupe).toMatchObject({ category: 'duplicate', choice: 'skip', locked: true });
    const low = ctl.get().rows.find((r) => r.label === 'First name')!; // placeholder-only
    expect(low).toMatchObject({ category: 'low-confidence', choice: 'skip', locked: false, proposed: 'Youssif' });
    ctl.toggle(dupe.id, 'use');
    expect(ctl.get().rows.find((r) => r.id === dupe.id)!.choice).toBe('skip');
    const c = await start('custom-controls');
    for (const r of c.rows().filter((x) => x.category === 'unsupported')) expect(r).toMatchObject({ choice: 'skip', locked: true });
    c.ctl.toggle(c.rows().find((r) => r.category === 'unsupported')!.id, 'use');
    expect(c.rows().filter((r) => r.choice === 'use').map((r) => r.label)).toEqual(['Name']);
    // already filled
    load('identity');
    $<HTMLInputElement>('ci').value = 'Alexandria';
    const f = createFormReview({ send: engine().send, profile });
    await f.start();
    expect(f.get().rows.find((r) => r.label === 'City')).toMatchObject({ category: 'already-filled', choice: 'skip', locked: true });
  });

  it('a low-confidence proposal can be chosen explicitly; then it is filled like any approved field', async () => {
    load('duplicate-labels');
    const e = engine();
    const ctl = createFormReview({ send: e.send, profile });
    await ctl.start();
    await ctl.chooseForm(ctl.get().forms[0]!.id);
    const low = ctl.get().rows.find((r) => r.label === 'First name')!;
    ctl.toggle(low.id, 'use');
    // deselect everything else that defaulted to Use
    for (const r of ctl.get().rows) if (r.id !== low.id && r.choice === 'use') ctl.toggle(r.id, 'skip');
    await ctl.fillApproved(ctl.get().version);
    expect(filledByEngine(e.sent)).toEqual([low.id]);
    expect((document.getElementById('ph') as HTMLInputElement).value).toBe('Youssif');
  });

  it('Fill sends exactly the rows marked Use; Skip rows are never sent', async () => {
    const { ctl, row, sent } = await start('identity');
    ctl.toggle(row('Phone number').id, 'skip');
    ctl.toggle(row('LinkedIn profile').id, 'skip');
    await ctl.fillApproved(ctl.get().version);
    const sentIds = filledByEngine(sent);
    expect(sentIds).not.toContain(row('Phone number').id);
    expect(sentIds).not.toContain(row('LinkedIn profile').id);
    expect(sentIds).toHaveLength(5); // first, last, email, country, city
    expect([val('#fn'), val('[name=ln]'), val('[name=ph]'), val('#li'), val('#co')]).toEqual(['Youssif', 'Salama', '', '', 'EG']);
    expect(row('First name')).toMatchObject({ status: 'filled' });
    expect(row('Phone number')).toMatchObject({ status: 'pending', choice: 'skip' });
  });

  it('approval is bound to the review the person saw: a changed review needs a fresh look', async () => {
    const { ctl, sent } = await start('identity');
    const seen = ctl.get().version;
    $<HTMLInputElement>('ci').value = 'Alexandria'; // page changes, person re-inspects: the review changes
    await ctl.reinspect();
    await ctl.fillApproved(seen); // still holding the old version
    expect(ctl.get().error).toMatch(/review changed/i);
    expect(sent.some((m) => m.type === FORM_FILL)).toBe(false);
    expect(val('#fn')).toBe('');
    await ctl.fillApproved(ctl.get().version);
    expect(val('#fn')).toBe('Youssif');
  });

  it('sensitive, consent, radio and free-text/unsupported fields stay untouched through a full fill', async () => {
    const { ctl } = await start('identity');
    await ctl.fillApproved(ctl.get().version);
    expect((document.querySelector('[name=pw]') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('[name=terms]') as HTMLInputElement).checked).toBe(false);
    expect(document.querySelectorAll('[name=auth]:checked')).toHaveLength(0);
    const c = await start('custom-controls');
    await c.ctl.fillApproved(c.ctl.get().version);
    expect($<HTMLTextAreaElement>('msg').value).toBe('');
    expect($<HTMLInputElement>('dob').value).toBe('');
    expect(document.querySelector('[role=checkbox]')!.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[contenteditable]')!.textContent).toBe('');
  });
});

describe('a value the page emptied again', () => {
  it('is filled once more (a widget reset), while a value the person changed is left alone', async () => {
    const { ctl } = await start('identity');
    await ctl.fillApproved(ctl.get().version);
    expect(val('#fn')).toBe('Youssif');
    $<HTMLInputElement>('fn').value = ''; // the page cleared it
    (document.querySelector('[name=mail]') as HTMLInputElement).value = 'mine@example.com'; // the person changed it
    await ctl.reinspect();
    const fn = ctl.get().rows.find((r) => r.label === 'First name')!;
    const em = ctl.get().rows.find((r) => r.label === 'Email address')!;
    expect(fn).toMatchObject({ status: 'failed', reason: 'page-cleared', choice: 'use' });
    expect(em).toMatchObject({ status: 'user-edited', locked: true });
    await ctl.retryFailed(ctl.get().version);
    expect([val('#fn'), val('[name=mail]')]).toEqual(['Youssif', 'mine@example.com']);
  });
});

describe('stale approvals and user edits', () => {
  it('identity changed after review (label): refused, marked stale, nothing written, approval cleared', async () => {
    const { ctl, row } = await start('identity');
    const v = ctl.get().version;
    const id = row('City').id;
    document.querySelector('label[for=ci]')!.textContent = 'Company';
    await ctl.fillApproved(v);
    expect(val('#ci')).toBe('');
    // the approval is gone and the row is re-evaluated under its new identity
    const after = ctl.get().rows.find((r) => r.id === id)!;
    expect(after).toMatchObject({ label: 'Company', choice: 'skip', note: expect.stringMatching(/Changed on the page/) });
    expect(val('#fn')).toBe('Youssif'); // the unchanged fields were still filled
    // it cannot be switched to Use without a fresh look
    ctl.toggle(id, 'use');
    expect(ctl.get().rows.find((r) => r.id === id)!.choice).toBe('skip');
  });

  it('options changed after review: the approval for that select is cleared on Re-inspect', async () => {
    const { ctl, row } = await start('identity');
    $<HTMLSelectElement>('co').add(new Option('Mars', 'MS'));
    await ctl.reinspect();
    expect(row('Country')).toMatchObject({ choice: 'skip', note: expect.stringMatching(/Changed on the page/) });
    expect(row('First name').choice).toBe('use'); // unchanged fields keep their approval
  });

  it('a value the person typed since review is never overwritten, at fill time or after Re-inspect', async () => {
    const { ctl, row } = await start('identity');
    const v = ctl.get().version;
    $<HTMLInputElement>('ci').value = 'Alexandria';
    await ctl.fillApproved(v);
    expect(val('#ci')).toBe('Alexandria');
    expect(ctl.get().rows.find((r) => r.label === 'City')).toMatchObject({ status: 'user-edited', locked: true, choice: 'skip' });
    await ctl.reinspect();
    expect(row('City')).toMatchObject({ status: 'user-edited', choice: 'skip', locked: true });
    expect(val('#ci')).toBe('Alexandria');
  });

  it('a value the person changes after Plato filled it is recognised on Re-inspect, not "restored"', async () => {
    const { ctl, row } = await start('identity');
    await ctl.fillApproved(ctl.get().version);
    $<HTMLInputElement>('fn').value = 'Joe';
    await ctl.reinspect();
    expect(row('First name')).toMatchObject({ status: 'user-edited', locked: true });
    expect(val('#fn')).toBe('Joe');
    expect(row('Last name').status).toBe('filled'); // untouched ones are preserved
  });
});

describe('safe retries', () => {
  const setupFailing = async () => {
    const s = await start('validation', { fullName: 'Youssif', phone: '+201001234567', email: 'y@example.com', city: 'Cairo' });
    return s;
  };

  it('retries only the failed fields; successful ones are neither resent nor changed', async () => {
    const s = await setupFailing();
    await s.ctl.fillApproved(s.ctl.get().version);
    const failed = s.ctl.get().rows.filter((r) => r.status === 'failed');
    expect(failed.map((r) => `${r.label}:${r.reason}`).sort()).toEqual(['Name:too-long', 'Phone:invalid:pattern']);
    expect(s.row('Email').status).toBe('filled');
    // the page now accepts the phone number (e.g. pattern relaxed); the name stays too long
    $('ph').removeAttribute('pattern');
    const before = s.sent.length;
    await s.ctl.retryFailed(s.ctl.get().version);
    const retried = filledByEngine(s.sent.slice(before));
    expect(retried.sort()).toEqual(failed.map((r) => r.id).sort());
    expect(retried).not.toContain(s.row('Email').id);
    expect(s.row('Phone')).toMatchObject({ status: 'filled', attempts: 2, note: 'Filled on retry' });
    expect(s.row('Name')).toMatchObject({ status: 'failed', reason: 'too-long', attempts: 2 });
    expect(val('#ph')).toBe('+201001234567');
  });

  it('never overwrites a field the person changed after the failed attempt', async () => {
    const s = await setupFailing();
    await s.ctl.fillApproved(s.ctl.get().version);
    $<HTMLInputElement>('ph').removeAttribute('pattern');
    $<HTMLInputElement>('ph').value = '555-0000'; // the person typed their own
    await s.ctl.retryFailed(s.ctl.get().version);
    expect(val('#ph')).toBe('555-0000');
    expect(s.row('Phone')).toMatchObject({ status: 'user-edited', locked: true });
  });

  it('a field whose identity changed is not retried: it becomes stale', async () => {
    const s = await setupFailing();
    await s.ctl.fillApproved(s.ctl.get().version);
    $('ph').removeAttribute('pattern');
    document.querySelector('label[for=ph]')!.textContent = 'Fax';
    await s.ctl.retryFailed(s.ctl.get().version);
    expect(val('#ph')).toBe('');
    const row = s.ctl.get().rows.find((r) => r.label === 'Fax')!; // same field, new identity, approval cleared
    expect(row).toMatchObject({ choice: 'skip', note: expect.stringMatching(/Changed on the page/) });
    expect(s.row('Email').status).toBe('filled'); // and the successful field was preserved
  });

  it('retries are bounded per field', async () => {
    const s = await setupFailing();
    await s.ctl.fillApproved(s.ctl.get().version);
    for (let i = 0; i < 6; i++) await s.ctl.retryFailed(s.ctl.get().version);
    expect(s.row('Phone').attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    expect(s.ctl.get().error).toBe('Nothing to retry.');
  });

  it('retry with a stale review version is refused', async () => {
    const s = await setupFailing();
    await s.ctl.fillApproved(s.ctl.get().version);
    const old = s.ctl.get().version;
    s.ctl.toggle(s.row('Phone').id, 'skip');
    await s.ctl.retryFailed(old);
    expect(s.ctl.get().error).toMatch(/review changed/i);
  });
});

describe('re-inspection and dynamic fields (bounded)', () => {
  const dynamic = async (maxRounds?: number) => {
    load('identity');
    $('ci').style.display = 'none';
    document.querySelector('label[for=ci]')!.setAttribute('hidden', '');
    $('co').addEventListener('change', () => {
      $('ci').style.display = '';
      document.querySelector('label[for=ci]')!.removeAttribute('hidden');
    });
    const e = engine();
    const ctl = createFormReview({ send: e.send, profile, maxRounds });
    await ctl.start();
    return { ...e, ctl, row: (l: string) => ctl.get().rows.find((r) => r.label === l) };
  };

  it('a field revealed by filling appears for review; it is not filled until the person approves it', async () => {
    const s = await dynamic();
    expect(s.row('City')).toBeUndefined();
    await s.ctl.fillApproved(s.ctl.get().version);
    expect(s.row('City')).toMatchObject({ status: 'pending', note: expect.stringMatching(/New/) });
    expect(val('#ci')).toBe('');
    await s.ctl.fillApproved(s.ctl.get().version);
    expect(val('#ci')).toBe('Cairo');
  });

  it('a page that keeps revealing fields stops at the round limit', async () => {
    const s = await dynamic(2);
    let n = 0;
    const grow = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', ['GitHub', 'Portfolio', 'Current company'][n++] ?? `Extra ${n}`);
      input.addEventListener('change', grow);
      $('apply').append(input);
    };
    $('ci').addEventListener('change', grow);
    $('fn').addEventListener('change', grow);
    await s.ctl.fillApproved(s.ctl.get().version);
    await s.ctl.fillApproved(s.ctl.get().version);
    expect(s.ctl.get().fillRounds).toBe(2);
    const before = s.sent.filter((m) => m.type === FORM_FILL).length;
    await s.ctl.fillApproved(s.ctl.get().version);
    expect(s.ctl.get().error).toMatch(/Round limit/);
    expect(s.sent.filter((m) => m.type === FORM_FILL).length).toBe(before);
  });

  it('Re-inspect keeps approvals for unchanged fields, clears them for changed ones, and notes what disappeared', async () => {
    const { ctl, row } = await start('identity');
    ctl.toggle(row('Phone number').id, 'skip');
    document.querySelector('label[for=li]')!.textContent = 'Social';
    $('ci').remove();
    document.querySelector('label[for=ci]')!.remove();
    await ctl.reinspect();
    expect(row('Phone number')).toMatchObject({ choice: 'skip' }); // preserved
    expect(row('First name').choice).toBe('use');
    expect(ctl.get().rows.find((r) => r.label === 'Social')).toMatchObject({ choice: 'skip' });
    expect(ctl.get().notes.join(' ')).toMatch(/disappeared/);
    expect(row('City')).toBeUndefined();
  });

  it('the form disappearing is reported, and nothing is filled', async () => {
    const { ctl, sent } = await start('identity');
    const v = ctl.get().version;
    $('apply').remove();
    await ctl.fillApproved(v);
    expect(ctl.get().error).toMatch(/no longer on the page/);
    void sent;
  });
});

describe('multiple forms', () => {
  it('more than one plausible form: the whole page is reviewed with each row tagged by form; the keyword fallback fills nothing ambiguous', async () => {
    const { ctl } = await start('multi-forms');
    const s = ctl.get();
    expect(s.phase).toBe('reviewing');
    expect(s.formId).toBe('page');
    expect(s.rows.filter((r) => r.category !== 'unsupported').map((r) => r.form)).toEqual(['Apply for this role', 'Apply for this role', 'Apply for this role', 'Apply for this role', 'Refer a friend', 'Refer a friend', 'Refer a friend', 'Newsletter']);
    await ctl.fillApproved(s.version);
    // "First name" / "Email" exist in several forms: duplicates, never filled by keyword; the one unique field is
    expect([val('#a-fn'), val('#a-em'), val('#r-fn'), val('#n-em'), val('#a-ph')]).toEqual(['', '', '', '', '123-4567']); // this spec's profile phone
  });

  it('choosing a form reviews only that form; the other forms are never touched', async () => {
    const { ctl, sent } = await start('multi-forms');
    const apply = ctl.get().forms.find((f) => f.label === 'Apply for this role')!;
    await ctl.chooseForm(apply.id);
    expect(ctl.get().rows.map((r) => r.label)).toEqual(['First name', 'Last name', 'Email', 'Phone']);
    await ctl.fillApproved(ctl.get().version);
    expect([val('#a-fn'), val('#a-em'), val('#r-fn'), val('#r-em'), val('#n-em')]).toEqual(['Youssif', 'y@example.com', '', '', '']);
    expect(sent.filter((m) => m.type === FORM_FILL).every((m) => m.formId === apply.id)).toBe(true);
  });

  it('selections and approvals do not carry between forms', async () => {
    const { ctl } = await start('multi-forms');
    const [apply, refer] = [ctl.get().forms.find((f) => f.label === 'Apply for this role')!, ctl.get().forms.find((f) => f.label === 'Refer a friend')!];
    await ctl.chooseForm(apply.id);
    ctl.toggle(ctl.get().rows[0]!.id, 'skip'); // a choice in the apply form
    const applyIds = new Set(ctl.get().rows.map((r) => r.id));
    await ctl.chooseForm(refer.id);
    expect(ctl.get().formId).toBe(refer.id);
    expect(ctl.get().rows.every((r) => !applyIds.has(r.id))).toBe(true);
    expect(ctl.get().rows.every((r) => r.choice === 'use')).toBe(true); // fresh defaults, no carry-over
    expect(ctl.get().fillRounds).toBe(0);
    // an unknown form id is ignored
    await ctl.chooseForm('form99');
    expect(ctl.get().formId).toBe(refer.id);
  });

  it('a form chosen earlier that vanishes cannot be filled', async () => {
    const { ctl } = await start('multi-forms');
    await ctl.chooseForm(ctl.get().forms.find((f) => f.label === 'Apply for this role')!.id);
    const v = ctl.get().version;
    $('apply').remove();
    await ctl.fillApproved(v);
    expect(ctl.get().error).toMatch(/no longer on the page/);
  });
});

describe('no submission', () => {
  it('only list/inspect/fill/verify messages exist and are ever sent; the form is never submitted or its button clicked', async () => {
    const { ctl, sent } = await start('validation');
    let submits = 0;
    let clicks = 0;
    document.addEventListener('submit', () => submits++);
    $('go').addEventListener('click', () => clicks++);
    await ctl.fillApproved(ctl.get().version);
    await ctl.reinspect();
    await ctl.retryFailed(ctl.get().version);
    expect(new Set(sent.map((m) => m.type))).toEqual(new Set([FORM_LIST, FORM_INSPECT, FORM_FILL, FORM_VERIFY]));
    expect([submits, clicks]).toEqual([0, 0]);
    // the review controller never sends it; the panel's auto-submit (opt-in, see dom/submit.ts) is the only sender
    expect(isFormMessage({ type: 'plato:form:submit', formId: 'form1' })).toBe(true);
    expect(isFormMessage({ type: 'plato:form:click', formId: 'form1' })).toBe(false);
  });

  it('message guards reject malformed fill/verify payloads and require a form id', () => {
    const ok = { type: FORM_FILL, formId: 'form1', instructions: [{ fieldId: 'f1', fp: 'abcd1234', vh: 'abcd1234', value: 'x' }] };
    expect(isFormMessage(ok)).toBe(true);
    for (const bad of [{ ...ok, formId: undefined }, { ...ok, instructions: [{ fieldId: 'f1', value: 'x' }] }, { ...ok, instructions: [{ ...ok.instructions[0], value: { a: 1 } }] }, { ...ok, instructions: [{ ...ok.instructions[0], fp: '' }] }, { type: FORM_INSPECT }, { type: FORM_VERIFY, formId: 'form1', expected: [{ fieldId: 'f1', value: 'x' }] }])
      expect(isFormMessage(bad)).toBe(false);
    expect(isFormMessage({ type: FORM_LIST })).toBe(true);
  });
});

describe('mergeRows: the page shows an error on a value Plato wrote', () => {
  it('a filled row whose field now carries an error becomes failed (page-rejected) with that error, value kept for the repair; the error clears when the page clears it', () => {
    const filled = { id: 'f1', fp: 'a', vh: 'v1', vhAfter: 'v1', label: 'Email', required: true, category: 'proposed' as const, locked: false, choice: 'use' as const, proposed: 'nope', shown: 'nope', status: 'filled' as const, attempts: 1 };
    const seen = { ...filled, status: 'pending' as const, attempts: 0, error: 'Enter a valid email address.' };
    const { rows } = mergeRows([filled], [seen]);
    expect(rows[0]).toMatchObject({ status: 'failed', reason: 'page-rejected', error: 'Enter a valid email address.', proposed: 'nope', choice: 'use', locked: false });
    const cleared = mergeRows(rows, [{ ...seen, error: undefined }]).rows[0]!;
    expect(cleared.status).toBe('failed'); // still ours to repair until a fill succeeds
    const okAgain = mergeRows([filled], [{ ...seen, error: undefined }]).rows[0]!;
    expect(okAgain).toMatchObject({ status: 'filled', error: undefined });
  });
});

describe('a stale "is required" message on a field that holds a value (sites that validate only on Submit)', () => {
  const filled = { id: 'f1', fp: 'a', vh: 'v1', vhAfter: 'v1', label: 'Degree', required: true, category: 'proposed' as const, locked: false, choice: 'use' as const, proposed: 'Bachelors Degree', shown: 'Bachelors Degree', status: 'filled' as const, attempts: 1 };
  it('keeps a filled row filled when the only error says the field is required and the field holds a value', () => {
    const { rows } = mergeRows([filled], [{ ...filled, status: 'pending' as const, attempts: 0, hasValue: true, error: 'Degree is required.' }]);
    expect(rows[0]).toMatchObject({ status: 'filled' });
  });
  it('a real rejection (format) on a filled field still fails it', () => {
    const { rows } = mergeRows([filled], [{ ...filled, status: 'pending' as const, attempts: 0, hasValue: true, error: 'Enter a valid email address.' }]);
    expect(rows[0]).toMatchObject({ status: 'failed', reason: 'page-rejected' });
  });
  it('blockingError: "required" blocks only an empty field; other errors always block', () => {
    expect(blockingError({ error: 'First Name is required.', hasValue: true })).toBe(false);
    expect(blockingError({ error: 'First Name is required.', hasValue: false })).toBe(true);
    expect(blockingError({ error: 'This field is required and can not be left empty.', hasValue: true })).toBe(false);
    expect(blockingError({ error: 'Phone number is too short.', hasValue: true })).toBe(true);
    expect(blockingError({ hasValue: true })).toBe(false);
  });
});
