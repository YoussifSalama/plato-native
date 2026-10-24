// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { inspectForm, listForms, resolveField } from '../src/dom/inspect';
import { $, load } from './helpers';

const find = (i: ReturnType<typeof inspectForm>, label: string) => i.fields.find((f) => f.label === label);

describe('inspectForm: visible, enabled, safe controls', () => {
  it('reads labels from for=, wrapping labels, aria-label and aria-labelledby, and required marks', () => {
    const i = inspectForm(load('identity'));
    expect(find(i, 'First name')).toMatchObject({ kind: 'text', labelSource: 'label-for', required: true, autocomplete: 'given-name' });
    expect(find(i, 'Last name')).toMatchObject({ labelSource: 'label-wrap', required: true });
    expect(find(i, 'Email address')).toMatchObject({ kind: 'email', labelSource: 'aria-label', required: true });
    expect(find(i, 'Phone number')).toMatchObject({ kind: 'tel', labelSource: 'aria-labelledby', required: false });
    expect(find(i, 'City')).toMatchObject({ required: false, hasValue: false });
  });

  it('lists select options (disabled and placeholder flagged) and reports radio groups once, with the legend as label', () => {
    const i = inspectForm(load('identity'));
    const country = find(i, 'Country')!;
    expect(country.kind).toBe('select');
    expect(country.options).toEqual([
      { value: '', label: 'Select…', disabled: false, placeholder: true },
      { value: 'EG', label: 'Egypt', disabled: false, placeholder: false },
      { value: 'US', label: 'United States', disabled: false, placeholder: false },
      { value: 'DE', label: 'Germany', disabled: true, placeholder: false },
    ]);
    const radios = i.fields.filter((f) => f.kind === 'radio');
    expect(radios).toHaveLength(1);
    expect(radios[0]).toMatchObject({ label: 'Are you authorised to work here?', labelSource: 'legend', required: true });
    expect(radios[0]!.options!.map((o) => [o.value, o.label])).toEqual([['yes', 'Yes'], ['no', 'No']]);
    expect(find(i, 'I agree to the terms')).toMatchObject({ kind: 'checkbox', required: true });
  });

  it('never describes sensitive fields, only counts them; buttons and hidden inputs are not fields', () => {
    const i = inspectForm(load('identity'));
    expect(i.sensitiveExcluded).toBe(1);
    expect(JSON.stringify(i)).not.toMatch(/password|csrf|Submit application/i);
    const s = inspectForm(load('sensitive'));
    expect(s.fields.map((f) => f.label)).toEqual(['Email']);
    expect(s.sensitiveExcluded).toBe(8); // password, new-password, code, one-time-code, card, cc-csc, ssn, pin
    expect(JSON.stringify(s)).not.toMatch(/Password|Verification|Card|Social|PIN|Security/);
  });

  it('skips hidden, invisible, disabled, read-only and aria-hidden (honeypot) controls', () => {
    const i = inspectForm(load('hidden'));
    expect(i.fields.map((f) => f.label)).toEqual(['Visible']);
    expect(i.hidden).toBe(7);
  });

  it('controls a script draws are fields too; only what Plato cannot fill is reported', () => {
    const i = inspectForm(load('custom-controls'));
    // textarea, date, number, a div combobox, a div checkbox and a rich-text editor are all fillable
    expect(i.fields.map((f) => [f.label, f.kind])).toEqual(expect.arrayContaining([['Name', 'text'], ['School', 'combobox'], ['Message', 'text'], ['Date of birth', 'date'], ['CV', 'file'], ['Years', 'number'], ['Role', 'combobox'], ['Subscribe', 'checkbox'], ['Bio', 'richtext']]));
    expect(i.fields).toHaveLength(9);
    expect(i.fields.find((f) => f.label === 'Role')).toMatchObject({ required: true });
    expect(i.unsupported.map((u) => [u.label, u.reason])).toEqual([['Skills', 'select-multiple']]);
  });

  it('flags fields that share a label instead of choosing one', () => {
    const i = inspectForm(load('duplicate-labels'));
    const names = i.fields.filter((f) => f.label === 'Name');
    expect(names).toHaveLength(2);
    expect(names[0]!.duplicateLabelWith).toEqual([names[1]!.id]);
    expect(find(i, 'Email')!.duplicateLabelWith).toBeUndefined();
  });

  it('reports presence of a value, never the value', () => {
    const doc = load('identity');
    $<HTMLInputElement>('ci').value = 'SECRET-PREFILL-VALUE';
    const i = inspectForm(doc);
    expect(find(i, 'City')!.hasValue).toBe(true);
    expect(JSON.stringify(i)).not.toContain('SECRET-PREFILL-VALUE');
  });

  it('keeps ids stable across inspections and resolves them to the same elements', () => {
    const doc = load('identity');
    const a = inspectForm(doc);
    const b = inspectForm(doc);
    expect(b.fields.map((f) => f.id)).toEqual(a.fields.map((f) => f.id));
    expect(resolveField(doc, find(b, 'City')!.id)).toEqual([$('ci')]);
    expect(resolveField(doc, 'nope')).toBeUndefined();
  });

  it('sees fields that appear later (dynamic forms) and drops ones that disappear', () => {
    const doc = load('identity');
    const before = inspectForm(doc);
    const extra = doc.createElement('input');
    extra.type = 'text';
    extra.setAttribute('aria-label', 'Nickname');
    $('apply').append(extra);
    const after = inspectForm(doc);
    expect(after.fields.length).toBe(before.fields.length + 1);
    expect(find(after, 'Nickname')).toBeTruthy();
    $('ci').style.display = 'none';
    expect(find(inspectForm(doc), 'City')).toBeUndefined();
  });

  it('chooses the application form over a search box and counts the other forms', () => {
    const doc = load('identity');
    const search = doc.createElement('form');
    search.innerHTML = '<input type="text" aria-label="Search jobs" />';
    doc.body.prepend(search);
    const i = inspectForm(doc);
    expect(i.formCount).toBe(2);
    expect(find(i, 'Search jobs')).toBeUndefined();
    expect(find(i, 'First name')).toBeTruthy();
  });

  it('handles a page with no <form> by reading the body', () => {
    document.body.innerHTML = '<label>Email <input type="email" /></label>';
    expect(inspectForm(document).fields.map((f) => f.label)).toEqual(['Email']);
  });

  it('fingerprints change with identity, hashes change with the value, and neither contains the content', () => {
    const doc = load('identity');
    const a = find(inspectForm(doc), 'City')!;
    expect(a.fp).toMatch(/^[0-9a-f]{8}$/);
    expect(find(inspectForm(doc), 'City')!.fp).toBe(a.fp); // deterministic
    $<HTMLInputElement>('ci').value = 'Alexandria';
    const b = find(inspectForm(doc), 'City')!;
    expect(b.fp).toBe(a.fp);
    expect(b.vh).not.toBe(a.vh);
    expect(JSON.stringify(b)).not.toContain('Alexandria');
    document.querySelector('label[for=ci]')!.textContent = 'Company';
    expect(find(inspectForm(doc), 'Company')!.fp).not.toBe(a.fp);
    $<HTMLSelectElement>('co').add(new Option('Mars', 'MS'));
    expect(find(inspectForm(doc), 'Country')!.fp).not.toBe(find(inspectForm(load('identity')), 'Country')!.fp);
  });
});

