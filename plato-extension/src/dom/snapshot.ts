import { deepQueryAll, deepText, DIALOG_SELECTOR } from './deep';
import { isVisible } from './inspect';

// A compact, read-only picture of the page for the AI planner: where the open dialog is, which
// controls a person could press (each with a short label and a temporary ref), how many fields are
// empty, alerts and the visible text. The planner picks a ref; the content script re-checks it before
// pressing. Nothing here changes the page, and field VALUES are never included.
export interface SnapEl {
  ref: string;
  role: 'button' | 'link';
  label: string;
}
export interface Snapshot {
  url: string;
  title: string;
  dialogOpen: boolean;
  dialogTitle: string;
  elements: SnapEl[];
  fields: { total: number; empty: number };
  alerts: string[];
  text: string;
  loading: boolean; // the document has not finished loading: never decide on it yet
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const labelOf = (el: Element) => norm(el.getAttribute('aria-label') || el.textContent || '').slice(0, 80);
// Never pressed, whatever the planner says: leaving, discarding, following, paying, messaging, sharing.
const DENY = /\b(sign ?(out|in)|log ?(out|in)|dismiss|discard|cancel|close|delete|remove|withdraw|report|block|unfollow|follow|message|connect|share|save|buy|premium|pay|upgrade|subscribe|post a job|help|feedback|settings|notifications?)\b/i;

let refs = new Map<string, HTMLElement>();

export function takeSnapshot(doc: Document): Snapshot {
  refs = new Map();
  const dialogs = deepQueryAll<HTMLElement>(doc, DIALOG_SELECTOR).filter((d) => isVisible(d, doc));
  const dlg = dialogs.find((d) => deepQueryAll(d, 'input,select,textarea,button').length) ?? undefined;
  const region: ParentNode = dlg ?? doc.querySelector('main') ?? doc.body;
  const els: SnapEl[] = [];
  for (const el of deepQueryAll<HTMLElement>(region, 'button, a, [role="button"]')) {
    if (els.length >= 50) break;
    const label = labelOf(el);
    if (!label || !isVisible(el, doc) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const ref = `e${els.length + 1}`;
    refs.set(ref, el);
    els.push({ ref, role: el.tagName === 'A' ? 'link' : 'button', label });
  }
  const fields = deepQueryAll<HTMLInputElement>(region, 'input, select, textarea').filter((f) => !['hidden', 'submit', 'button', 'image', 'file'].includes(f.type) && isVisible(f, doc));
  return {
    url: (doc.location?.href ?? '').slice(0, 300),
    title: norm(doc.title).slice(0, 200),
    dialogOpen: !!dlg,
    dialogTitle: dlg ? deepText(deepQueryAll(dlg, 'h1, h2, h3')[0] ?? dlg, 120) : '',
    elements: els,
    fields: { total: fields.length, empty: fields.filter((f) => !f.value && f.type !== 'checkbox' && f.type !== 'radio').length },
    alerts: deepQueryAll(region, '[role="alert"], [class*="error" i]').map((e) => deepText(e, 200)).filter(Boolean).slice(0, 6),
    text: deepText(region, 1500),
    loading: doc.readyState !== 'complete',
  };
}

/** The element behind a ref from the latest snapshot (for trusted presses from the panel). */
export const refElement = (ref: string): HTMLElement | undefined => refs.get(ref);

export type PressResult = { clicked: true } | { clicked: false; reason: 'unknown-ref' | 'gone' | 'not-allowed' };

// The only other place that presses a page control: by a ref from the latest snapshot, never a denied label.
const press = (el: HTMLElement) => el.click();
export function pressRef(doc: Document, ref: string): PressResult {
  const el = refs.get(ref);
  if (!el) return { clicked: false, reason: 'unknown-ref' };
  if (!el.isConnected || !isVisible(el, doc) || (el as HTMLButtonElement).disabled) return { clicked: false, reason: 'gone' };
  if (DENY.test(labelOf(el))) return { clicked: false, reason: 'not-allowed' };
  press(el);
  return { clicked: true };
}
