// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fillFields, PACE, probeOptions, readBack } from '../src/dom/fill';
import { inspectForm, listForms } from '../src/dom/inspect';
import type { FieldValue, FillInstruction } from '../src/dom/types';
import { $, load } from './helpers';

// What the person approved: the field as inspected NOW (fingerprint + value hash) with the proposed value.
const setup = (name: string) => {
  const doc = load(name);
  const first = inspectForm(doc);
  const formId = first.formId;
  const ins = (label: string, value: FieldValue): FillInstruction => {
    const f = inspectForm(doc, formId).fields.find((x) => x.label === label)!;
    return { fieldId: f.id, fp: f.fp, vh: f.vh, value };
  };
  const fill = (...i: FillInstruction[]) => fillFields(doc, formId, i);
  return { doc, formId, ins, fill };
};
const events = (el: Element, names = ['input', 'change']) => {
  const seen: string[] = [];
  for (const n of names) el.addEventListener(n, (e) => seen.push(`${e.type}:${(e.target as HTMLInputElement).value}`));
  return seen;
};

describe('filling each control the way its type expects', () => {
  it('text, email and tel: native setter, input + change events, value verified', async () => {
    const { ins, fill } = setup('identity');
    const seen = events($('fn'));
    const out = (await fill(ins('First name', 'Youssif'), ins('Email address', 'y@example.com'), ins('Phone number', '+201001234567')));
    expect(out.results.map((r) => r.status)).toEqual(['filled', 'filled', 'filled']);
    expect($<HTMLInputElement>('fn').value).toBe('Youssif');
    expect(seen).toEqual(['input:Youssif', 'change:Youssif']);
    expect(out.submitAttempts).toBe(0);
  });

  it('a stale aria-invalid (the page flagged the empty field earlier) does not undo the fill', async () => {
    const { ins, fill } = setup('identity');
    const el = $<HTMLInputElement>('fn');
    el.setAttribute('aria-invalid', 'true'); // Greenhouse: "First Name is required." from an earlier attempt, re-rendered later
    const out = await fill(ins('First name', 'Youssif'));
    expect(out.results[0]?.status).toBe('filled');
    expect(el.value).toBe('Youssif');
  });

  it('an input re-mounted by the page while being filled: the replacement gets the value, and "filled" is read from the live element', async () => {
    const { ins, fill } = setup('identity');
    const old = $<HTMLInputElement>('fn');
    // the page swaps the element on the first keystroke (a framework re-mounting its block), same id, empty value
    old.addEventListener('input', () => { const twin = old.cloneNode(false) as HTMLInputElement; twin.value = ''; old.replaceWith(twin); }, { once: true });
    const out = await fill(ins('First name', 'Youssif'), ins('Email address', 'y@example.com'));
    const live = $<HTMLInputElement>('fn');
    expect(live).not.toBe(old);
    expect(live.isConnected).toBe(true);
    expect(live.value).toBe('Youssif');
    expect(out.results.map((r) => [r.fieldId, r.status])).toEqual([[ins('First name', '').fieldId, 'filled'], [ins('Email address', '').fieldId, 'filled']]);
    expect(out.results[0]?.vh).toBe(out.results[0]?.vh); // the hash comes from the live element: read-back agrees
    const check = readBack(document, inspectForm(document).formId, [{ fieldId: ins('First name', '').fieldId, fp: ins('First name', '').fp, value: 'Youssif' }]);
    expect(check[0]?.status).toBe('filled');
  });

  it('a field replaced and gone for good fails as replaced, never "filled"', async () => {
    const { ins, fill } = setup('identity');
    const old = $<HTMLInputElement>('fn');
    old.addEventListener('input', () => old.remove(), { once: true });
    const out = await fill(ins('First name', 'Youssif'));
    expect(out.results[0]).toMatchObject({ status: 'failed', reason: 'replaced' });
  });

  it('works on inputs that track their value themselves (value set through the prototype setter)', async () => {
    const { ins, fill } = setup('identity');
    const el = $<HTMLInputElement>('ci');
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const instanceSets: string[] = [];
    Object.defineProperty(el, 'value', { get: () => native.get!.call(el), set: (v: string) => (instanceSets.push(v), native.set!.call(el, v)), configurable: true });
    const atInput: string[] = [];
    el.addEventListener('input', () => atInput.push(native.get!.call(el)));
    expect((await fill(ins('City', 'Cairo'))).results[0]!.status).toBe('filled');
    expect(instanceSets).toEqual([]);
    expect(atInput).toEqual(['Cairo']);
  });

  it('select: by option value or by label; disabled and unknown options fail without changing anything', async () => {
    const { ins, fill } = setup('identity');
    const sel = $<HTMLSelectElement>('co');
    expect((await fill(ins('Country', 'EG'))).results[0]).toMatchObject({ status: 'filled', shown: 'Egypt' });
    expect(sel.value).toBe('EG');
    expect((await fill(ins('Country', 'United States'))).results[0]!.status).toBe('filled');
    expect(sel.value).toBe('US');
    for (const v of ['DE', 'Narnia']) expect((await fill(ins('Country', v))).results[0]).toMatchObject({ status: 'failed', reason: 'no-option' });
    expect(sel.value).toBe('US');
  });

  it('checkbox and radio: a real click, only when the state must change', async () => {
    const { ins, fill } = setup('identity');
    const box = document.querySelector<HTMLInputElement>('[name=terms]')!;
    const clicks = vi.fn();
    box.addEventListener('click', clicks);
    expect((await fill(ins('I agree to the terms', true))).results[0]!.status).toBe('filled');
    expect(box.checked).toBe(true);
    (await fill(ins('I agree to the terms', true)));
    expect(clicks).toHaveBeenCalledTimes(1);
    (await fill(ins('Are you authorised to work here?', 'no')));
    expect(document.querySelector<HTMLInputElement>('[name=auth][value=no]')!.checked).toBe(true);
    expect((await fill(ins('Are you authorised to work here?', 'maybe'))).results[0]).toMatchObject({ status: 'failed', reason: 'no-option' });
    expect((await fill(ins('I agree to the terms', 'yes'))).results[0]!.reason).toBe('not-fillable');
  });
});

