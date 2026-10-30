// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { describeAt, describeElement, find, formInput, handle, installGuard, readPage, ready, resolve } from '../src/content/v3-reader';

// A synthetic application form (not a copy of any site): labels, a select that reveals a field, a file input,
// a required consent box, an off-screen honeypot, a step button and the Submit control.
const FORM = `<h1>Engineer</h1><form id="f" method="post" action="/submit">
  <label for="fn">First name *</label><input id="fn" name="fn" required />
  <label for="em">Email *</label><input id="em" name="em" type="email" required />
  <label for="ph">Phone</label><input id="ph" name="ph" type="tel" />
  <label for="co">Country</label><select id="co" name="co"><option value="">Select…</option><option value="EG">Egypt</option><option value="US">United States</option></select>
  <div id="cw" hidden><label for="ci">City</label><input id="ci" name="ci" /></div>
  <label for="cv">Resume *</label><input id="cv" type="file" required />
  <label><input type="checkbox" id="terms" name="terms" required /> I agree to the terms *</label>
  <div aria-hidden="true"><input id="trap" aria-label="Website" /></div>
  <button type="button" id="apply">Apply now</button>
  <button type="submit" id="next">Next</button>
  <button type="submit" id="submit">Submit application</button>
</form>`;
const $ = (id: string) => document.getElementById(id)!;
const refOf = (tree: string, label: string) => new RegExp(`"${label.replace(/[*]/g, '\\*')}"[^\\n]*\\[(ref_\\d+)\\]`).exec(tree)![1]!;

beforeEach(() => {
  document.body.innerHTML = FORM;
  // jsdom lays nothing out: a visible element is 100x20 at (10,10); anything under [hidden] has no box
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const h = this.closest('[hidden]') ? 0 : 20;
    return { x: 10, y: 10, left: 10, top: 10, right: 10 + 5 * h, bottom: 10 + h, width: 5 * h, height: h, toJSON: () => ({}) } as DOMRect;
  };
});

describe('read_page: the tree the model plans on', () => {
  it('lists visible controls with role, name, required, state and a ref; hides the honeypot and the not-yet-revealed field', () => {
    const t = readPage(document, 'interactive');
    expect(t).toMatch(/^textbox "First name \*" required \[ref_\d+\]$/m); // empty + required: no native error line (it would only repeat `required`)
    expect(t).toMatch(/^combobox "Country" options: Egypt \| United States \[ref_\d+\]$/m);
    expect(t).toMatch(/^file-input "Resume \*" required no file \[ref_\d+\]$/m);
    expect(t).toMatch(/^checkbox "I agree to the terms \*" required unchecked \[ref_\d+\]$/m);
    expect(t).toMatch(/^button "Submit application" \[ref_\d+\]$/m);
    expect(t).not.toMatch(/Website|"City"/); // aria-hidden honeypot, hidden city
    expect(t).not.toMatch(/heading/); // interactive filter: no headings
    expect(readPage(document)).toMatch(/^heading "Engineer"/m);
  });
  it('keeps the same ref for the same element across reads and gives a new one to a new element', () => {
    const a = refOf(readPage(document, 'interactive'), 'Email *');
    $('co').addEventListener('change', () => (($('cw') as HTMLElement).hidden = !($('co') as HTMLSelectElement).value));
    formInput(document, refOf(readPage(document, 'interactive'), 'Country'), 'Egypt');
    const t = readPage(document, 'interactive');
    expect(refOf(t, 'Email *')).toBe(a);
    expect(t).toMatch(/^textbox "City" \[ref_\d+\]$/m); // revealed by the country
    expect(t).toMatch(/^combobox "Country" value="Egypt"/m);
  });
});