describe('listForms: several legitimate forms', () => {
  it('a single form on the page is used', () => {
    const l = listForms(load('identity'));
    expect(l.forms).toHaveLength(1);
    expect(l.selected).toBe(l.forms[0]!.id);
  });

  it('a search box next to the application form is not a competing choice', () => {
    const doc = load('identity');
    const search = doc.createElement('form');
    search.setAttribute('role', 'search');
    search.innerHTML = '<input type="search" name="q" aria-label="Search jobs" />';
    doc.body.prepend(search);
    const l = listForms(doc);
    expect(l.forms).toHaveLength(2);
    expect(l.selected).toBe(l.forms.find((f) => f.label !== 'Form 1')!.id);
  });

  it('two or more plausible forms: the whole page is reviewed, each field tagged with its form so the AI picks by context', () => {
    const l = listForms(load('multi-forms'));
    expect(l.forms.map((f) => f.label)).toEqual(['Form 1', 'Apply for this role', 'Refer a friend', 'Newsletter', 'This page']);
    expect(l.selected).toBe('page');
    expect(l.forms[1]).toMatchObject({ fieldCount: 4, sample: ['First name', 'Last name', 'Email'] });
    expect(listForms(load('two-plausible')).selected).toBe('page');
    const page = inspectForm(load('multi-forms'), 'page');
    expect(page.fields.map((f) => [f.label, f.form])).toEqual([
      ['First name', 'Apply for this role'], ['Last name', 'Apply for this role'], ['Email', 'Apply for this role'], ['Phone', 'Apply for this role'],
      ['First name', 'Refer a friend'], ['Last name', 'Refer a friend'], ['Email', 'Refer a friend'],
      ['Email', 'Newsletter'],
    ]);
  });

  it('only a search form on the page: the page itself is reviewed (React forms often have no <form>)', () => {
    document.body.innerHTML = '<form role="search"><input type="search" name="q" aria-label="Search jobs" /></form><div><label>Email <input type="email" /></label><label>Phone <input type="tel" /></label></div>';
    const l = listForms(document);
    expect(l.selected).toBe('page');
    expect(inspectForm(document, 'page').fields.map((f) => f.label)).toEqual(['Email', 'Phone']); // the search box is not a field to fill
  });

  it('a wrapping label names the field by what comes before the control; the ✱ marker means required', () => {
    document.body.innerHTML = '<form id="f"><label>Current location ✱<input type="text" /><span>No location found. Try entering a different location</span><em>Loading</em></label><label for="n">Full name✱</label><input id="n" /></form>';
    const i = inspectForm(document);
    expect(i.fields.map((f) => [f.label, f.required])).toEqual([['Current location', true], ['Full name', true]]);
  });

  it('controls inside an open shadow root are inspected like any other', () => {
    document.body.innerHTML = '<form id="f"><label>Email <input type="email" /></label><x-widget></x-widget></form>';
    const host = document.querySelector('x-widget')!;
    host.attachShadow({ mode: 'open' }).innerHTML = '<input type="tel" aria-label="Phone" />';
    const i = inspectForm(document);
    expect(i.fields.map((f) => [f.label, f.kind])).toEqual([['Email', 'email'], ['Phone', 'tel']]);
  });

  it('inspection and ids are scoped to the chosen form, and a form id from nowhere is refused', () => {
    const doc = load('multi-forms');
    const l = listForms(doc);
    const apply = inspectForm(doc, l.forms[1]!.id);
    const refer = inspectForm(doc, l.forms[2]!.id);
    expect(apply.fields.map((f) => f.label)).toEqual(['First name', 'Last name', 'Email', 'Phone']);
    expect(refer.fields.map((f) => f.label)).toEqual(['First name', 'Last name', 'Email']);
    expect(new Set([...apply.fields, ...refer.fields].map((f) => f.id)).size).toBe(7);
    expect(new Set([...apply.fields, ...refer.fields].map((f) => f.fp)).size).toBe(7); // same labels, different forms: different fingerprints
    expect(() => inspectForm(doc, 'form99')).toThrow('unknown-form');
  });

  it('a page without any form uses the body as one form', () => {
    document.body.innerHTML = '<label>Email <input type="email" /></label><label>Phone <input type="tel" /></label>';
    const l = listForms(document);
    expect(l.forms).toHaveLength(1);
    expect(l.selected).toBe('page');
  });
});

