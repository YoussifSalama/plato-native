import type { FieldInfo, FieldKind, FieldOption, FormInfo, FormList, Inspection } from './types';
import { clean, norm } from './text';
import { deepQueryAll, DIALOG_SELECTOR } from './deep';

// Read-only inspection of a page's form controls. It reports what a person
// could see and edit: visible, enabled controls only. Sensitive fields are
// counted and never described. Nothing here changes the page.

const SENSITIVE_AUTOCOMPLETE = /^(current-password|new-password|one-time-code|webauthn|cc-.*)$/;
const SENSITIVE_TEXT = /\b(pass(word|code|phrase)?|otp|one time (code|pass)|2fa|mfa|verification code|security code|cvv|cvc|card (number|no)|credit card|debit card|iban|ssn|social security|national id|pin)\b/;
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const CUSTOM_ROLES = new Set(['combobox', 'listbox', 'textbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'searchbox']);

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Element -> id, so ids stay the same across repeated inspections of a page
// whose fields appear and disappear. Held in the content world only.
interface Registry {
  ids: WeakMap<Element, string>;
  formIds: WeakMap<Element, string>;
  forms: Map<string, Element>;
  groups: Map<string, Element[]>;
  picked: WeakSet<Element>; // type-ahead inputs whose option was chosen (their value box may clear itself)
  // ponytail: re-rendering pages (Greenhouse hydrates ~seconds after load) swap the elements;
  // the HTML id/name carries our id over to the replacement. No id/name: the old id is lost.
  keys: Map<string, { id: string; el: Element }>;
  next: number;
  nextForm: number;
}
const registries = new WeakMap<Document, Registry>();
const registryOf = (doc: Document): Registry => {
  let r = registries.get(doc);
  if (!r) registries.set(doc, (r = { ids: new WeakMap(), formIds: new WeakMap(), forms: new Map(), groups: new Map(), keys: new Map(), picked: new WeakSet(), next: 1, nextForm: 1 }));
  return r;
};
const keyOf = (el: Element) => (el.id ? `${el.tagName}#${el.id}` : el.getAttribute('name') ? `${el.tagName}@${el.getAttribute('name')}` : null);
// Same element, or the replacement of one that left the page: the same id. Two live elements never share one.
const stableId = (reg: Registry, map: WeakMap<Element, string>, el: Element, fresh: () => string) => {
  let id = map.get(el);
  if (id) return id;
  const key = keyOf(el);
  const prev = key ? reg.keys.get(key) : undefined;
  id = prev && !prev.el.isConnected ? prev.id : fresh();
  map.set(el, id);
  if (key) reg.keys.set(key, { id, el });
  return id;
};
const idFor = (reg: Registry, el: Element) => stableId(reg, reg.ids, el, () => `f${reg.next++}`);

/** The elements behind an id from the latest inspection (all radios/checkboxes of a group). */
export const resolveField = (doc: Document, id: string): Element[] | undefined => registryOf(doc).groups.get(id);
/** A type-ahead input's option was chosen: it holds a value even if the page cleared its text box. */
export const markPicked = (doc: Document, el: Element) => void registryOf(doc).picked.add(el);

const PAGE = 'page'; // pages with no <form>: the body is the form

const formIdFor = (doc: Document, el: Element) => {
  const reg = registryOf(doc);
  const id = stableId(reg, reg.formIds, el,() => `form${reg.nextForm++}`);
  reg.forms.set(id, el);
  return id;
};

// ---- stable hashes (FNV-1a): fingerprints and value hashes, never the content ----
export const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

// ---- visibility ----------------------------------------------------------

function hasLayout(doc: Document) {
  // jsdom has no layout engine: every rect is empty, so rect checks would hide everything there.
  return !!doc.body && doc.body.getClientRects().length > 0;
}

export function isVisible(el: Element, doc: Document = el.ownerDocument): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if ((n as HTMLElement).hidden || n.hasAttribute('inert') || n.getAttribute('aria-hidden') === 'true') return false;
    const s = view.getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
  }
  if (hasLayout(doc)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    // pushed far off the PAGE (a common honeypot trick). Page coordinates, not viewport ones: a field above the
    // current scroll position is on the page (seen live 2026-10-24: First Name dropped once the page scrolled down).
    if (r.right + view.scrollX < -500 || r.bottom + view.scrollY < -500) return false;
  }
  return true;
}

// ---- labels --------------------------------------------------------------

