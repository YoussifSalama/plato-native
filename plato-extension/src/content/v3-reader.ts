// Engine v3 page reader: the content-script half of the browser use tool members. It reads the page as
// `role "name" state [ref_N]` lines (the tree the model plans on), keeps the ref registry for the tab, sets
// form values, answers where a ref is to press, and says what a ref is (the Submit gate). Nothing here
// presses a control, submits, or sends anything. Ported from the v3 spike driver (scripts/v3-spike/cdp-browser.ts).
import { pageState, type PageState } from '../dom/page-state';

export interface Point {
  x: number;
  y: number;
}
export interface ElementInfo {
  tag: string;
  type: string;
  text: string;
  role: string;
  isSubmit: boolean;
}
export interface PageInfo {
  url: string;
  title: string;
  width: number;
  height: number;
}
export type V3Op =
  | { op: 'read_page'; filter?: string | null; ref?: string | null }
  | { op: 'find'; query: string }
  | { op: 'page_text' }
  | { op: 'form_input'; ref: string; value: unknown }
  | { op: 'resolve'; ref: string } // scrolls it into view; the point to press
  | { op: 'ready'; ref: string; capMs?: number } // waits until it can really be pressed (in view, visible, enabled, still, not covered)
  | { op: 'describe'; ref?: string; x?: number; y?: number } // what is there (the Submit gate)
  | { op: 'set_file'; ref: string; name: string; mime: string; data: string } // base64 bytes into the file input at/near the ref
  | { op: 'guard'; ms: number } // cancel any form submit for the next ms
  | { op: 'guarded' } // how many submits the guard cancelled since it was armed (and reset)
  | { op: 'info' }
  | { op: 'state' };
export const V3_OPS = new Set(['read_page', 'find', 'page_text', 'form_input', 'resolve', 'ready', 'describe', 'set_file', 'guard', 'guarded', 'info', 'state']);

// One registry per page: refs survive until a navigation (the script reloads with the page).
const R = { next: 1, byRef: new Map<string, Element>(), byEl: new WeakMap<Element, string>() };
const refOf = (el: Element) => {
  let r = R.byEl.get(el);
  if (!r) {
    r = `ref_${R.next++}`;
    R.byEl.set(el, r);
    R.byRef.set(r, el);
  }
  return r;
};
const elOf = (ref: string) => {
  const el = R.byRef.get(ref);
  return el && el.isConnected ? el : undefined;
};
export const STALE = (ref: string) => `Unknown or stale ref: ${ref}. Call read_page again for current refs.`;

