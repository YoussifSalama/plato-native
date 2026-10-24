import { h } from './view';

// The panel's dropdown, styled like the Plato web app's select (a native <select> list is drawn by the
// OS and cannot be themed). Trigger + popover listbox; mouse and keyboard (arrows, Enter, Escape).
// It survives the panel's redraws: the open one stays open with the same highlighted option.
let openId: string | null = null;
let activeIndex = -1;

export function dropdown(doc: Document, id: string, opts: [string, string][], value: string, onChange: (v: string) => void, o: { mini?: boolean; disabled?: boolean; label?: string } = {}) {
  const wrap = h(doc, 'div', { class: `dd${o.mini ? ' mini' : ''}`, id });
  wrap.dataset.value = value;
  const current = opts.find(([v]) => v === value) ?? opts[0];
  const trigger = h(doc, 'button', { class: 'dd-trigger', type: 'button', disabled: o.disabled }, h(doc, 'span', { class: 'dd-value', text: current?.[1] ?? '' }), chevron(doc));
  trigger.setAttribute('aria-haspopup', 'listbox');
  if (o.label) trigger.setAttribute('aria-label', o.label);
  const list = h(doc, 'div', { class: 'dd-list', id: `${id}-list` });
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  wrap.append(trigger, list);

  const items = opts.map(([v, text], i) => {
    const it = h(doc, 'div', { class: `dd-opt${v === value ? ' is-sel' : ''}`, text });
    it.setAttribute('role', 'option');
    it.setAttribute('aria-selected', String(v === value));
    it.dataset.value = v;
    it.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the list
    it.addEventListener('click', () => choose(i));
    it.addEventListener('mousemove', () => highlight(i));
    return it;
  });
  list.append(...items);

  const highlight = (i: number) => {
    activeIndex = i;
    items.forEach((it, j) => it.classList.toggle('hi', j === i));
    items[i]?.scrollIntoView?.({ block: 'nearest' });
  };
  const setOpen = (on: boolean) => {
    wrap.classList.toggle('open', on);
    trigger.setAttribute('aria-expanded', String(on));
    openId = on ? id : openId === id ? null : openId;
    if (on) {
      highlight(activeIndex >= 0 && activeIndex < items.length ? activeIndex : Math.max(0, opts.findIndex(([v]) => v === value)));
      list.focus({ preventScroll: true });
      doc.addEventListener('mousedown', outside, true);
    } else doc.removeEventListener('mousedown', outside, true);
  };
  const outside = (e: Event) => !wrap.contains(e.target as Node) && setOpen(false);
  const choose = (i: number) => {
    const v = opts[i]?.[0];
    activeIndex = -1;
    setOpen(false);
    trigger.focus({ preventScroll: true });
    if (v !== undefined && v !== value) onChange(v);
  };
  trigger.addEventListener('click', () => setOpen(!wrap.classList.contains('open')));
  const keys = (e: KeyboardEvent) => {
    const isOpen = wrap.classList.contains('open');
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) return void (e.preventDefault(), setOpen(true));
    if (!isOpen) return;
    if (e.key === 'ArrowDown') highlight(Math.min(items.length - 1, activeIndex + 1));
    else if (e.key === 'ArrowUp') highlight(Math.max(0, activeIndex - 1));
    else if (e.key === 'Enter' || e.key === ' ') choose(activeIndex);
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
    else return;
    e.preventDefault();
  };
  trigger.addEventListener('keydown', keys);
  list.addEventListener('keydown', keys);
  if (openId === id) queueMicrotask(() => wrap.isConnected && setOpen(true)); // reopened after a redraw
  return wrap;
}

function chevron(doc: Document) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'dd-chev');
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'm6 9 6 6 6-6');
  svg.append(p);
  return svg;
}