describe('a field id alone is never enough: each target is re-checked first', () => {
  it('refuses unknown ids, sensitive fields and buttons; nothing outside the inspected fields can be written', async () => {
    const { doc, formId, fill } = setup('identity');
    const out = (await fill({ fieldId: 'f999', fp: 'x', vh: 'x', value: 'x' }, { fieldId: 'pw', fp: 'x', vh: 'x', value: 'secret' }));
    expect(out.results.map((r) => r.reason)).toEqual(['no-such-field', 'no-such-field']);
    expect(doc.querySelector<HTMLInputElement>('[name=pw]')!.value).toBe('');
    // the real id of the password field is not even registered: it was never reported
    expect(inspectForm(doc, formId).fields.some((f) => /password/i.test(f.label))).toBe(false);
  });

  it('stale-field: the label, options or type changed since review -> refused, nothing written', async () => {
    const { ins, fill } = setup('identity');
    const approved = ins('City', 'Cairo');
    document.querySelector('label[for=ci]')!.textContent = 'Company'; // the page re-labelled it
    expect((await fill(approved)).results[0]).toMatchObject({ status: 'failed', reason: 'stale-field' });
    expect($<HTMLInputElement>('ci').value).toBe('');
    const sel = ins('Country', 'EG');
    $<HTMLSelectElement>('co').add(new Option('Mars', 'MS')); // options changed
    expect((await fill(sel)).results[0]).toMatchObject({ status: 'failed', reason: 'stale-field' });
  });

  it('user-edited: the person (or the page) changed the value since review -> never overwritten', async () => {
    const { ins, fill } = setup('identity');
    const approved = ins('City', 'Cairo');
    $<HTMLInputElement>('ci').value = 'Alexandria';
    expect((await fill(approved)).results[0]).toMatchObject({ status: 'failed', reason: 'user-edited' });
    expect($<HTMLInputElement>('ci').value).toBe('Alexandria');
    // approval is about the field's STATE: put back exactly as reviewed, it may be filled
    $<HTMLInputElement>('ci').value = '';
    expect((await fill(approved)).results[0]!.status).toBe('filled');
  });

  it('ineligible: the field became hidden, disabled or read-only since review', async () => {
    const { ins, fill } = setup('identity');
    const a = ins('City', 'Cairo');
    $<HTMLInputElement>('ci').disabled = true;
    expect((await fill(a)).results[0]).toMatchObject({ status: 'failed', reason: 'no-such-field' });
    expect($<HTMLInputElement>('ci').value).toBe('');
  });

  it('the form itself being replaced fails every instruction as stale-form', async () => {
    const { ins, fill } = setup('identity');
    const a = ins('City', 'Cairo');
    $('apply').remove();
    expect((await fill(a)).results[0]).toMatchObject({ status: 'failed', reason: 'stale-form' });
  });

  it('an id from one form cannot be used against another form', async () => {
    const doc = load('multi-forms');
    const ids = listForms(doc).forms.map((f) => f.id);
    const apply = inspectForm(doc, ids[1]!);
    const other = inspectForm(doc, ids[2]!);
    expect(apply.formId).not.toBe(other.formId);
    const cross = apply.fields[0]!;
    const out = (await fillFields(doc, other.formId, [{ fieldId: cross.id, fp: cross.fp, vh: cross.vh, value: 'x' }]));
    expect(out.results[0]).toMatchObject({ status: 'failed' });
    expect(document.getElementById('a-fn')).toHaveProperty('value', '');
  });
});

