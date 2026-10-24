import { ctlChecked, ctlValue, hash, inspectForm, isVisible, markPicked, resolveField } from './inspect';
import { deepQueryAll } from './deep';
import { norm } from './text';
import type { FieldValue, FillInstruction, FillOutcome, FillResult } from './types';

// Fills inspected controls the way their type expects, then reads back what
// the page actually shows. Only ids from the latest inspection are accepted,
// so this can only touch controls the inspector reported (never a sensitive
// field, a button, or a link). It never submits: submit events are blocked for
// the duration, and no code path clicks anything but a checkbox or radio.

type Input = HTMLInputElement;

function setNativeValue(el: Input | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  // Frameworks that track the value themselves (React etc.) only see changes made through the native setter.
  const view = el.ownerDocument.defaultView!;
  const proto = el.tagName === 'SELECT' ? view.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fire(el: Element, type: string) {
  const view = el.ownerDocument.defaultView!;
  el.dispatchEvent(type === 'input' ? new view.InputEvent('input', { bubbles: true, composed: true }) : new view.Event(type, { bubbles: true }));
}

// Phone widgets reformat what we type ("+201001234567" -> "+20 10 01234567"): same digits, same number.
const digits = (v: string) => v.replace(/\D/g, '');
const shows = (el: Input, shown: string, want: string) => shown === want || (el.type === 'tel' && digits(want).length > 0 && digits(shown) === digits(want));

const ariaInvalid = (el: Element) => el.getAttribute('aria-invalid') === 'true';

// Human pace, so the person can follow it (and sites that watch keystrokes see typing): characters for
// short answers, words for long ones, the tail of a very long text at once so a cover letter stays quick.
// ponytail: fixed pace; tie it to the "Application speed" setting if people want it faster or slower
const QUICK = typeof __FLAVOR__ !== 'undefined' && __FLAVOR__ === 'fixtures'; // the runtime-test build fills fast; real builds at human pace
export const PACE: { charMs: [number, number]; wordMs: [number, number]; typedChars: number; betweenFieldsMs: [number, number] } = QUICK
  ? { charMs: [1, 3], wordMs: [1, 3], typedChars: 320, betweenFieldsMs: [10, 20] }
  : { charMs: [28, 60], wordMs: [45, 90], typedChars: 320, betweenFieldsMs: [380, 700] };
const jitter = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);
const TYPED = new Set(['text', 'email', 'tel', 'url', 'search', 'textarea']); // types a partial value is valid for
async function typeHuman(el: Input, value: string) {
  const kind = el.tagName === 'TEXTAREA' ? 'textarea' : el.type;
  if (!TYPED.has(kind) || PACE.charMs[1] === 0) {
    setNativeValue(el, value);
    fire(el, 'input');
    return;
  }
  const head = value.slice(0, PACE.typedChars);
  const steps = head.length > 60 ? head.match(/\S+\s*/g) ?? [head] : [...head]; // words for long text
  let typed = '';
  for (const piece of steps) {
    typed += piece;
    setNativeValue(el, typed);
    fire(el, 'input');
    await new Promise((r) => setTimeout(r, jitter(head.length > 60 ? PACE.wordMs : PACE.charMs)));
  }
  if (typed !== value) {
    setNativeValue(el, value); // the long tail at once
    fire(el, 'input');
  }
}

async function fillText(el: Input, value: string): Promise<FillResult> {
  const before = el.value;
  // A stale aria-invalid (the page flagged the empty field earlier) must not read as a rejection of
  // what we are about to type; only a flag that appears after the fill counts (Greenhouse, 2026-10-23).
  const invalidBefore = ariaInvalid(el);
  if (el.maxLength >= 0 && value.length > el.maxLength) return { fieldId: '', status: 'failed', reason: 'too-long' };
  el.focus();
  await typeHuman(el, value);
  fire(el, 'change');
  el.blur();
  await wait(120); // frameworks validate after their next render, not inside the blur handler
  const shown = el.value;
  const restore = (reason: string): FillResult => {
    setNativeValue(el, before);
    fire(el, 'input');
    fire(el, 'change');
    return { fieldId: '', status: 'failed', reason, shown };
  };
  if (!shows(el, shown, value)) return restore('value-mismatch'); // masked / reformatted by the page
  if (el.validity.patternMismatch) return restore('invalid:pattern');
  if (el.validity.typeMismatch) return restore('invalid:type');
  if (ariaInvalid(el) && !invalidBefore) return restore('page-rejected');
  return { fieldId: '', status: 'filled', shown };
}