describe('form_input: values the way the contract describes', () => {
  it('selects by option text, sets text through the native setter with input+change events, tolerates phone formatting', () => {
    const t = readPage(document, 'interactive');
    const seen: string[] = [];
    $('fn').addEventListener('input', () => seen.push('input'));
    $('fn').addEventListener('change', () => seen.push('change'));
    expect(formInput(document, refOf(t, 'First name *'), 'Youssif')).toEqual({ ok: true, message: 'Set to "Youssif"' });
    expect(seen).toEqual(['input', 'change']);
    expect(formInput(document, refOf(t, 'Country'), 'united states')).toEqual({ ok: true, message: 'Selected "United States"' });
    expect(formInput(document, refOf(t, 'Country'), 'Mars').message).toMatch(/No option matches "Mars". Options: Select… \| Egypt/);
    ($('ph') as HTMLInputElement).addEventListener('input', (e) => (((e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/^\+20/, '0')))); // the page reformats the number
    expect(formInput(document, refOf(t, 'Phone'), '+201001234567')).toEqual({ ok: true, message: 'Set to "01001234567"' });
  });
  it('a box is never ticked by script: the answer is the point to press (a real click)', () => {
    const t = readPage(document, 'interactive');
    const r = formInput(document, refOf(t, 'I agree to the terms *'), true);
    expect(r).toMatchObject({ ok: true, message: 'Checked', clickPoint: { x: 22, y: 20 } }); // inside the box's left edge
    expect(($('terms') as HTMLInputElement).checked).toBe(false);
    ($('terms') as HTMLInputElement).checked = true;
    expect(formInput(document, refOf(t, 'I agree to the terms *'), 'yes')).toEqual({ ok: true, message: 'Already checked' });
  });
  it('a stale ref is named so the model reads the page again', () => {
    expect(formInput(document, 'ref_99999', 'x').message).toBe('Unknown or stale ref: ref_99999. Call read_page again for current refs.');
    expect(resolve('ref_99999')).toBeNull();
  });
});