type Ctl = HTMLInputElement;
const txt = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const inner = (el: Element) => (el as HTMLElement).innerText ?? el.textContent ?? '';
const vis = (el: Element, doc: Document) => {
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 || r.height > 0)) return false;
  const s = doc.defaultView!.getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"]');
};
const byIds = (doc: Document, ids: string | null) =>
  (ids ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((i) => doc.getElementById(i))
    .filter((n): n is HTMLElement => !!n)
    .map((n) => txt(inner(n)))
    .join(' ');
// The question a box of controls asks (a heading or label above them), when no label points at the control itself.
function boxLabel(el: Element): string {
  let box: Element = el;
  for (let i = 0; i < 4 && box.parentElement; i++) {
    const up = box.parentElement;
    if (['FORM', 'FIELDSET', 'BODY'].includes(up.tagName)) break;
    if ([...up.querySelectorAll('input,select,textarea,[role=combobox],[role=textbox]')].some((c) => c !== el && !((c as Ctl).type === 'radio' || (c as Ctl).type === 'checkbox'))) break;
    box = up;
  }
  if (box === el) return '';
  const cands = [...box.querySelectorAll('label,legend,h1,h2,h3,h4,h5,h6,[class*="label" i],[class*="question" i],[class*="title" i],[class*="heading" i],p')].filter((n) => !n.contains(el) && n.compareDocumentPosition(el) & 4 && !n.querySelector('input,select,textarea'));
  const n = cands.pop();
  return n ? txt(inner(n)).slice(0, 160) : '';
}
function labelText(el: Element, doc: Document): string {
  const c = el as Ctl;
  const forLabel = c.id ? doc.querySelector(`label[for="${c.id.replace(/["\\]/g, '\\$&')}"]`) : null;
  return txt(el.getAttribute('aria-label')) || byIds(doc, el.getAttribute('aria-labelledby')) || (c.labels?.[0] ? txt(inner(c.labels[0])) : '') || (forLabel ? txt(inner(forLabel)) : '') || boxLabel(el) || txt(el.getAttribute('placeholder')) || txt(el.getAttribute('title')) || txt(c.name);
}
// The pick a type-ahead shows next to its (now empty) text box: the nearest small container's text without the placeholder.
function chosenText(el: Element): string {
  const ph = txt((el as Ctl).placeholder);
  let box = el.parentElement;
  for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
    const sel = box.querySelector('[class*="single-value" i], [class*="selected-value" i], [class*="selectedValue" i], [class*="value-container" i] > div:not([class*="placeholder" i]):not([class*="input" i])');
    if (sel) {
      const t = txt(inner(sel));
      if (t && t !== ph) return t;
    }
    const t = txt(inner(box)).replace(ph, '').trim();
    if (t && t.length <= 80 && !box.querySelector('input:not([role=combobox]), select, textarea')) return t;
  }
  return '';
}
const required = (el: Element, doc: Document) => !!((el as Ctl).required || el.getAttribute('aria-required') === 'true' || /[*✱]\s*$/.test(labelText(el, doc)) || ((el as Ctl).labels?.[0] && /required/i.test((el as Ctl).labels![0]!.className)));
export function roleOf(el: Element): string {
  const r = el.getAttribute('role');
  if (r) return r;
  const t = el.tagName;
  if (t === 'A') return 'link';
  if (t === 'BUTTON') return 'button';
  if (t === 'SELECT') return 'combobox';
  if (t === 'TEXTAREA') return 'textbox';
  if (/^H[1-6]$/.test(t)) return 'heading';
  if (t === 'LABEL' || t === 'LEGEND') return 'text';
  if (t === 'INPUT') {
    const ty = ((el as Ctl).type || 'text').toLowerCase();
    return ty === 'checkbox' ? 'checkbox' : ty === 'radio' ? 'radio' : ty === 'file' ? 'file-input' : ty === 'submit' || ty === 'button' ? 'button' : ty === 'number' ? 'spinbutton' : el.getAttribute('aria-autocomplete') ? 'combobox' : 'textbox';
  }
  return 'generic';
}
const FIELD_ROLES = new Set(['textbox', 'combobox', 'checkbox', 'radio', 'spinbutton', 'file-input', 'listbox']);
// One line per control: role, name, required, its value/state, the page's own error, and the ref.
export function describe(el: Element, doc: Document): string {
  const role = roleOf(el);
  const c = el as Ctl;
  const parts: string[] = [];
  const name = FIELD_ROLES.has(role) ? labelText(el, doc) : txt(inner(el) || c.value || el.getAttribute('aria-label') || (el as HTMLImageElement).alt || '');
  parts.push(`${role} "${name.slice(0, 120)}"`);
  if (FIELD_ROLES.has(role) && required(el, doc)) parts.push('required');
  if (el.tagName === 'SELECT') {
    const s = el as HTMLSelectElement;
    const sel = s.options[s.selectedIndex];
    if (sel && sel.value !== '') parts.push(`value="${txt(sel.text).slice(0, 60)}"`);
    const opts = [...s.options].filter((o) => o.value !== '').map((o) => txt(o.text)).slice(0, 12);
    if (opts.length) parts.push(`options: ${opts.join(' | ')}${s.options.length > 13 ? ' | …' : ''}`);
  } else if (role === 'checkbox' || role === 'radio') parts.push(c.checked || el.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked');
  else if (role === 'file-input') parts.push(c.files?.length ? `file="${c.files[0]!.name}"` : 'no file');
  else if (role === 'combobox') {
    const shown = txt(c.value) || chosenText(el);
    if (shown) parts.push(`value="${shown.slice(0, 60)}"`);
  } else if ('value' in el && c.value && role !== 'button') parts.push(`value="${txt(c.value).slice(0, 60)}"`);
  if (el.getAttribute('aria-invalid') === 'true') {
    const e = byIds(doc, el.getAttribute('aria-errormessage') || el.getAttribute('aria-describedby'));
    parts.push(`error="${(e || 'invalid').slice(0, 100)}"`);
  } else if (typeof c.checkValidity === 'function' && !c.checkValidity() && c.validationMessage && !c.validity?.valueMissing) parts.push(`error="${txt(c.validationMessage).slice(0, 100)}"`); // a native constraint (pattern, type) on a value: the browser shows it only as a tooltip; an empty required field already says `required`
  if (c.disabled) parts.push('disabled');
  return `${parts.join(' ')} [${refOf(el)}]`;
}

const INTERACTIVE = 'a[href], button, input, select, textarea, [role=button], [role=link], [role=combobox], [role=textbox], [role=checkbox], [role=radio], [role=option], [contenteditable=true]';
export function readPage(doc: Document, filter?: string | null, scopeRef?: string | null): string {
  const root: ParentNode = (scopeRef ? elOf(scopeRef) : undefined) ?? doc;
  const sel = filter === 'interactive' ? INTERACTIVE : `${INTERACTIVE}, h1, h2, h3, h4, legend, label`;
  const lines: string[] = [];
  const h = doc.defaultView?.innerHeight ?? 900;
  for (const el of root.querySelectorAll(sel)) {
    if (!vis(el, doc)) continue;
    if (filter !== 'all') {
      const r = el.getBoundingClientRect();
      if (r.bottom < -2000 || r.top > h + 4000) continue;
    }
    if (el.tagName === 'LABEL' && (el as HTMLLabelElement).control) continue; // its control carries the text
    if (el.closest('[role=listbox]') && el.getAttribute('role') !== 'option') continue;
    lines.push(describe(el, doc));
  }
  const out = lines.join('\n');
  return out.length > 50_000 ? `${out.slice(0, 50_000)}\n…(truncated)` : out;
}
// A heuristic find (the tool allows one): the controls whose name/role/id share the most words with the query.
export function find(doc: Document, query: string): string {
  const words = txt(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const scored: [number, string][] = [];
  for (const el of doc.querySelectorAll(`${INTERACTIVE}, h1, h2, h3, label`)) {
    if (!vis(el, doc) || (el.tagName === 'LABEL' && (el as HTMLLabelElement).control)) continue; // its control carries the text
    const line = describe(el, doc);
    const hay = `${line} ${labelText(el, doc)} ${(el as Ctl).name ?? ''} ${el.id}`.toLowerCase();
    const hits = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (hits) scored.push([hits + (el.matches(INTERACTIVE) ? 0.5 : 0), line]); // a control over a heading with the same words
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 20).map((s) => s[1]).join('\n');
}
export const pageText = (doc: Document) => txt(inner(doc.querySelector('main') ?? doc.body)).slice(0, 50_000);

const setNative = (node: Element, v: string) => {
  const w = node.ownerDocument.defaultView!;
  const proto = node.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : node.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  const d = Object.getOwnPropertyDescriptor(proto, 'value');
  if (d?.set) d.set.call(node, v);
  else (node as Ctl).value = v;
  node.dispatchEvent(new w.InputEvent('input', { bubbles: true, composed: true }));
  node.dispatchEvent(new w.Event('change', { bubbles: true }));
};
/** Set a value the way the tool contract describes; boxes come back with the point to press (a real click, not a scripted tick). */
export function formInput(doc: Document, ref: string, value: unknown): { ok: boolean; message: string; clickPoint?: Point } {
  const el = elOf(ref);
  if (!el) return { ok: false, message: STALE(ref) };
  const want = String(value);
  if (el.tagName === 'SELECT') {
    const s = el as HTMLSelectElement;
    const opts = [...s.options];
    const opt = opts.find((o) => o.value === want) ?? opts.find((o) => txt(o.text).toLowerCase() === want.toLowerCase()) ?? opts.find((o) => txt(o.text).toLowerCase().includes(want.toLowerCase()));
    if (!opt) return { ok: false, message: `No option matches "${want}". Options: ${opts.map((o) => txt(o.text)).join(' | ')}` };
    s.focus();
    setNative(s, opt.value);
    s.blur();
    return s.value === opt.value ? { ok: true, message: `Selected "${txt(opt.text)}"` } : { ok: false, message: 'The select did not keep the value' };
  }
  const role = roleOf(el);
  const c = el as Ctl;
  if (role === 'checkbox' || role === 'radio') {
    const wantOn = value === true || /^(true|yes|on|checked|1)$/i.test(want);
    const isOn = c.checked || el.getAttribute('aria-checked') === 'true';
    if (isOn === wantOn) return { ok: true, message: wantOn ? 'Already checked' : 'Already unchecked' };
    const box = c.labels?.[0] && vis(c.labels[0], doc) && !vis(el, doc) ? c.labels[0] : el;
    box.scrollIntoView?.({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const r = box.getBoundingClientRect();
    return { ok: true, message: wantOn ? 'Checked' : 'Unchecked', clickPoint: { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 } };
  }
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    c.focus();
    setNative(el, want);
    c.blur();
    const shown = String(c.value);
    const digits = (s: string) => s.replace(/\D/g, '');
    const ok = shown === want || (c.type === 'tel' && !!digits(want) && (digits(shown) === digits(want) || digits(want).endsWith(digits(shown))));
    return ok ? { ok: true, message: `Set to "${shown.slice(0, 60)}"` } : { ok: false, message: `The field shows "${shown.slice(0, 60)}" instead; for a type-ahead list, click it, type, then click the matching option` };
  }
  return { ok: false, message: 'form_input works on inputs, selects, checkboxes and radios; use left_click and type for this element' };
}
/** Where to press a ref, after scrolling it into view. */
export function resolve(ref: string): Point | null {
  const el = elOf(ref);
  if (!el) return null;
  el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
// Is a ref ready for a person's press? The checks a careful person makes without noticing: it is on screen,
// shown, enabled, has stopped moving (an animation, a layout shift after load), and nothing sits on top of it
// (a cookie banner, a modal, a sticky header). Waits up to capMs; a press that would miss is never sent.
export type Readiness = { ok: true; point: Point } | { ok: false; reason: string };
export async function ready(doc: Document, ref: string, capMs = 4000): Promise<Readiness> {
  const el = elOf(ref);
  if (!el) return { ok: false, reason: STALE(ref) };
  const view = doc.defaultView!;
  el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
  const wait = (ms: number) => new Promise((r) => view.setTimeout(r, ms));
  const until = Date.now() + capMs;
  let last: DOMRect | null = null;
  let why: string;
  for (;;) {
    if (!el.isConnected) return { ok: false, reason: STALE(ref) };
    const r = el.getBoundingClientRect();
    const style = view.getComputedStyle(el as HTMLElement);
    const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const still = !!last && Math.abs(last.left - r.left) < 1 && Math.abs(last.top - r.top) < 1 && Math.abs(last.width - r.width) < 1;
    const inView = point.y >= 0 && point.x >= 0 && point.y <= view.innerHeight && point.x <= view.innerWidth;
    const hit = inView && typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(point.x, point.y) : null;
    const label = (el as Ctl).labels?.[0];
    const reachable = !hit || hit === el || el.contains(hit) || hit.contains(el) || (!!label && (hit === label || label.contains(hit)));
    why =
      !(r.width > 0 && r.height > 0) || style.visibility === 'hidden' || style.display === 'none' ? 'it is hidden'
      : (el as Ctl).disabled || el.getAttribute('aria-disabled') === 'true' ? 'it is disabled (a field above may still need a value)'
      : !inView ? 'it could not be scrolled into view'
      : !reachable ? `something covers it: ${describeElement(hit!).tag.toLowerCase()} "${describeElement(hit!).text.slice(0, 50)}" (close or answer that first)`
      : !still ? 'it is still moving'
      : '';
    if (!why) return { ok: true, point };
    if (Date.now() >= until) return { ok: false, reason: `Not pressed: ${why}.` };
    last = r;
    await wait(90);
  }
}
// The Submit control, by what it is: a submit button inside a form, or a control that says Submit/Send (application).
// "Apply", "Next", "Continue", "Review" are steps, not the submission.
const SUBMIT_TEXT = /^(submit( application| my application)?|send( application| my application)?)$/i;
const STEP_TEXT = /^(apply|apply now|apply for this job|start application|next|continue|review)$/i;
export function describeElement(el: Element): ElementInfo {
  const c = el as Ctl;
  const text = txt(inner(el) || c.value || el.getAttribute('aria-label') || '').slice(0, 80);
  const isSubmit = ((el.tagName === 'BUTTON' && c.type === 'submit' && !!el.closest('form')) || (el.tagName === 'INPUT' && c.type === 'submit') || SUBMIT_TEXT.test(text)) && !STEP_TEXT.test(text);
  return { tag: el.tagName, type: c.type || '', text, role: el.getAttribute('role') || '', isSubmit };
}
export function describeAt(doc: Document, q: { ref?: string; x?: number; y?: number }): ElementInfo | null {
  let el: Element | null | undefined = q.ref ? elOf(q.ref) : typeof q.x === 'number' && typeof q.y === 'number' ? doc.elementFromPoint(q.x, q.y) : undefined;
  if (el && el.nodeType !== 1) el = null; // a text node: nothing a press is gated on
  el = el?.closest('button, a, input, [role=button], [role=link]') ?? el;
  return el ? describeElement(el) : null;
}
/** The staged resume into the file input the ref names (or the nearest one: sites hide the input behind a styled button). */
export function setFile(doc: Document, ref: string, file: { name: string; mime: string; data: string }): { ok: boolean; message: string } {
  const el = elOf(ref);
  if (!el) return { ok: false, message: STALE(ref) };
  const input = el.tagName === 'INPUT' && (el as Ctl).type === 'file' ? (el as Ctl) : ((el.closest('form, fieldset, div') ?? doc).querySelector<Ctl>('input[type=file]') ?? doc.querySelector<Ctl>('input[type=file]'));
  if (!input) return { ok: false, message: 'file_upload: no file input at or near that ref' };
  const w = doc.defaultView!;
  const dt = new w.DataTransfer();
  dt.items.add(new w.File([Uint8Array.from(atob(file.data), (ch) => ch.charCodeAt(0)) as BlobPart], file.name, { type: file.mime }));
  input.files = dt.files;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  return input.files?.[0]?.name === file.name ? { ok: true, message: `Uploaded ${file.name}` } : { ok: false, message: 'file_upload: the input did not take the file' };
}

// The submit guard: while armed, any form submission the page attempts is cancelled and counted. The executor arms it
// around every press and key while Submit is not allowed, so a stray Enter or a mislabelled control cannot send the form.
const guard = { until: 0, blocked: 0 };
export function installGuard(doc: Document) {
  doc.addEventListener(
    'submit',
    (e) => {
      if (Date.now() >= guard.until) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      guard.blocked++;
    },
    true,
  );
}
export const pageInfo = (doc: Document): PageInfo => ({ url: doc.location?.href ?? '', title: txt(doc.title), width: doc.defaultView?.innerWidth ?? 0, height: doc.defaultView?.innerHeight ?? 0 });

/** One entry point for the content script. */
export function handle(doc: Document, m: V3Op): unknown {
  switch (m.op) {
    case 'read_page':
      return readPage(doc, m.filter, m.ref);
    case 'find':
      return find(doc, m.query);
    case 'page_text':
      return pageText(doc);
    case 'form_input':
      return formInput(doc, m.ref, m.value);
    case 'resolve':
      return resolve(m.ref);
    case 'ready':
      return ready(doc, m.ref, m.capMs);
    case 'describe':
      return describeAt(doc, m);
    case 'set_file':
      return setFile(doc, m.ref, m);
    case 'guard':
      guard.until = Date.now() + Math.min(m.ms, 5000);
      guard.blocked = 0;
      return { ok: true };
    case 'guarded': {
      const n = guard.blocked; // read once, and the guard is off: an allowed Submit press must go through
      guard.blocked = 0;
      guard.until = 0;
      return { blocked: n };
    }
    case 'info':
      return pageInfo(doc);
    case 'state':
      return pageState(doc) satisfies PageState;
  }
}