function fillSelect(el: HTMLSelectElement, value: string): FillResult {
  const before = el.value;
  const opt = Array.from(el.options).find((o) => !o.disabled && (o.value === value || norm(o.textContent ?? '') === norm(value)));
  if (!opt) return { fieldId: '', status: 'failed', reason: 'no-option' };
  el.focus();
  setNativeValue(el, opt.value);
  fire(el, 'input');
  fire(el, 'change');
  el.blur();
  const shown = el.selectedOptions[0]?.value ?? '';
  if (shown !== opt.value || ariaInvalid(el)) {
    setNativeValue(el, before);
    fire(el, 'change');
    return { fieldId: '', status: 'failed', reason: ariaInvalid(el) ? 'page-rejected' : 'value-mismatch', shown };
  }
  return { fieldId: '', status: 'filled', shown: el.selectedOptions[0]?.textContent?.trim() ?? shown };
}

function setChecked(el: Input, want: boolean): FillResult {
  if (el.checked !== want) el.click(); // a real click: pages listen for it; checkbox/radio only (checked by the caller)
  return el.checked === want ? { fieldId: '', status: 'filled', shown: String(el.checked) } : { fieldId: '', status: 'failed', reason: 'value-mismatch', shown: String(el.checked) };
}

async function apply(els: Element[], value: FieldValue): Promise<FillResult> {
  const first = els[0]!;
  if (first instanceof first.ownerDocument.defaultView!.HTMLSelectElement) return typeof value === 'string' ? fillSelect(first, value) : fail('not-fillable');
  if (first.tagName === 'TEXTAREA') return typeof value === 'string' ? fillText(first as unknown as Input, value) : fail('not-fillable'); // same read-back checks as a text input
  const el = first as Input;
  if (el.tagName !== 'INPUT') {
    // a control a script draws: press the right items, read their ARIA state back
    if (first.getAttribute('contenteditable') !== null || first.getAttribute('role') === 'textbox') {
      if (typeof value !== 'string') return fail('not-fillable');
      (first as HTMLElement).focus();
      first.ownerDocument.execCommand('insertText', false, value);
      return (first.textContent ?? '').includes(value.slice(0, 40)) ? { fieldId: '', status: 'filled', shown: value } : fail('value-mismatch');
    }
    if (first.getAttribute('role') === 'combobox') return fail('not-fillable'); // needs trusted input
    const want = (n: Element) => (Array.isArray(value) ? value.includes(ctlValue(n)) : typeof value === 'boolean' ? value : ctlValue(n) === value);
    if (typeof value === 'string' && !Array.isArray(value) && !els.some((n) => ctlValue(n) === value)) return fail('no-option');
    for (const n of els) if (ctlChecked(n) !== want(n) && (want(n) || Array.isArray(value) || typeof value === 'boolean')) press(n);
    const ok = els.every((n) => ctlChecked(n) === want(n) || (!Array.isArray(value) && typeof value === 'string' && !want(n) && !ctlChecked(n)));
    return ok ? { fieldId: '', status: 'filled', shown: els.filter(ctlChecked).map(ctlValue).join(' | ') } : fail('value-mismatch');
  }
  if (el.type === 'checkbox' && els.length === 1 && !Array.isArray(value)) return typeof value === 'boolean' ? setChecked(el, value) : fail('not-fillable');
  if (el.type === 'checkbox' && Array.isArray(value)) return setGroup(els as Input[], value);
  if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete')) return typeof value === 'string' ? fillCombobox(el, value) : fail('not-fillable');
  if (el.type === 'radio' || el.type === 'checkbox') {
    const pick = typeof value === 'string' ? (els as Input[]).find((c) => c.value === value) : undefined;
    return pick ? setChecked(pick, true) : fail('no-option');
  }
  if (['text', 'email', 'tel', 'number', 'date', 'url'].includes(el.type)) return typeof value === 'string' ? fillText(el, value) : fail('not-fillable');
  return fail('not-fillable');
}
const fail = (reason: string): FillResult => ({ fieldId: '', status: 'failed', reason });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A tick list: exactly the listed options end up ticked.
function setGroup(els: Input[], want: string[]): FillResult {
  for (const c of els) if (c.checked !== want.includes(c.value)) c.click();
  const shown = els.filter((c) => c.checked).map((c) => c.value).join(' | ');
  return els.every((c) => c.checked === want.includes(c.value)) ? { fieldId: '', status: 'filled', shown } : { fieldId: '', status: 'failed', reason: 'value-mismatch', shown };
}