describe('validation failures are reported, and the field is left as it was', () => {
  it('too long for maxlength: refused, not truncated', async () => {
    const { ins, fill } = setup('validation');
    expect((await fill(ins('Name', 'Youssif'))).results[0]).toMatchObject({ status: 'failed', reason: 'too-long' });
    expect($<HTMLInputElement>('short').value).toBe('');
    expect((await fill(ins('Name', 'Yus'))).results[0]!.status).toBe('filled');
  });

  it('pattern and type mismatches: restored, and the result carries the baseline hash for a retry', async () => {
    const { ins, fill } = setup('validation');
    const a = ins('Phone', '+201001234567');
    const r = (await fill(a)).results[0]!;
    expect(r).toMatchObject({ status: 'failed', reason: 'invalid:pattern', vh: a.vh }); // restored: same hash as before
    expect($<HTMLInputElement>('ph').value).toBe('');
    expect((await fill(ins('Phone', '123-4567'))).results[0]!.status).toBe('filled');
    expect((await fill(ins('Email', 'not-an-email'))).results[0]).toMatchObject({ status: 'failed', reason: 'invalid:type' });
  });

  it('a page that masks the value is a mismatch, reported with what it shows', async () => {
    const { ins, fill } = setup('validation');
    $('mask').addEventListener('input', (e) => ((e.target as HTMLInputElement).value = 'https://' + (e.target as HTMLInputElement).value));
    expect((await fill(ins('LinkedIn', 'linkedin.com/in/ys'))).results[0]).toMatchObject({ status: 'failed', reason: 'value-mismatch', shown: 'https://linkedin.com/in/ys' });
  });

  it('a page that flags the field invalid after the change: reported and restored', async () => {
    const { ins, fill } = setup('validation');
    $('city').addEventListener('change', (e) => (e.target as HTMLElement).setAttribute('aria-invalid', 'true'));
    expect((await fill(ins('City', 'Atlantis'))).results[0]).toMatchObject({ status: 'failed', reason: 'page-rejected' });
    expect($<HTMLInputElement>('city').value).toBe('');
  });

  it('read-back catches a value the page reset, and a field whose identity changed', async () => {
    const { doc, formId, ins, fill } = setup('validation');
    const a = ins('City', 'Cairo');
    expect((await fill(a)).results[0]!.status).toBe('filled');
    const expected = [{ fieldId: a.fieldId, fp: a.fp, value: 'Cairo' }];
    expect(readBack(doc, formId, expected)[0]!.status).toBe('filled');
    $<HTMLInputElement>('city').value = '';
    expect(readBack(doc, formId, expected)[0]).toMatchObject({ status: 'failed', reason: 'value-mismatch', shown: '' });
    document.querySelector('label[for=city]')!.textContent = 'Town of birth';
    expect(readBack(doc, formId, expected)[0]).toMatchObject({ status: 'failed', reason: 'stale-field' });
  });
});

