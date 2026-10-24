// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fillFields, readBack } from '../src/dom/fill';
import { inspectForm } from '../src/dom/inspect';

const fields = () => inspectForm(document).fields.map((f) => [f.label, f.kind, f.required, (f.options ?? []).map((o) => o.label)]);

describe('dynamic discovery of choices', () => {
  it('radios with no shared name, each label repeating the question (the Advansys form), are ONE question', () => {
    document.body.innerHTML = `<form id="f">
      <div class="q"><label><input type="radio" /> Do you have any disability or special needs? YES</label><label><input type="radio" /> Do you have any disability or special needs? NO</label></div>
      <div class="q"><p>English Level *</p><label><input type="radio" name="e1" /> Fair</label><label><input type="radio" name="e2" /> Good</label><label><input type="radio" name="e3" /> Excellent</label></div>
      <label for="s">Current Salary</label><input id="s" />
    </form>`;
    expect(fields()).toEqual([
      ['Do you have any disability or special needs?', 'radio', false, ['YES', 'NO']],
      ['English Level', 'radio', true, ['Fair', 'Good', 'Excellent']],
      ['Current Salary', 'text', false, []],
    ]);
  });

  it('a styled radio (the real box is hidden behind its label) is still a field, and is filled', async () => {
    document.body.innerHTML = `<form id="f"><fieldset><legend>Egyptian resident?</legend>
      <label><input type="radio" name="r" value="y" style="opacity:0;width:0;height:0" /><span>Yes</span></label>
      <label><input type="radio" name="r" value="n" style="opacity:0;width:0;height:0" /><span>No</span></label></fieldset></form>`;
    const i = inspectForm(document);
    const f = i.fields.find((x) => x.label === 'Egyptian resident?')!;
    expect(f).toMatchObject({ kind: 'radio' });
    const out = await fillFields(document, i.formId, [{ fieldId: f.id, fp: f.fp, vh: f.vh, value: 'y' }]);
    expect(out.results[0]!.status).toBe('filled');
    expect((document.querySelector('input[value=y]') as HTMLInputElement).checked).toBe(true);
  });

  it('divs a script draws: role=radio group, Yes/No toggle buttons, a switch, a rich-text editor', async () => {
    document.body.innerHTML = `<form id="f">
      <div role="radiogroup" aria-label="Notice period"><div role="radio" aria-checked="false">Immediately</div><div role="radio" aria-checked="false">1 month</div></div>
      <div class="q"><span>Can you work PST hours? *</span><button type="button" aria-pressed="false">Yes</button><button type="button" aria-pressed="false">No</button></div>
      <div role="switch" aria-checked="false" aria-label="Open to relocation"></div>
      <div contenteditable="true" aria-label="Cover letter"></div>
    </form>`;
    // the page's own scripts: a press flips the ARIA state (one choice at a time in a group)
    for (const el of document.querySelectorAll('[role=radio], [aria-pressed]')) el.addEventListener('click', () => { for (const s of el.parentElement!.children) if (s !== el) s.setAttribute(s.hasAttribute('aria-pressed') ? 'aria-pressed' : 'aria-checked', 'false'); el.setAttribute(el.hasAttribute('aria-pressed') ? 'aria-pressed' : 'aria-checked', 'true'); });
    document.querySelector('[role=switch]')!.addEventListener('click', (e) => (e.currentTarget as Element).setAttribute('aria-checked', String((e.currentTarget as Element).getAttribute('aria-checked') !== 'true')));
    (document as unknown as { execCommand: (c: string, u: boolean, v: string) => boolean }).execCommand = (_c, _u, v) => ((document.activeElement as HTMLElement).textContent += v, true);

    expect(fields()).toEqual([
      ['Notice period', 'radio', false, ['Immediately', '1 month']],
      ['Can you work PST hours?', 'radio', true, ['Yes', 'No']],
      ['Open to relocation', 'checkbox', false, []],
      ['Cover letter', 'richtext', false, []],
    ]);
    const i = inspectForm(document);
    const by = (l: string) => i.fields.find((x) => x.label === l)!;
    const ins = (l: string, value: string | boolean) => ({ fieldId: by(l).id, fp: by(l).fp, vh: by(l).vh, value });
    const out = await fillFields(document, i.formId, [ins('Notice period', '1 month'), ins('Can you work PST hours?', 'Yes'), ins('Open to relocation', true), ins('Cover letter', 'I build React apps.')]);
    expect(out.results.map((r) => r.status)).toEqual(['filled', 'filled', 'filled', 'filled']);
    expect(document.querySelectorAll('[role=radio]')[1]!.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelectorAll('[aria-pressed]')[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[role=switch]')!.getAttribute('aria-checked')).toBe('true');
    const back = readBack(document, i.formId, [{ fieldId: by('Notice period').id, fp: by('Notice period').fp, value: '1 month' }, { fieldId: by('Cover letter').id, fp: by('Cover letter').fp, value: 'I build React apps.' }]);
    expect(back.map((r) => r.status)).toEqual(['filled', 'filled']);
  });
});