describe('the Submit gate reads the element, not the model', () => {
  it('a submit button in a form, an input type=submit, or a control that says Submit/Send is the Submit control; Apply/Next/Continue are steps', () => {
    expect(describeElement($('submit'))).toMatchObject({ isSubmit: true, text: 'Submit application' });
    expect(describeElement($('apply')).isSubmit).toBe(false);
    expect(describeElement($('next')).isSubmit).toBe(false); // type=submit but it says Next: a step
    document.body.insertAdjacentHTML('beforeend', '<input type="submit" id="send" value="Send" /><a id="lnk" href="#">Submit</a><a id="cont" href="#">Continue</a>');
    expect(describeElement($('send')).isSubmit).toBe(true);
    expect(describeElement($('lnk')).isSubmit).toBe(true);
    expect(describeElement($('cont')).isSubmit).toBe(false);
  });
  it('a coordinate is resolved to the control under it', () => {
    document.elementFromPoint = () => $('submit').firstChild as Element; // the text node's parent is found via closest()
    expect(describeAt(document, { x: 5, y: 5 })).toBeNull(); // a text node is not an element
    document.elementFromPoint = () => $('submit');
    expect(describeAt(document, { x: 5, y: 5 })).toMatchObject({ isSubmit: true });
    expect(describeAt(document, { ref: refOf(readPage(document, 'interactive'), 'Apply now') })).toMatchObject({ isSubmit: false, text: 'Apply now' });
  });
  it('the page guard cancels and counts form submissions while armed, and is off once read', () => {
    installGuard(document);
    const submit = () => {
      const e = new Event('submit', { bubbles: true, cancelable: true });
      $('f').dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(submit()).toBe(false);
    handle(document, { op: 'guard', ms: 1000 });
    expect(submit()).toBe(true);
    expect(submit()).toBe(true);
    expect(handle(document, { op: 'guarded' })).toEqual({ blocked: 2 });
    expect(submit()).toBe(false); // read once: disarmed, an allowed press goes through
    expect(handle(document, { op: 'guarded' })).toEqual({ blocked: 0 });
  });
});

describe('find and resolve', () => {
  it('find ranks controls by the words they share with the query', () => {
    const lines = find(document, 'country select').split('\n');
    expect(lines[0]).toMatch(/^combobox "Country"/);
    expect(find(document, 'zzz')).toBe('');
  });
  it('resolve gives the centre of the element’s box', () => {
    expect(resolve(refOf(readPage(document, 'interactive'), 'Email *'))).toEqual({ x: 60, y: 20 });
  });
});

describe('ready: a press only once the control can really be pressed', () => {
  const at = (el: Element | null) => (document.elementFromPoint = (() => el) as typeof document.elementFromPoint);
  it('in view, shown, enabled, still and on top: the point to press', async () => {
    const ref = refOf(readPage(document, 'interactive'), 'First name *');
    at($('fn'));
    expect(await ready(document, ref, 500)).toEqual({ ok: true, point: { x: 60, y: 20 } });
  });
  it('a cookie banner or a modal on top: not pressed, and the model is told what covers it', async () => {
    const ref = refOf(readPage(document, 'interactive'), 'Submit application');
    const banner = document.createElement('div');
    banner.textContent = 'We use cookies';
    document.body.append(banner);
    at(banner);
    const r = await ready(document, ref, 300);
    expect(r).toEqual({ ok: false, reason: 'Not pressed: something covers it: div "We use cookies" (close or answer that first).' });
  });
  it('a disabled control waits, then says why (a field above may still need a value)', async () => {
    const ref = refOf(readPage(document, 'interactive'), 'Submit application');
    ($('submit') as HTMLButtonElement).disabled = true;
    at($('submit'));
    const r = await ready(document, ref, 250);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/disabled/);
  });
  it('a control that becomes ready while waiting is pressed then, not refused', async () => {
    const ref = refOf(readPage(document, 'interactive'), 'Submit application');
    ($('submit') as HTMLButtonElement).disabled = true;
    at($('submit'));
    setTimeout(() => (($('submit') as HTMLButtonElement).disabled = false), 120);
    expect((await ready(document, ref, 1500)).ok).toBe(true);
  });
  it('a ref from before the page changed is named stale', async () => {
    expect(await ready(document, 'ref_9999', 100)).toEqual({ ok: false, reason: 'Unknown or stale ref: ref_9999. Call read_page again for current refs.' });
  });
});

describe('changed and typed: values the page set since the model last read them', () => {
  it('lists a field the page filled after the read, names the active field, and forgets it once the model reads again or we set it', () => {
    const t = readPage(document, 'interactive');
    const fn = refOf(t, 'First name *');
    expect(handle(document, { op: 'changed' })).toEqual({ active: null, fields: [] });
    ($('fn') as HTMLInputElement).value = 'Test Seeker'; // the page's own autofill (a resume parse)
    $('fn').focus();
    expect(handle(document, { op: 'changed' })).toEqual({ active: fn, fields: [{ ref: fn, label: 'First name *', value: 'Test Seeker' }] });
    readPage(document, 'interactive'); // the model saw it
    expect(handle(document, { op: 'changed' })).toEqual({ active: fn, fields: [] });
    ($('em') as HTMLInputElement).value = 'a@b.c';
    expect((handle(document, { op: 'changed' }) as { fields: unknown[] }).fields).toHaveLength(1);
    formInput(document, refOf(t, 'Email *'), 'x@y.z'); // ours now
    expect(handle(document, { op: 'changed' })).toMatchObject({ fields: [] });
  });
  it('typed: what the executor typed into the active field is ours, so a second type into it (a type-ahead) is not refused', () => {
    const t = readPage(document, 'interactive');
    $('ph').focus();
    ($('ph') as HTMLInputElement).value = 'Cai'; // what our key events produced
    expect((handle(document, { op: 'changed' }) as { fields: unknown[] }).fields).toHaveLength(1);
    handle(document, { op: 'typed' });
    expect(handle(document, { op: 'changed' })).toEqual({ active: refOf(t, 'Phone'), fields: [] });
  });
});