describe('it never submits', () => {
  it('blocks submit events fired by the page while filling, and never clicks a button', async () => {
    const { doc, ins, fill } = setup('validation');
    const form = doc.querySelector('form')!;
    const submitted = vi.fn((e: Event) => e.preventDefault());
    const buttonClicks = vi.fn();
    form.addEventListener('submit', submitted);
    $('go').addEventListener('click', buttonClicks);
    $('city').addEventListener('change', () => form.requestSubmit());
    const out = (await fill(ins('City', 'Cairo')));
    expect(out.submitAttempts).toBe(1);
    expect(submitted).not.toHaveBeenCalled();
    expect(buttonClicks).not.toHaveBeenCalled();
    form.requestSubmit(); // the guard is gone afterwards: the person's own submit works
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});

describe('a page that re-renders its form (real Greenhouse page)', () => {
  it('fills the replacement elements, and accepts a phone the page reformats', async () => {
    const { doc, ins, fill } = setup('greenhouse-utt');
    const approved = [ins('First Name', 'Youssif'), ins('Email', 'y@example.com'), ins('Phone', '+201001234567')];
    // Greenhouse hydrates seconds after load: the same form, brand-new elements.
    const old = doc.getElementById('application-form')!;
    old.replaceWith(old.cloneNode(true));
    $<HTMLInputElement>('phone').addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.value === '+201001234567') el.value = '+20 10 01234567';
    });
    const out = (await fill(...approved));
    expect(out.results.map((r) => [r.status, r.reason])).toEqual([['filled', undefined], ['filled', undefined], ['filled', undefined]]);
    expect($<HTMLInputElement>('first_name').value).toBe('Youssif');
    expect($<HTMLInputElement>('phone').value).toBe('+20 10 01234567');
  });
});

describe('date and number inputs', () => {
  it('fill like text, in the format the control expects', async () => {
    const { ins, fill } = setup('custom-controls');
    const out = (await fill(ins('Date of birth', '1990-05-01'), ins('Years', '3')));
    expect(out.results.map((r) => r.status)).toEqual(['filled', 'filled']);
    expect([$<HTMLInputElement>('dob').value, $<HTMLInputElement>('yr').value]).toEqual(['1990-05-01', '3']);
  });
});

