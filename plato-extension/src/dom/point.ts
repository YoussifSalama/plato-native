import { deepQueryAll } from './deep';
import { ctlChecked, ctlValue, inspectForm, isVisible, markPicked, resolveField } from './inspect';
import { refElement } from './snapshot';
import { norm } from './text';

// Geometry for trusted input. The panel presses with real (CDP) mouse and key events; this side only
// answers "where is it" and "what does it show now", after scrolling the target into view. Nothing
// here changes the page except scrolling and remembering a verified pick.
export interface Point {
  x: number;
  y: number;
}
const seenBefore = new WeakMap<Element, Set<Element>>(); // combobox -> options visible before it was opened
export const optionText = (o: Element) => (o.textContent ?? '').replace(/\s+/g, ' ').trim();
const visibleOptions = (doc: Document) => deepQueryAll<HTMLElement>(doc, '[role="option"]').filter((o) => isVisible(o, doc));
// The widget's own list: what aria-controls / aria-owns names, else the options that appeared since it was opened.
function ownOptions(el: Element): HTMLElement[] {
  const doc = el.ownerDocument;
  const id = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  const box = id ? ((el.getRootNode() as Document | ShadowRoot).getElementById?.(id) ?? doc.getElementById(id)) : null;
  const inBox = box ? deepQueryAll<HTMLElement>(box, '[role="option"]').filter((o) => isVisible(o, doc)) : [];
  if (inBox.length) return inBox;
  const before = seenBefore.get(el);
  return visibleOptions(doc).filter((o) => !before?.has(o));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Pages with CSS smooth scrolling animate scrollIntoView: ask for an instant one, then let layout settle.
async function bringIn(el: Element, block: ScrollLogicalPosition = 'center') {
  el.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' as ScrollBehavior });
  await wait(120);
}
// The box a person would press: the control itself, or (a few-pixel hidden input, as react-select has) the
// nearest ancestor wide enough to hit.
function pressBox(el: Element): Element {
  let box = el;
  for (let i = 0; i < 5 && box.getBoundingClientRect().width < 24 && box.parentElement; i++) box = box.parentElement;
  return box;
}
export async function pointOf(el: Element, block: ScrollLogicalPosition = 'center'): Promise<Point | null> {
  const box = pressBox(el);
  await bringIn(box, block);
  const r = box.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: Math.round(r.left + Math.min(r.width / 2, 60)), y: Math.round(r.top + r.height / 2) };
}

const fieldOf = (doc: Document, formId: string, fieldId: string, fp?: string) => {
  let fresh;
  try {
    fresh = inspectForm(doc, formId);
  } catch {
    return { error: 'stale-form' as const };
  }
  const field = fresh.fields.find((f) => f.id === fieldId);
  const els = resolveField(doc, fieldId);
  if (!field || !els?.length) return { error: 'no-such-field' as const };
  if (fp !== undefined && field.fp !== fp) return { error: 'stale-field' as const };
  return { field, els };
};

/** Where to press a field. A combobox also remembers which options were already on the page. */
export async function fieldPoint(doc: Document, formId: string, fieldId: string, fp: string): Promise<{ point: Point | null; kind?: string; error?: string }> {
  const f = fieldOf(doc, formId, fieldId, fp);
  if ('error' in f) return { point: null, error: f.error };
  const el = f.els[0]!;
  if (f.field.kind === 'combobox') seenBefore.set(el, new Set(visibleOptions(doc)));
  return { point: await pointOf(el), kind: f.field.kind };
}

/** Each box of a checkbox / radio group: its value, state, where to press (the box, or its label when the box is hidden). */
export async function groupState(doc: Document, formId: string, fieldId: string): Promise<{ options: { value: string; checked: boolean; point: Point | null }[]; vh?: string; error?: string }> {
  const f = fieldOf(doc, formId, fieldId);
  if ('error' in f) return { options: [], error: f.error };
  const options = [];
  for (const el of f.els as HTMLElement[]) {
    // a real box big enough to hit, else the label a person would click (styled boxes hide the input)
    const native = el.tagName === 'INPUT';
    const small = el.getBoundingClientRect().width < 8 || el.getBoundingClientRect().height < 8;
    const target = native && small ? ((el as HTMLInputElement).labels?.[0] ?? el.parentElement ?? el) : el;
    options.push({ value: ctlValue(el), checked: ctlChecked(el), point: await pointOf(target, 'center') });
  }
  return { options, vh: f.field.vh };
}

/** What an open combobox offers, as the site shows it. */
export function comboOptions(doc: Document, formId: string, fieldId: string): { options: string[]; error?: string } {
  const f = fieldOf(doc, formId, fieldId);
  if ('error' in f) return { options: [], error: f.error };
  return { options: ownOptions(f.els[0]!).map(optionText).filter(Boolean) };
}

/** Where to press one option of an open combobox (scrolled into the list's view). */
export async function optionPoint(doc: Document, formId: string, fieldId: string, text: string): Promise<Point | null> {
  const f = fieldOf(doc, formId, fieldId);
  if ('error' in f) return null;
  const want = norm(text);
  const opts = ownOptions(f.els[0]!);
  const o = opts.find((x) => norm(optionText(x)) === want) ?? opts.find((x) => norm(optionText(x)).includes(want));
  return o ? pointOf(o, 'nearest') : null;
}

/** Did the pick take? The input shows it, or the widget's own box shows it (and not just the option list). */
export function comboVerify(doc: Document, formId: string, fieldId: string, chosen: string): { ok: boolean; shown: string; vh?: string } {
  const f = fieldOf(doc, formId, fieldId);
  if ('error' in f) return { ok: false, shown: '' };
  const el = f.els[0] as HTMLInputElement;
  const c = norm(chosen);
  let w: Element = el;
  for (let i = 0; i < 5 && w.parentElement; i++) {
    w = w.parentElement;
    if (w.tagName === 'FORM' || w.tagName === 'FIELDSET' || w.tagName === 'BODY' || w.querySelectorAll('input, select, textarea').length > 1) break;
  }
  const listText = ownOptions(el).map(optionText).join(' ');
  const widgetText = norm(w.textContent ?? '');
  const ok = norm(el.value) === c || (widgetText.includes(c) && !norm(listText).includes(c));
  if (ok) markPicked(doc, el);
  const vh = ok ? inspectForm(doc, formId).fields.find((x) => x.id === fieldId)?.vh : undefined;
  return { ok, shown: norm(el.value) || widgetText.slice(0, 80), vh };
}

/** Where to press a control the planner named (by its snapshot ref). */
export async function refPoint(doc: Document, ref: string): Promise<Point | null> {
  const el = refElement(ref);
  return el && el.isConnected && isVisible(el, doc) ? pointOf(el) : null;
}