// A real press: the full pointer sequence a person's click produces. Widgets like react-select open
// only on it (a bare 'mousedown' or 'click' does nothing).
function press(el: Element) {
  const view = el.ownerDocument.defaultView!;
  const base = { bubbles: true, cancelable: true, composed: true, button: 0 };
  el.dispatchEvent(new view.PointerEvent('pointerdown', { ...base, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  el.dispatchEvent(new view.MouseEvent('mousedown', base));
  el.dispatchEvent(new view.PointerEvent('pointerup', { ...base, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  el.dispatchEvent(new view.MouseEvent('mouseup', base));
  el.dispatchEvent(new view.MouseEvent('click', base));
}
const key = (el: Element, k: string, code: number) => {
  const view = el.ownerDocument.defaultView!;
  el.dispatchEvent(new view.KeyboardEvent('keydown', { key: k, code: k, keyCode: code, which: code, bubbles: true, cancelable: true }));
};

// A combobox / type-ahead (react-select, Greenhouse's questions and Country, Ashby, Lever...):
// open it like a person would, read ONLY its own list (never another widget's, like the phone
// country list), pick the option, then prove the pick on the widget. The pick is remembered on the
// element (markPicked): the page may move the choice into its own box and clear the input.
const optionText = (o: Element) => norm(o.textContent ?? '');
const visibleOptionsIn = (doc: Document) => deepQueryAll<HTMLElement>(doc, '[role="option"]').filter((o) => isVisible(o, doc));
// The widget's own list: what aria-controls / aria-owns names, else the options that appeared after opening.
const ownOptionsOf = (el: Input, seenBefore: Set<Element>) => {
  const doc = el.ownerDocument;
  const id = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  const box = id ? (el.getRootNode() as Document | ShadowRoot).getElementById?.(id) ?? doc.getElementById(id) : null;
  const inBox = box ? deepQueryAll<HTMLElement>(box, '[role="option"]').filter((o) => isVisible(o, doc)) : [];
  return inBox.length ? inBox : visibleOptionsIn(doc).filter((o) => !seenBefore.has(o));
};
const untilTrue = async (ok: () => boolean, tries = 12) => {
  for (let i = 0; i < tries && !ok(); i++) await wait(100);
  return ok();
};
// Open a combobox like a person (press, else typing a space-less probe) so its list can be read.
async function openList(el: Input, seenBefore: Set<Element>) {
  el.focus();
  press(el);
  return untilTrue(() => ownOptionsOf(el, seenBefore).length > 0, 10);
}
const closeList = (el: Input) => {
  key(el, 'Escape', 27);
  el.blur();
};

/**
 * What a combobox offers: open it, read its own options, close it. The inspector cannot see these
 * (they exist only while the list is open), and the AI needs them to pick "Other" when the exact
 * value is not offered. Long lists (countries) stay type-ahead: only the count is reported.
 */
export async function probeOptions(doc: Document, formId: string, fieldIds: string[]): Promise<{ fieldId: string; options: { value: string; label: string }[]; total: number }[]> {
  const out: { fieldId: string; options: { value: string; label: string }[]; total: number }[] = [];
  let fresh;
  try {
    fresh = inspectForm(doc, formId);
  } catch {
    return out;
  }
  for (const fieldId of fieldIds) {
    const field = fresh.fields.find((f) => f.id === fieldId);
    const el = resolveField(doc, fieldId)?.[0] as Input | undefined;
    if (!field || !el || field.kind !== 'combobox') continue;
    const seenBefore = new Set(visibleOptionsIn(doc));
    const opened = await openList(el, seenBefore);
    const opts = opened ? ownOptionsOf(el, seenBefore) : [];
    const labels = opts.map((o) => (o.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean); // as the site shows them (case kept)
    closeList(el);
    await wait(80);
    out.push({ fieldId, options: labels.length <= 60 ? labels.map((l) => ({ value: l, label: l })) : [], total: labels.length });
  }
  return out;
}

async function fillCombobox(el: Input, value: string): Promise<FillResult> {
  const doc = el.ownerDocument;
  const want = norm(value);
  const text = optionText;
  const seenBefore = new Set(visibleOptionsIn(doc));
  const ownOptions = () => ownOptionsOf(el, seenBefore);
  const until = untilTrue;
  // the widget's own box: the nearest ancestor that holds the input, to read the chosen value back
  const widget = (): Element => {
    let n: Element = el;
    for (let i = 0; i < 5 && n.parentElement; i++) {
      n = n.parentElement;
      if (n.tagName === 'FORM' || n.tagName === 'FIELDSET' || n.tagName === 'BODY') break;
      if (n.querySelectorAll('input, select, textarea').length > 1) break; // reached a container with other fields
    }
    return n;
  };
  const shownNow = () => {
    const w = widget();
    const optionText = ownOptions().map(text).join(' ');
    const t = norm(w.textContent ?? '');
    return { input: norm(el.value), widget: t, chosenVisible: (c: string) => norm(el.value) === c || (t.includes(c) && !optionText.includes(c)) };
  };

  el.focus();
  press(el); // opens react-select and friends
  let opened = await until(() => ownOptions().length > 0, 10);
  if (!opened) {
    // a searchable list that opens on typing
    setNativeValue(el, value);
    fire(el, 'input');
    opened = await until(() => ownOptions().length > 0, 15);
  } else if (ownOptions().length > 12) {
    // a long list (countries): narrow it by typing
    setNativeValue(el, value);
    fire(el, 'input');
    await wait(250);
  }
  if (!opened) return { fieldId: '', status: 'failed', reason: 'no-option', shown: 'the list did not open' };
  const choose = () => {
    const opts = ownOptions();
    return opts.find((o) => text(o) === want) ?? opts.find((o) => text(o).startsWith(want) || text(o).includes(want) || want.includes(text(o))) ?? (opts.length === 1 ? opts[0] : undefined);
  };
  const pick = choose();
  if (!pick) {
    const offered = ownOptions().slice(0, 8).map(text).join(' | ');
    key(el, 'Escape', 27);
    setNativeValue(el, '');
    fire(el, 'input');
    el.blur();
    return { fieldId: '', status: 'failed', reason: 'no-option', shown: offered };
  }
  const chosen = text(pick);
  press(pick);
  await wait(200);
  if (shownNow().chosenVisible(chosen)) {
    markPicked(doc, el);
    return { fieldId: '', status: 'filled', shown: chosen };
  }
  // the click did not take: keyboard. Re-open, walk to the option, Enter.
  press(el);
  await until(() => ownOptions().length > 0, 8);
  const list = ownOptions();
  const index = list.findIndex((o) => text(o) === chosen);
  for (let i = 0; i <= Math.max(index, 0) && i < 60; i++) {
    key(el, 'ArrowDown', 40);
    await wait(40);
    const active = el.getAttribute('aria-activedescendant');
    if (active && index >= 0 && list[index]!.id === active) break;
  }
  key(el, 'Enter', 13);
  await wait(200);
  if (shownNow().chosenVisible(chosen)) {
    markPicked(doc, el);
    return { fieldId: '', status: 'filled', shown: chosen };
  }
  key(el, 'Escape', 27);
  return { fieldId: '', status: 'failed', reason: 'value-mismatch', shown: shownNow().widget.slice(0, 80) };
}

const valueHash = (els: Element[]) => {
  const first = els[0] as Input | HTMLSelectElement;
  if (first.tagName === 'SELECT') return hash((first as HTMLSelectElement).value);
  const choice = (n: Element) => (n.tagName === 'INPUT' ? ['checkbox', 'radio'].includes((n as Input).type) : n.hasAttribute('aria-checked') || n.hasAttribute('aria-pressed'));
  if (choice(first)) return hash(els.map((c) => (ctlChecked(c) ? '1' : '0')).join(''));
  if (first.tagName !== 'INPUT' && first.tagName !== 'TEXTAREA') return hash(first.textContent ?? '');
  return hash((first as Input).value);
};

/**
 * Fills ONLY fields the person approved, and only if each target is still the
 * very same field in the very same state. Before touching anything the form is
 * inspected again from scratch and each target must:
 *   - still be an eligible field (visible, enabled, not sensitive, supported),
 *   - still have the fingerprint that was approved (label, options, form...),
 *   - still hold exactly the value the person saw (so nothing they or the page
 *     changed is ever overwritten).
 * A field id alone proves nothing. Submit events are blocked meanwhile.
 */
export async function fillFields(doc: Document, formId: string, instructions: FillInstruction[], hooks: { before?(el: Element): Promise<void> | void } = {}): Promise<FillOutcome> {
  let submitAttempts = 0;
  const block = (e: Event) => {
    submitAttempts++;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  doc.addEventListener('submit', block, true);
  const results: FillResult[] = [];
  try {
    let fresh = inspectForm(doc, formId); // throws 'unknown-form' if the form is gone: nothing is filled
    // The page may swap an element while we work (a framework re-mounts a block after a resume parse).
    // A fresh inspection carries our id over to the replacement (same HTML id/name): resolve again.
    const live = (id: string) => {
      let els = resolveField(doc, id);
      if (els?.length && els.every((e) => e.isConnected)) return els;
      fresh = inspectForm(doc, formId);
      els = resolveField(doc, id);
      return els?.length && els.every((e) => e.isConnected) ? els : undefined;
    };
    for (const ins of instructions) {
      const els = live(ins.fieldId);
      const field = fresh.fields.find((f) => f.id === ins.fieldId);
      if (!field || !els?.length) {
        const known = fresh.unsupported.some((u) => u.id === ins.fieldId);
        results.push({ fieldId: ins.fieldId, status: 'failed', reason: known ? 'ineligible' : 'no-such-field' });
        continue;
      }
      if (field.fp !== ins.fp) {
        results.push({ fieldId: ins.fieldId, status: 'failed', reason: 'stale-field', fp: field.fp, vh: field.vh });
        continue;
      }
      if (field.vh !== ins.vh) {
        results.push({ fieldId: ins.fieldId, status: 'failed', reason: 'user-edited', fp: field.fp, vh: field.vh });
        continue;
      }
      try {
        await hooks.before?.(els[0]!); // the cursor moves to the field first
        let r = await apply(els, ins.value);
        let target = els;
        // Replaced while we typed: what we wrote sits on a detached element. Once, write it to the live
        // replacement; the result is read from the element that is on the page, never from the old one.
        if (!els.every((e) => e.isConnected)) {
          const again = live(ins.fieldId);
          const same = again && fresh.fields.find((f) => f.id === ins.fieldId)?.fp === ins.fp;
          r = again && same ? await apply(again, ins.value) : { fieldId: ins.fieldId, status: 'failed', reason: 'replaced' };
          if (again) target = again;
        }
        if (PACE.betweenFieldsMs[1]) await new Promise((res) => setTimeout(res, jitter(PACE.betweenFieldsMs))); // a breath before the next field
        results.push({ ...r, fieldId: ins.fieldId, fp: field.fp, vh: valueHash(target) });
      } catch {
        results.push({ fieldId: ins.fieldId, status: 'failed', reason: 'not-fillable', fp: field.fp, vh: valueHash(els) });
      }
    }
  } catch (e) {
    if ((e as Error).message !== 'unknown-form') throw e;
    for (const ins of instructions) results.push({ fieldId: ins.fieldId, status: 'failed', reason: 'stale-form' });
  } finally {
    doc.removeEventListener('submit', block, true);
  }
  return { results, submitAttempts };
}

/** What the fields display right now (read-only), for a final check that nothing was reset. */
export function readBack(doc: Document, formId: string, expected: { fieldId: string; fp: string; value: FieldValue }[]): FillResult[] {
  let fresh;
  try {
    fresh = inspectForm(doc, formId);
  } catch {
    return expected.map((e) => ({ fieldId: e.fieldId, status: 'failed' as const, reason: 'stale-form' }));
  }
  return expected.map((e) => {
    const field = fresh.fields.find((f) => f.id === e.fieldId);
    const els = resolveField(doc, e.fieldId);
    if (!field || !els?.length) return { fieldId: e.fieldId, status: 'failed', reason: 'no-such-field' };
    if (field.fp !== e.fp) return { fieldId: e.fieldId, status: 'failed', reason: 'stale-field', vh: field.vh };
    const first = els[0] as Input | HTMLSelectElement;
    let ok: boolean;
    let shown: string;
    if (first.tagName === 'SELECT') {
      shown = (first as HTMLSelectElement).selectedOptions[0]?.value ?? '';
      ok = shown === e.value;
    } else if (field.kind === 'checkbox') {
      shown = String(ctlChecked(first));
      ok = ctlChecked(first) === e.value;
    } else if (Array.isArray(e.value)) {
      const on = els.filter(ctlChecked).map(ctlValue);
      shown = on.join(' | ');
      ok = on.length === e.value.length && e.value.every((v) => on.includes(v));
    } else if (field.kind === 'radio' || field.kind === 'checkbox-group') {
      shown = els.filter(ctlChecked).map(ctlValue)[0] ?? '';
      ok = shown === e.value;
    } else if (field.kind === 'richtext') {
      shown = (first.textContent ?? '').trim();
      ok = typeof e.value === 'string' && shown.replace(/\s+/g, ' ').includes(e.value.replace(/\s+/g, ' ').trim().slice(0, 60));
    } else if (field.kind === 'combobox') {
      shown = (first as Input).value;
      ok = field.hasValue; // the pick is remembered on the element, the page may have cleared the text box
    } else {
      shown = (first as Input).value;
      ok = typeof e.value === 'string' && shows(first as Input, shown, e.value); // the page's own error text is read by the repair step; aria-invalid may be stale
    }
    return ok ? { fieldId: e.fieldId, status: 'filled', shown, vh: field.vh, fp: field.fp } : { fieldId: e.fieldId, status: 'failed', reason: 'value-mismatch', shown, vh: field.vh };
  });
}

/** Put one file into an upload field (the chosen resume). The field must still be the one that was inspected. */
export function setFile(doc: Document, formId: string, target: { fieldId: string; fp: string }, file: { name: string; mime: string; bytes: Uint8Array }): FillResult {
  let fresh;
  try {
    fresh = inspectForm(doc, formId);
  } catch {
    return { fieldId: target.fieldId, status: 'failed', reason: 'stale-form' };
  }
  const field = fresh.fields.find((f) => f.id === target.fieldId);
  const el = resolveField(doc, target.fieldId)?.[0] as Input | undefined;
  if (!field || !el || el.type !== 'file') return { fieldId: target.fieldId, status: 'failed', reason: 'no-such-field' };
  if (field.fp !== target.fp) return { fieldId: target.fieldId, status: 'failed', reason: 'stale-field' };
  const view = doc.defaultView!;
  const dt = new view.DataTransfer();
  dt.items.add(new view.File([file.bytes as BlobPart], file.name, { type: file.mime }));
  el.files = dt.files;
  fire(el, 'input');
  fire(el, 'change');
  const shown = el.files?.[0]?.name ?? '';
  return shown === file.name ? { fieldId: target.fieldId, status: 'filled', shown } : { fieldId: target.fieldId, status: 'failed', reason: 'value-mismatch', shown };
}