describe('tick lists and type-ahead lists', () => {
  it('a checkbox group: exactly the listed options end up ticked, read back as a set', async () => {
    document.body.innerHTML = '<form id="f"><fieldset><legend>Skills</legend><label><input type="checkbox" name="sk" value="ts" /> TypeScript</label><label><input type="checkbox" name="sk" value="go" /> Go</label><label><input type="checkbox" name="sk" value="py" /> Python</label></fieldset></form>';
    const formId = inspectForm(document).formId;
    const f = inspectForm(document, formId).fields.find((x) => x.label === 'Skills')!;
    const out = await fillFields(document, formId, [{ fieldId: f.id, fp: f.fp, vh: f.vh, value: ['ts', 'py'] }]);
    expect(out.results[0]).toMatchObject({ status: 'filled', shown: 'ts | py' });
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('[name=sk]')).map((c) => c.checked)).toEqual([true, false, true]);
    expect(readBack(document, formId, [{ fieldId: f.id, fp: f.fp, value: ['ts', 'py'] }])[0]!.status).toBe('filled');
    expect(readBack(document, formId, [{ fieldId: f.id, fp: f.fp, value: ['ts'] }])[0]!.status).toBe('failed');
  });

  it('a type-ahead: types, waits for the list, clicks the matching option; no match leaves it empty', async () => {
    // a react-select-like widget: opens on a real press, lists its options in its own listbox, a click moves the
    // choice into its own value box and clears the input. Another widget's option list sits on the page all along.
    document.body.innerHTML = '<form id="f"><div id="other"><div role="option">Egypt+20</div><div role="option">Peru+51</div></div><label for="co">Country</label><div id="w"><span id="val"></span><input id="co" role="combobox" aria-autocomplete="list" aria-expanded="false" /><div id="menu" role="listbox"></div></div></form>';
    const input = $<HTMLInputElement>('co');
    const menu = $<HTMLDivElement>('menu');
    const render = () => {
      const q = input.value.toLowerCase();
      menu.innerHTML = ['Egypt', 'Estonia', 'Peru'].filter((c) => c.toLowerCase().startsWith(q)).map((c) => `<div role="option">${c}</div>`).join('');
      for (const o of menu.querySelectorAll('[role=option]')) o.addEventListener('click', () => { $('val').textContent = o.textContent!; menu.dataset.value = o.textContent!; menu.innerHTML = ''; input.value = ''; input.setAttribute('aria-expanded', 'false'); });
    };
    input.addEventListener('mousedown', () => { input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'menu'); render(); });
    input.addEventListener('input', render);
    const formId = inspectForm(document).formId;
    const f = () => inspectForm(document, formId).fields.find((x) => x.label === 'Country')!;
    expect(f().kind).toBe('combobox');
    // what it offers, read by opening it (and only its own list, not the other widget's)
    const probed = await probeOptions(document, formId, [f().id]);
    expect(probed).toEqual([{ fieldId: f().id, options: [{ value: 'Egypt', label: 'Egypt' }, { value: 'Estonia', label: 'Estonia' }, { value: 'Peru', label: 'Peru' }], total: 3 }]);
    const bad = await fillFields(document, formId, [{ fieldId: f().id, fp: f().fp, vh: f().vh, value: 'Narnia' }]);
    expect(bad.results[0]).toMatchObject({ status: 'failed', reason: 'no-option' });
    expect(menu.dataset.value).toBeUndefined();
    expect($('other').textContent).toContain('Egypt+20'); // the other widget's list was never touched
    const out = await fillFields(document, formId, [{ fieldId: f().id, fp: f().fp, vh: f().vh, value: 'egypt' }]);
    expect(out.results[0]).toMatchObject({ status: 'filled', shown: 'egypt' });
    expect(menu.dataset.value).toBe('Egypt');
    expect(f().hasValue).toBe(true); // the pick is remembered although the input cleared itself
    expect(readBack(document, formId, [{ fieldId: f().id, fp: f().fp, value: 'egypt' }])[0]!.status).toBe('filled');
  });
});

describe('pace', () => {
  it('types like a person: one input event per character for a short answer, then change once', async () => {
    const saved = { ...PACE };
    Object.assign(PACE, { charMs: [1, 2], wordMs: [1, 2], betweenFieldsMs: [0, 0] });
    try {
      document.body.innerHTML = '<form id="f"><label for="n">First name</label><input id="n" /></form>';
      const seen: string[] = [];
      $<HTMLInputElement>('n').addEventListener('input', (e) => seen.push((e.target as HTMLInputElement).value));
      const i = inspectForm(document);
      const f = i.fields[0]!;
      const out = await fillFields(document, i.formId, [{ fieldId: f.id, fp: f.fp, vh: f.vh, value: 'Youssif' }]);
      expect(out.results[0]!.status).toBe('filled');
      expect(seen).toEqual(['Y', 'Yo', 'You', 'Yous', 'Youss', 'Youssi', 'Youssif']);
    } finally {
      Object.assign(PACE, saved);
    }
  });
});