// Raw label text (controls removed, whitespace collapsed). `clean` strips the
// "*" / "(required)" marks, so they are read from here first.
function rawText(node: Element) {
  const c = node.cloneNode(true) as Element;
  c.querySelectorAll('input,select,textarea,button,script,style,option,svg').forEach((n) => n.remove());
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim();
}
const starred = (raw: string) => /([*✱＊]|\(\s*required\s*\))\s*$/i.test(raw);
// The part of a wrapping label that comes before the control: what names it. Widget text after the
// control ("No location found", "Loading…") is status, not the label.
function rawTextBefore(label: Element, el: Element) {
  const c = label.cloneNode(true) as Element;
  const path = new Set<Node>();
  for (let n: Node | null = el; n && n !== label; n = n.parentNode) path.add(n);
  // same shape in the clone: walk both trees in parallel by child index
  const twin = (orig: Node, clone: Node): Node | null => {
    if (orig === label) return clone;
    const parent = twin(orig.parentNode!, clone);
    if (!parent) return null;
    return parent.childNodes[Array.from(orig.parentNode!.childNodes).indexOf(orig as ChildNode)] ?? null;
  };
  const cut = twin(el, c);
  if (cut) {
    // drop the control and everything after it, at every level up to the label
    for (let n: Node | null = cut; n && n !== c; ) {
      const next: Node | null = n.parentNode;
      while (n.nextSibling) n.nextSibling.remove();
      (n as ChildNode).remove();
      n = next;
      if (n === c) break;
      // stop deleting siblings once at the label's own children: only what follows the control's branch goes
    }
  }
  c.querySelectorAll('input,select,textarea,button,script,style,option,svg').forEach((n) => n.remove());
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function byIds(doc: Document | ShadowRoot, ids: string | null) {
  return (ids ?? '')
    .split(/\s+/)
    .map((i) => (i ? doc.getElementById(i) : null))
    .filter((n): n is HTMLElement => !!n);
}

const LABELLING = 'label, legend, h1, h2, h3, h4, h5, h6, [class*="label" i], [class*="question" i], [class*="title" i], [class*="heading" i], p';
function boxLabel(el: Control): { label: string; starred: boolean } | null {
  const sameGroup = (c: Element) => c.tagName === 'INPUT' && ['radio', 'checkbox'].includes((c as HTMLInputElement).type) && (c as HTMLInputElement).name === (el as HTMLInputElement).name;
  let box: Element = el;
  for (let i = 0; i < 4 && box.parentElement; i++) {
    const up = box.parentElement;
    if (up.tagName === 'FORM' || up.tagName === 'FIELDSET' || up.tagName === 'BODY') break;
    if (controlsIn(up).some((c) => c !== el && !sameGroup(c))) break;
    box = up;
  }
  if (box === el) return null;
  const nodes = Array.from(box.querySelectorAll(LABELLING)).filter((n) => !n.contains(el) && (n.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !controlsIn(n).length);
  for (const n of nodes.reverse()) {
    const raw = rawText(n).replace(/[✱＊]/g, '*');
    const t = clean(raw);
    if (t.length >= 2 && t.length <= 200) return { label: t, starred: starred(raw) || /required/i.test(n.className) };
  }
  return null;
}

function labelOf(el: Control): { label: string; source: FieldInfo['labelSource']; starred: boolean } {
  const labelled = byIds(el.getRootNode() as Document | ShadowRoot, el.getAttribute('aria-labelledby')); // the element's own root: a shadow root has its own ids
  if (labelled.length) {
    const raw = labelled.map(rawText).join(' ').replace(/[✱＊]/g, '*');
    const t = clean(raw);
    if (t) return { label: t, source: 'aria-labelledby', starred: starred(raw) };
  }
  const labels = Array.from((el as HTMLInputElement).labels ?? []);
  const direct = labels.find((l) => !l.contains(el));
  const wrap = labels.find((l) => l.contains(el));
  for (const [l, source] of [[direct, 'label-for'], [wrap, 'label-wrap']] as const) {
    const raw = l ? (source === 'label-wrap' ? rawTextBefore(l, el) || rawText(l) : rawText(l)).replace(/[✱＊]/g, '*') : '';
    const t = clean(raw);
    if (t) return { label: t, source, starred: starred(raw) };
  }
  const ariaRaw = el.getAttribute('aria-label') ?? '';
  const aria = clean(ariaRaw);
  if (aria) return { label: aria, source: 'aria-label', starred: starred(ariaRaw) };
  const legend = el.closest('fieldset')?.querySelector(':scope > legend');
  if (legend && (el as HTMLInputElement).type !== 'text') {
    const raw = rawText(legend);
    const t = clean(raw);
    if (t) return { label: t, source: 'legend', starred: starred(raw) };
  }
  // No real label: the question text inside the control's own box (a <label for> pointing at an id the
  // control does not have, Ashby; a heading div next to the select, Lever). The box is the nearest
  // ancestor that holds no other control; the text is the last labelling block before the control.
  const box = boxLabel(el);
  if (box) return { label: box.label, source: 'box', starred: box.starred };
  const title = clean(el.getAttribute('title') ?? '');
  if (title) return { label: title, source: 'title', starred: false };
  const ph = clean(el.getAttribute('placeholder') ?? '');
  if (ph) return { label: ph, source: 'placeholder', starred: false };
  const name = clean((el.getAttribute('name') ?? '').replace(/[_\-[\]]+/g, ' '));
  return name ? { label: name, source: 'name', starred: false } : { label: '', source: 'none', starred: false };
}

const isSensitive = (el: Control, label: string) => {
  const ac = (el.getAttribute('autocomplete') ?? '').trim().toLowerCase().split(/\s+/).pop() ?? '';
  if (SENSITIVE_AUTOCOMPLETE.test(ac)) return true;
  if ((el as HTMLInputElement).type === 'password') return true;
  const hay = norm([label, el.getAttribute('name'), el.id, el.getAttribute('placeholder')].filter(Boolean).join(' '));
  return SENSITIVE_TEXT.test(hay);
};

const autocompleteOf = (el: Control) => {
  const t = (el.getAttribute('autocomplete') ?? '').trim().toLowerCase().split(/\s+/).pop();
  return t && t !== 'on' && t !== 'off' ? t : null;
};

// ---- root form -----------------------------------------------------------

function controlsIn(root: ParentNode) {
  return deepQueryAll<Control>(root, 'input,select,textarea'); // through open shadow roots too (web-component forms)
}

/** The registered form element, if it is still on the page (used by submit.ts). */
export const formElement = (doc: Document, formId: string): Element | undefined => {
  const el = registryOf(doc).forms.get(formId);
  return el?.isConnected ? el : undefined;
};

export const DIALOG = 'dialog';
/** The open modal that holds fields (a multi-step flow like LinkedIn Easy Apply). Only used when asked for: cookie banners are dialogs too. */
const openDialog = (doc: Document): HTMLElement | undefined =>
  deepQueryAll<HTMLElement>(doc, DIALOG_SELECTOR).find((d) => isVisible(d, doc) && d.querySelector('input,select,textarea'));

function rootFor(doc: Document, formId?: string): { root: ParentNode; formId: string; formCount: number } {
  if (formId === DIALOG) {
    const d = openDialog(doc);
    if (!d) throw new Error('unknown-form');
    return { root: d, formId: DIALOG, formCount: 1 };
  }
  const forms = Array.from(doc.forms);
  if (formId === PAGE || (!formId && !forms.length)) return { root: doc.body ?? doc, formId: PAGE, formCount: 0 };
  if (formId) {
    let el = registryOf(doc).forms.get(formId);
    if (el && !el.isConnected) {
      // re-rendered: the form now on the page with the same HTML id is this form
      const now = el.id ? doc.getElementById(el.id) : null;
      el = now?.tagName === el.tagName ? now : undefined;
      if (el) formIdFor(doc, el);
    }
    if (!el) throw new Error('unknown-form');
    return { root: el, formId, formCount: forms.length };
  }
  // No form named (tests, tools): the one with the most visible controls. The
  // content script never relies on this: it always passes the person's choice.
  let best = forms[0]!;
  let bestN = -1;
  for (const f of forms) {
    const n = controlsIn(f).filter((c) => !SKIP_TYPES.has((c as HTMLInputElement).type) && isVisible(c, doc)).length;
    if (n > bestN) [best, bestN] = [f, n];
  }
  return { root: best, formId: formIdFor(doc, best), formCount: forms.length };
}

const looksLikeSearch = (f: Element) =>
  f.getAttribute('role') === 'search' || /search/i.test(f.getAttribute('action') ?? '') || (controlsIn(f).filter((c) => !SKIP_TYPES.has((c as HTMLInputElement).type)).length === 1 && controlsIn(f).some((c) => (c as HTMLInputElement).type === 'search' || /^(q|query|search)$/i.test(c.getAttribute('name') ?? '')));

function formLabel(doc: Document, form: Element, index: number) {
  const aria = form.getAttribute('aria-label') ?? byIds(doc, form.getAttribute('aria-labelledby')).map(rawText).join(' ');
  const direct = clean(aria);
  if (direct) return direct;
  const legend = form.querySelector(':scope > fieldset > legend, :scope > legend');
  if (legend) return clean(rawText(legend));
  // the closest heading before the form
  for (let n: Element | null = form; n; n = n.parentElement) {
    for (let p = n.previousElementSibling; p; p = p.previousElementSibling) {
      const h = p.matches('h1,h2,h3,h4,h5,h6') ? p : p.querySelector('h1,h2,h3,h4,h5,h6');
      if (h) return clean(rawText(h));
    }
  }
  return clean(form.getAttribute('name') ?? '') || `Form ${index + 1}`;
}

/**
 * The forms on the page, and which to review. Exactly one plausible form (real fields, not a search
 * box): that one. Otherwise the whole page: fields outside any form, or several forms, each field
 * tagged with its form's label so the AI picks by context (it never fills "Refer a friend").
 */
export function listForms(doc: Document, scope?: 'dialog'): FormList {
  if (scope === 'dialog' && openDialog(doc)) {
    const i = inspectForm(doc, DIALOG);
    return { forms: [{ id: DIALOG, label: 'Dialog', fieldCount: i.fields.length, unsupportedCount: i.unsupported.length, sample: i.fields.slice(0, 3).map((f) => f.label) }], selected: DIALOG };
  }
  const forms = Array.from(doc.forms);
  if (!forms.length) {
    const i = inspectForm(doc, PAGE);
    return { forms: [{ id: PAGE, label: 'This page', fieldCount: i.fields.length, unsupportedCount: i.unsupported.length, sample: i.fields.slice(0, 3).map((f) => f.label) }], selected: PAGE };
  }
  const infos: (FormInfo & { plausible: boolean })[] = forms.map((f, n) => {
    const id = formIdFor(doc, f);
    const i = inspectForm(doc, id);
    const controls = i.fields.length + i.unsupported.length;
    return { id, label: formLabel(doc, f, n), fieldCount: i.fields.length, unsupportedCount: i.unsupported.length, sample: i.fields.slice(0, 3).map((x) => x.label), plausible: controls >= 2 && !looksLikeSearch(f) };
  });
  const plausible = infos.filter((f) => f.plausible);
  const list: FormInfo[] = infos.map((f) => ({ id: f.id, label: f.label, fieldCount: f.fieldCount, unsupportedCount: f.unsupportedCount, sample: f.sample }));
  if (plausible.length === 1) return { forms: list, selected: plausible[0]!.id };
  const page = inspectForm(doc, PAGE);
  return { forms: [...list, { id: PAGE, label: 'This page', fieldCount: page.fields.length, unsupportedCount: page.unsupported.length, sample: page.fields.slice(0, 3).map((f) => f.label) }], selected: PAGE };
}

// ---- inspection ----------------------------------------------------------

export function inspectForm(doc: Document, formId?: string): Inspection {
  const reg = registryOf(doc);
  reg.groups.clear();
  const { root, formId: fid, formCount } = rootFor(doc, formId);
  const out: Inspection = { formId: fid, fields: [], unsupported: [], sensitiveExcluded: 0, hidden: 0, formCount };
  const seenChoices = new Set<Element>(); // boxes already reported as part of a question

  const unsupported = (el: Control, reason: string) => {
    const { label, starred: star } = labelOf(el);
    out.unsupported.push({ id: idFor(reg, el), label, required: isRequired(el, star), reason });
  };

  for (const el of controlsIn(root)) {
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? ((el as HTMLInputElement).type || 'text').toLowerCase() : tag;
    if (tag === 'input' && SKIP_TYPES.has(type)) continue;
    const { label, source, starred: star } = labelOf(el);
    // Sensitive first: count it and never look at it again, visible or not.
    if (isSensitive(el, label)) {
      out.sensitiveExcluded++;
      continue;
    }
    // Uploads: fillable (the chosen resume), even when the page hides the input behind its own button.
    if (type === 'file') {
      if (!el.matches(':disabled')) push(out, reg, [el], 'file', type, label, source, star);
      continue;
    }
    if (!isVisible(el, doc) || el.matches(':disabled') || (el as HTMLInputElement).readOnly || el.closest('[inert]')) {
      out.hidden++;
      continue;
    }
    // Type-ahead / combobox inputs: a choice is typed, then picked from the list that appears (fill.ts).
    if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete')) {
      push(out, reg, [el], 'combobox', type, label, source, star);
      continue;
    }
    if (tag === 'textarea') {
      // free text: Plato never maps it from the profile, but a drafted/confirmed answer can be filled
      push(out, reg, [el], 'text', 'textarea', label, source, star);
      continue;
    }
    if (tag === 'select') {
      const s = el as HTMLSelectElement;
      if (s.multiple) {
        unsupported(el, 'select-multiple');
        continue;
      }
      const options: FieldOption[] = Array.from(s.options)
        .slice(0, 200)
        .map((o) => ({ value: o.value, label: clean(o.textContent ?? ''), disabled: o.disabled, placeholder: o.value === '' }));
      push(out, reg, [el], 'select', type, label, source, star, options);
      continue;
    }
    if (type === 'checkbox' || type === 'radio') {
      if (seenChoices.has(el)) continue;
      const name = (el as HTMLInputElement).name;
      const form = (el as HTMLInputElement).form;
      const sameKind = (c: Element) => c.tagName === 'INPUT' && (c as HTMLInputElement).type === type;
      let siblings = name ? controlsIn(form ?? doc).filter((c) => sameKind(c) && (c as HTMLInputElement).name === name && (c as HTMLInputElement).form === form) : [];
      let qroot: Element | null = null;
      if (siblings.length < 2) {
        // no shared name (or a name per box): the choices of one question share a container
        qroot = choiceRoot(el, sameKind, root);
        siblings = qroot ? deepQueryAll<Control>(qroot, 'input').filter(sameKind) : [el];
      }
      for (const c of siblings) seenChoices.add(c);
      const visible = siblings.filter((c) => choiceVisible(c, doc) && !c.matches(':disabled'));
      if (!visible.length) {
        out.hidden++;
        continue;
      }
      if (type === 'checkbox' && visible.length === 1) {
        // a lone box's required mark is often on its heading ("Consent *", drawn by CSS): look at its box too
        const near = qroot ?? el.closest('fieldset, [role="group"]') ?? el.parentElement?.parentElement?.parentElement ?? null;
        const titled = near ? questionOf(near, [label]) : null;
        push(out, reg, visible, 'checkbox', type, label, source, star || requiredMark(near) || !!titled?.starred);
      } else {
        const texts = visible.map((c) => labelOf(c).label);
        const split = splitQuestion(texts);
        const group = groupLabel(visible[0]!, doc, name);
        // the question's own text: a legend / labelled group, else the text of the box the choices sit in
        // (Ashby: question inside the fieldset, no legend, and a random id as the name)
        const box = qroot ?? choiceRoot(visible[0]!, sameKind, root);
        const fromBox = box ? questionOf(box, texts) : null;
        const q = split.question ? { label: split.question, starred: /[*✱]/.test(split.question) || group.starred } : group.label && group.source !== 'name' && group.source !== 'none' ? group : fromBox?.label ? fromBox : group;
        const kind: FieldKind = type === 'radio' ? 'radio' : 'checkbox-group';
        const options = visible.map((c, i) => ({ value: ctlValue(c), label: split.options[i] || texts[i]!, disabled: false, placeholder: false }));
        push(out, reg, visible, kind, type, clean(q.label) || group.label, group.source, q.starred || group.starred || !!fromBox?.starred || requiredMark(box), options);
      }
      continue;
    }
    if (type === 'text' || type === 'email' || type === 'tel' || type === 'number' || type === 'date' || type === 'url') {
      push(out, reg, [el], type as FieldKind, type, label, source, star);
      continue;
    }
    unsupported(el, `unsupported-type:${type}`);
  }

  // Custom (non-native) widgets: reported so the person knows, never touched.
  // Controls a script draws (divs and buttons with a role, aria-checked, aria-pressed, contenteditable): fields
  // like any other. Pressed with real (CDP) clicks, read back through their ARIA state.
  const scripted = deepQueryAll<HTMLElement>(root, '[role],[contenteditable],[aria-pressed]').filter((el) => !el.matches('input,select,textarea') && !seenChoices.has(el));
  for (const el of scripted) {
    if (seenChoices.has(el)) continue;
    const role = el.getAttribute('role') ?? '';
    const editable = el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '';
    const toggle = el.hasAttribute('aria-pressed') && (el.tagName === 'BUTTON' || role === 'button');
    if (!(CUSTOM_ROLES.has(role) || editable || toggle)) continue;
    if (el.closest('[role="listbox"], [role="option"], [role="menu"]') && role !== 'combobox') continue; // a list's own items
    if (!isVisible(el, doc) || el.getAttribute('aria-disabled') === 'true') {
      out.hidden++;
      continue;
    }
    const raw = byIds(el.getRootNode() as Document | ShadowRoot, el.getAttribute('aria-labelledby')).map(rawText).join(' ') || el.getAttribute('aria-label') || '';
    const required = el.getAttribute('aria-required') === 'true' || !!el.closest('[aria-required="true"]') || starred(raw);
    const kindOf = (n: Element) => (n.getAttribute('role') === 'radio' || (n.hasAttribute('aria-pressed') && (n.tagName === 'BUTTON' || n.getAttribute('role') === 'button')) ? 'radio' : 'checkbox');
    if (role === 'radio' || role === 'checkbox' || role === 'switch' || toggle) {
      const k = kindOf(el);
      const same = (n: Element) => !n.matches('input,select,textarea') && kindOf(n) === k && (n.getAttribute('role') === role || (toggle && n.hasAttribute('aria-pressed')));
      const qroot = choiceRoot(el, same, root);
      const items = (qroot ? deepQueryAll<HTMLElement>(qroot, '[role],[aria-pressed]').filter(same) : [el]).filter((n) => isVisible(n, doc));
      for (const n of items) seenChoices.add(n);
      const texts = items.map(choiceText);
      if (k === 'checkbox' && items.length === 1) {
        const q = clean(raw) || texts[0] || (qroot ? questionOf(qroot, texts).label : '');
        push(out, reg, items as unknown as Control[], 'checkbox', role || 'button', q, 'aria-label', required);
        continue;
      }
      const split = splitQuestion(texts);
      const q = split.question ? { label: split.question, starred: false } : qroot ? questionOf(qroot, texts) : { label: clean(raw), starred: false };
      const options = items.map((n, i) => ({ value: ctlValue(n), label: split.options[i] || texts[i]!, disabled: false, placeholder: false }));
      push(out, reg, items as unknown as Control[], k === 'radio' ? 'radio' : 'checkbox-group', role || 'button', q.label, 'aria-labelledby', required || q.starred || !!qroot?.closest('[aria-required="true"]'), options);
      continue;
    }
    if (role === 'combobox') {
      push(out, reg, [el as unknown as Control], 'combobox', 'div', clean(raw) || questionOf(el.parentElement ?? el, []).label, 'aria-label', required);
      continue;
    }
    if (editable || role === 'textbox') {
      if (el.parentElement?.closest('[contenteditable="true"], [contenteditable=""]')) continue; // the editor, not its paragraphs
      push(out, reg, [el as unknown as Control], 'richtext', 'contenteditable', clean(raw) || questionOf(el.parentElement ?? el, []).label, 'aria-label', required);
      continue;
    }
    out.unsupported.push({ id: idFor(reg, el), label: clean(raw), required, reason: `custom-control:${role}` });
  }

  markDuplicateLabels(out.fields);
  return out;
}

// A required mark the page draws rather than writes: a class or data attribute on the label saying "required", or a
// star in the label's ::after content (Ashby, Lever). jsdom has no ::after content, so the class check carries the test.
const cssRequired = (el: Control): boolean => {
  const label = (el.labels?.[0] as HTMLElement | undefined) ?? (el.id ? (el.getRootNode() as Document | ShadowRoot).querySelector?.(`label[for="${el.id.replace(/["\\]/g, '\\$&')}"]`) : null) ?? el.closest('label'); // no CSS.escape: jsdom lacks it
  if (!label) return false;
  if (/required/i.test(label.className) || label.hasAttribute('data-required') || label.getAttribute('aria-required') === 'true') return true;
  try {
    const after = el.ownerDocument.defaultView?.getComputedStyle(label, '::after').content ?? '';
    return /[*✱＊]/.test(after);
  } catch {
    return false;
  }
};
const isRequired = (el: Control, star: boolean) =>
  (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' || !!el.closest('[aria-required="true"]') || star || cssRequired(el);

// ---- choices of any make: native boxes, or divs / buttons a script drives (role, aria-checked, aria-pressed)
const isNativeBox = (el: Element) => el.tagName === 'INPUT' && ['radio', 'checkbox'].includes((el as HTMLInputElement).type);
/** Is this choice on? Native: .checked. Scripted: aria-checked / aria-pressed / aria-selected. */
export const ctlChecked = (el: Element) =>
  isNativeBox(el) ? (el as HTMLInputElement).checked : el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true';
/** The text a person reads on one choice ("Yes", "Good"). */
function choiceText(el: Element): string {
  if (isNativeBox(el)) return labelOf(el as Control).label;
  const raw = byIds(el.getRootNode() as Document | ShadowRoot, el.getAttribute('aria-labelledby')).map(rawText).join(' ') || el.getAttribute('aria-label') || rawText(el);
  return clean(raw);
}
/** A choice's value: a native box's value (unless it is a meaningless "on"), else what it says. */
export const ctlValue = (el: Element) => {
  if (isNativeBox(el)) {
    const v = (el as HTMLInputElement).value;
    return v && v !== 'on' ? v : choiceText(el);
  }
  return el.getAttribute('data-value') ?? el.getAttribute('value') ?? choiceText(el);
};
// A choice is on screen when it or the label a person clicks is (sites hide the real box behind a styled label).
const choiceVisible = (el: Element, doc: Document) =>
  isVisible(el, doc) || (isNativeBox(el) && Array.from((el as HTMLInputElement).labels ?? []).some((l) => isVisible(l, doc)));
/**
 * The question a set of choices belongs to: a fieldset / radiogroup / group, else the nearest
 * container that holds the other choices of the same kind. Not the input's name: many sites have none.
 */
function choiceRoot(el: Element, same: (n: Element) => boolean, stop: ParentNode): Element | null {
  const g = el.closest('fieldset, [role="radiogroup"], [role="group"]');
  if (g) return g;
  for (let n = el.parentElement, i = 0; n && i < 6 && n !== stop && n.tagName !== 'FORM' && n.tagName !== 'BODY'; n = n.parentElement, i++) {
    const kin = deepQueryAll(n, 'input, [role="radio"], [role="checkbox"], [role="switch"], [aria-pressed]').filter(same);
    if (kin.length >= 2) return n;
    if (kin.length === 1 && n.querySelectorAll('input:not([type=radio]):not([type=checkbox]), select, textarea').length) return null; // reached another field
  }
  return null;
}
/**
 * Split "Do you have a disability? YES" / "Do you have a disability? NO" into the question and the
 * options: the words every choice's text starts with are the question.
 */
function splitQuestion(texts: string[]): { question: string; options: string[] } {
  if (texts.length < 2) return { question: '', options: texts };
  const words = texts.map((t) => t.split(' '));
  let n = 0;
  while (words.every((w) => w.length > n + 1 && w[n] === words[0]![n])) n++;
  // only a real question counts ("…special needs? YES"): options that merely start alike ("I have…") stay whole
  const prefix = n >= 2 ? words[0]!.slice(0, n).join(' ') : '';
  const question = /[?:：؟]\s*$/.test(prefix) || /[*✱]\s*$/.test(prefix) ? prefix : '';
  return { question, options: question ? words.map((w) => w.slice(n).join(' ')) : texts };
}
// A required mark drawn by CSS (no "*" in the text): a class or aria flag on the question's box or its title.
const requiredMark = (box: Element | null) =>
  !!box && (box.getAttribute('aria-required') === 'true' || !!box.querySelector('[class*="required" i], [aria-required="true"], [required]'));
// The question's own text, from the container: its heading / label / first text, without the options.
function questionOf(root: Element, optionTexts: string[]): { label: string; starred: boolean } {
  const legend = root.querySelector(':scope > legend');
  if (legend) return { label: clean(rawText(legend)), starred: starred(rawText(legend)) };
  const named = byIds(root.getRootNode() as Document | ShadowRoot, root.getAttribute('aria-labelledby')).map(rawText).join(' ') || root.getAttribute('aria-label') || '';
  if (clean(named)) return { label: clean(named), starred: starred(named) };
  let raw = rawText(root);
  for (const o of optionTexts) raw = raw.replace(o, ' ');
  raw = raw.replace(/\s+/g, ' ').trim();
  if (!clean(raw)) {
    // the question sits right before the choices (a label or paragraph above them)
    const prev = root.previousElementSibling ?? root.parentElement?.previousElementSibling;
    raw = prev ? rawText(prev) : '';
  }
  // the required mark sits after the question, often with a hint after it ("…?*  Select all that apply")
  const q = raw.split(/(?<=[?:؟])\s*[*✱]?/)[0] ?? raw;
  return { label: clean(q).slice(0, 300), starred: starred(raw) || /[*✱]/.test(raw) };
}

function groupLabel(first: Control, doc: Document, name: string) {
  const legend = first.closest('fieldset')?.querySelector(':scope > legend');
  if (legend) {
    const raw = rawText(legend);
    if (clean(raw)) return { label: clean(raw), source: 'legend' as const, starred: starred(raw) };
  }
  const raw = byIds(first.getRootNode() as Document | ShadowRoot, first.closest('[role=radiogroup],[role=group]')?.getAttribute('aria-labelledby') ?? null).map(rawText).join(' ');
  if (clean(raw)) return { label: clean(raw), source: 'aria-labelledby' as const, starred: starred(raw) };
  return { label: clean(name.replace(/[_\-[\]]+/g, ' ')), source: name ? ('name' as const) : ('none' as const), starred: false };
}

// The page's validation message for one control, tied to the control, not to the page:
// aria-errormessage, then aria-describedby (when the control is flagged invalid or the text reads as an
// error), then an error node inside the control's own box (the nearest ancestor that holds no other
// control). Page-level alerts stay in the snapshot. ponytail: one error per field, 200 chars.
const ERROR_WORDS = /\b(required|invalid|must|enter|please|not (a )?valid|too (long|short)|error|incorrect|cannot|can't|unable|select)\b/i;
const ERROR_NODES = '[role="alert"], [aria-live], [class*="error" i], [id*="error" i], [class*="invalid" i], [class*="validation" i], [class*="help-block" i]';
function errorOf(el: Control, doc: Document): string | undefined {
  const root = el.getRootNode() as Document | ShadowRoot;
  const textOf = (n: Element | null) => (n && isVisible(n, doc) ? rawText(n).replace(/\s+/g, ' ').trim().slice(0, 200) : '');
  const texts = (attr: string) => (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean).map((id) => textOf(root.getElementById?.(id) ?? doc.getElementById(id))).filter(Boolean);
  const named = texts('aria-errormessage')[0];
  if (named) return named;
  // described-by text is help text ("Please include https://") unless the control is flagged invalid;
  // then the described text that reads as an error is the message (else the first described text)
  if (el.getAttribute('aria-invalid') === 'true') {
    const described = texts('aria-describedby');
    const fromDescribed = described.find((t) => ERROR_WORDS.test(t)) ?? described[0];
    if (fromDescribed) return fromDescribed;
  }
  let box: Element = el;
  for (let i = 0; i < 4 && box.parentElement; i++) {
    const up = box.parentElement;
    if (up.tagName === 'FORM' || up.tagName === 'FIELDSET' || up.tagName === 'BODY') break;
    if (controlsIn(up).filter((c) => c !== el && !(c.tagName === 'INPUT' && ['radio', 'checkbox'].includes((c as HTMLInputElement).type) && (c as HTMLInputElement).name === (el as HTMLInputElement).name)).length) break;
    box = up;
  }
  if (box === el) return undefined;
  const label = norm(labelOf(el).label);
  for (const n of Array.from(box.querySelectorAll(ERROR_NODES))) {
    if (n === el || n.contains(el)) continue;
    const t = textOf(n);
    if (t && norm(t) !== label && ERROR_WORDS.test(t)) return t;
  }
  return undefined;
}

function push(
  out: Inspection,
  reg: Registry,
  els: Control[],
  kind: FieldKind,
  type: string,
  label: string,
  source: FieldInfo['labelSource'],
  star: boolean,
  options?: FieldOption[],
) {
  const id = idFor(reg, els[0]!);
  reg.groups.set(id, els);
  const first = els[0]!;
  const ac = autocompleteOf(first);
  const required = els.some((c) => isRequired(c, star));
  const textOf = (n: Element) => (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' ? (n as HTMLInputElement).value ?? '' : n.textContent ?? '');
  const hasValue =
    kind === 'select' ? (first as HTMLSelectElement).selectedIndex >= 0 && (first as HTMLSelectElement).value !== ''
    : kind === 'combobox' ? reg.picked.has(first) || (first.tagName === 'INPUT' && (first as HTMLInputElement).value.trim() !== '')
    : kind === 'file' ? ((first as HTMLInputElement).files?.length ?? 0) > 0
    : kind === 'checkbox' || kind === 'radio' || kind === 'checkbox-group' ? els.some((c) => ctlChecked(c))
    : textOf(first).trim() !== '';
  const vh = hash(
    kind === 'file' ? Array.from((first as HTMLInputElement).files ?? []).map((f) => f.name).join('|')
    : kind === 'select' ? (first as HTMLSelectElement).value
    : kind === 'checkbox' || kind === 'radio' || kind === 'checkbox-group' ? els.map((c) => (ctlChecked(c) ? '1' : '0')).join('')
    : textOf(first),
  );
  const fp = hash(JSON.stringify([out.formId, kind, type, norm(label), source, required, ac, (options ?? []).map((o) => [o.value, norm(o.label), o.disabled])]));
  const error = errorOf(first, first.ownerDocument);
  // whole-page review: which form the field sits in (the AI tells the application form from the others by it)
  const owner = out.formId === PAGE ? (first as HTMLInputElement).form : null;
  const form = owner ? formLabel(owner.ownerDocument, owner, Array.from(owner.ownerDocument.forms).indexOf(owner)) : undefined;
  out.fields.push({
    id,
    formId: out.formId,
    fp,
    vh,
    kind,
    type,
    label,
    labelSource: source,
    autocomplete: ac,
    required,
    hasValue,
    ...(options && { options }),
    ...(form && { form }),
    ...((first.getAttribute('name') || first.id) && { name: first.getAttribute('name') || first.id }),
    ...(error && { error }),
  });
}

function markDuplicateLabels(fields: FieldInfo[]) {
  const byLabel = new Map<string, FieldInfo[]>();
  for (const f of fields) {
    const k = norm(f.label);
    if (!k || f.labelSource === 'name') continue;
    byLabel.set(k, [...(byLabel.get(k) ?? []), f]);
  }
  for (const group of byLabel.values())
    if (group.length > 1) for (const f of group) f.duplicateLabelWith = group.filter((g) => g !== f).map((g) => g.id);
}