describe('inspectForm: question text from the control\'s own box when no label is attached', () => {
  it('a heading div beside a select (Lever) and a <label for> pointing at an id the input lacks (Ashby) become the label, with the required mark', () => {
    const i = inspectForm(load('errors'));
    expect(find(i, 'Which location are you applying for?')).toMatchObject({ kind: 'select', labelSource: 'box', required: true });
    expect(i.fields.filter((f) => f.label === 'Where are you currently based?').map((f) => [f.kind, f.labelSource, f.required])).toEqual([['combobox', 'label-for', true], ['combobox', 'box', true]]);
    expect(i.fields.some((f) => f.label === 'Start typing...' || f.label === 'opportunityLocationId')).toBe(false);
  });
});

describe('inspectForm: a required mark the page draws instead of writing', () => {
  it('a label class saying "required" (the star comes from CSS) makes the field required', () => {
    const i = inspectForm(load('errors'));
    expect(find(i, 'Where are you currently based?')).toMatchObject({ kind: 'combobox', required: true });
    expect(find(i, 'Company')?.required).toBe(false);
  });
});

describe('inspectForm: the page\'s own error for a field, tied to that field', () => {
  it('aria-describedby when the control is invalid (the error text, not the help text), aria-errormessage, an error node in the field\'s box; hidden or absent = none', () => {
    const i = inspectForm(load('errors'));
    expect(find(i, 'Email')?.error).toBe('Enter a valid email address.');
    expect(find(i, 'Phone')?.error).toBe('Phone number is too short.');
    expect(find(i, 'Location')?.error).toBe('This field is required.');
    expect(find(i, 'Company')?.error).toBeUndefined();
    expect(find(i, 'City')?.error).toBeUndefined();
  });

  it('never borrows: a global alert, a neighbour\'s error in a shared row, help text without an invalid flag, and a cookie banner outside the form attach to no field', () => {
    const i = inspectForm(load('errors'));
    const errors = Object.fromEntries(i.fields.map((f) => [f.label, f.error ?? null]));
    expect(Object.values(errors)).not.toContain('Please fix the errors below.'); // page-level alert stays page-level
    expect(errors['First name']).toBeNull(); // the row holds another control: the walk stops before the shared error node
    expect(errors['Last name']).toBeNull();
    expect(errors['Website']).toBeNull(); // described-by help text, control not invalid, text not an error
    expect(i.fields.some((f) => /cookie|analytics/i.test(f.label))).toBe(false); // the banner is outside the form
    expect(Object.values(errors)).not.toContain('This site uses cookies. You must accept to continue.');
  });
});

describe('isVisible: scrolled pages', () => {
  it('a field above the current scroll position is visible; one pushed far off the page is not', async () => {
    const { isVisible } = await import('../src/dom/inspect');
    document.body.innerHTML = '<input id="top"><input id="trap">';
    const top = document.getElementById('top')!, trap = document.getElementById('trap')!;
    const rect = (y: number) => ({ x: 0, y, top: y, left: 0, right: 600, bottom: y + 34, width: 600, height: 34, toJSON() {} }) as DOMRect;
    // layout present in this test: body has a client rect
    document.body.getClientRects = () => [rect(0)] as unknown as DOMRectList;
    Object.defineProperty(window, 'scrollY', { value: 2000, configurable: true });
    top.getBoundingClientRect = () => rect(-551); // scrolled past
    trap.getBoundingClientRect = () => rect(-9999 - 2000); // off the page
    expect(isVisible(top)).toBe(true);
    expect(isVisible(trap)).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});
