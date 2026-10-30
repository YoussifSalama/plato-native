import type { AskQuestion, SeekerAnswer } from '../v3/contract';
import type { StopKind } from '../v3/run';
import type { ReconcileAction } from '../core/reconcile';
import type { ReviewState } from '../core/form-review';
import type { BatchRun, Row } from '../core/batch-runner';
import type { ApiItem, PolicyMap, RunSettings, SearchCard, SearchJob } from '../core/types';
import type { Registry } from '../providers/registry';
import { renderChat, type Assistant } from './assistant';
import { icon, type IconName } from './icons';
import { renderDock, renderJobs, renderSheet } from './jobs-view';
import { renderBatch } from './batch-view';

// Pure rendering: state in, DOM out. Text only (textContent): job titles come
// from third-party listings and must never be parsed as HTML.
// The panel: header, Jobs | Batch nav, one scrolling body, the batch dock pinned at the bottom.
export type SessionStep = 'preparing' | 'review' | 'armed' | 'needs-user';
export type PickKey = `item:${string}` | `job:${string}`; // a queued server item, or a job from a search
export interface JobsState {
  searches: SearchCard[];
  searchId?: string;
  pickerOpen: boolean;
  jobs: SearchJob[]; // the pages loaded so far of the current search, filtered and sorted by the server
  jobsTotal: number;
  known: Record<string, SearchJob>; // every job seen, so a pick survives a change of search or page
  loading: boolean;
  q: string;
  sort: 'best' | 'newest';
  remote: boolean;
  fromPlato: boolean;
  picked: PickKey[];
  resumeMode: 'profile' | 'tailored';
}
export interface Toast {
  id: number;
  text: string;
  kind?: 'ok' | 'err';
}
export interface PanelState {
  status: 'loading' | 'unpaired' | 'ready';
  error?: string;
  notice?: string;
  toasts: Toast[];
  items: ApiItem[];
  policy?: PolicyMap; // server policy; undefined = unknown = everything blocked
  sessions: Record<string, { step: SessionStep; message?: string; detail?: string; stop?: StopKind; ask?: AskQuestion[] }>; // stop/ask: why a v3 run stopped and the questions to draw
  progress: Record<string, string>; // item id -> the last journal line (what Plato is doing on that page)
  cards: Record<string, ReconcileAction>;
  formReviews?: Record<string, ReviewState>; // engine v2 bookkeeping; not drawn
  pendingOutbox: number;
  busy?: boolean;
  assistant?: Assistant; // the orchestrator chat, opened on demand
  chatOpen?: boolean;
  autoSubmit?: boolean; // this run: Plato presses Submit
  settings?: RunSettings | null;
  view: 'jobs' | 'batch';
  jobs: JobsState;
  sheet?: boolean; // the batch review sheet
  menuOpen?: boolean;
  stopArmed?: boolean; // "Stop batch" asked; waiting for Yes / Keep going
  run: BatchRun | null; // the batch this panel is applying to (or the last finished one)
  rows: Row[]; // the batch's rows, from the server list and this panel's sessions
  eta?: { ms: number; basis: number } | 'first' | null; // the runner's estimate for the rows
  autoSubmitPreview?: boolean; // what the sheet promises: Plato presses Submit (production), or the person does (test builds)
  log?: { at: string; level: 'info' | 'warn' | 'error'; text: string }[];
  showLog?: boolean;
}
export interface JobsActions {
  pickSearch(id: string): void;
  picker(open: boolean): void;
  filter(patch: Partial<Pick<JobsState, 'q' | 'sort' | 'remote' | 'fromPlato'>>): void;
  more(): void; // next page of the current search
  toggle(key: PickKey): void; // refused past the cap (the runner says so)
  selectVisible(): void; // tick what is on screen, up to the cap
  dropItem(id: string): void; // remove a queued job (server CANCELLED)
  sheet(open: boolean): void;
  resumeMode(mode: 'profile' | 'tailored'): void;
  start(): void; // the one way a batch begins
}
export interface BatchActions {
  stop(what: 'ask' | 'no' | 'yes'): void;
  cancelJob(item: ApiItem): void; // one running or queued job
  release(item: ApiItem): void; // an interrupted job this panel no longer holds
  resume(): void; // reattach interrupted jobs whose tab is still open
  answerJob(item: ApiItem, text: string, answers?: SeekerAnswer[]): void; // the answers to Plato's questions (the form's lines, and the structured answers behind them); the job continues
  retry(item: ApiItem): void; // "I did it, continue": run again from where it stopped
  submitNow(item: ApiItem): void; // the seeker's explicit go-ahead: Plato presses Submit on this job
  checkPage(item: ApiItem): void;
  attest(item: ApiItem): void;
  notSure(item: ApiItem): void;
  notSubmitted(item: ApiItem): void;
  resumeChoice(item: ApiItem, choice: 'profile' | 'tailored'): void;
  watch(item: ApiItem): void; // bring the job's tab to the front
  ticket(item: ApiItem): void; // open the chat on this job's problem
  newBatch(): void; // after a finished batch: back to Jobs with an empty selection
  retryFailed(): void; // a new selection from the failed jobs of the finished batch
}
export interface Actions {
  pair(code: string, label: string): void;
  unlink(): void;
  refresh(): void;
  view(v: 'jobs' | 'batch'): void;
  menu(open: boolean): void;
  toggleLog(): void;
  chat(open: boolean): void;
  answer(text: string): void; // the seeker's message to the orchestrator chat
  jobs: JobsActions;
  batch: BatchActions;
}

type Child = Node | string | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: { class?: string; text?: string; disabled?: boolean; onclick?: () => void; type?: string; placeholder?: string; id?: string; maxlength?: number; autocomplete?: string; href?: string; attrs?: Record<string, string> } = {},
  ...children: Child[]
) {
  const el = doc.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.id) el.id = props.id;
  if (props.type) el.setAttribute('type', props.type);
  if (props.placeholder) el.setAttribute('placeholder', props.placeholder);
  if (props.maxlength) el.setAttribute('maxlength', String(props.maxlength));
  if (props.autocomplete) el.setAttribute('autocomplete', props.autocomplete);
  if (props.href) el.setAttribute('href', props.href);
  if (props.disabled) el.setAttribute('disabled', '');
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.onclick) el.addEventListener('click', props.onclick);
  for (const c of children) if (c) el.append(c);
  return el;
}
export const btn = (doc: Document, text: string, onclick: () => void, cls = 'btn', o: { disabled?: boolean; icon?: IconName; id?: string } = {}) =>
  h(doc, 'button', { class: cls, onclick, disabled: o.disabled, id: o.id, type: 'button' }, o.icon ? icon(doc, o.icon) : null, text);
// The company tile: a letter on a hue from the name (real logos when image assets ship).
export function avatar(doc: Document, company: string, cls = 'av') {
  const el = h(doc, 'span', { class: cls, text: (company.trim().charAt(0) || '?').toUpperCase() });
  const hue = [...company].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  el.style.setProperty('background', `hsl(${hue} 52% 46%)`);
  return el;
}
export const banner = (doc: Document, kind: 'info' | 'warn' | 'err', ico: IconName, title: string | null, text: string, ...acts: Child[]) =>
  h(doc, 'div', { class: `banner ${kind}` }, icon(doc, ico), h(doc, 'div', {}, title ? h(doc, 'strong', { text: title }) : null, text, acts.some(Boolean) ? h(doc, 'div', { class: 'acts' }, ...acts) : null));

export function render(doc: Document, root: HTMLElement, s: PanelState, a: Actions, registry: Registry) {
  // keep the cursor in whatever box the person is typing in across redraws
  const active = doc.activeElement as HTMLInputElement | null;
  const keep = active && root.contains(active) && active.id ? { id: active.id, pos: active.selectionStart } : null;
  const scroll = root.querySelector('.body')?.scrollTop ?? 0;
  root.replaceChildren();
  try {
    renderInner(doc, root, s, a, registry);
  } finally {
    const body = root.querySelector('.body');
    if (body) body.scrollTop = scroll;
    const msgs = root.querySelector('#msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    if (keep) {
      const el = doc.getElementById(keep.id) as HTMLInputElement | null;
      if (el) {
        el.focus();
        if (keep.pos !== null && el.setSelectionRange) try { el.setSelectionRange(keep.pos, keep.pos); } catch { /* not a text box */ }
      }
    }
  }
}

function header(doc: Document, s: PanelState, a: Actions) {
  const linked = s.status !== 'unpaired';
  const live = !!s.run && s.run.status === 'running';
  const conn = h(doc, 'div', { class: `conn${linked && s.policy ? ' ok' : ''}` }, h(doc, 'i'), h(doc, 'span', { text: !linked ? 'Not linked' : s.policy ? 'Connected' : 'Offline · showing the last known state' }));
  const more = h(doc, 'button', { class: 'ibtn', id: 'menu-btn', type: 'button', onclick: () => a.menu(!s.menuOpen), attrs: { 'aria-label': 'Menu', 'aria-expanded': String(!!s.menuOpen) } }, icon(doc, 'more'));
  return h(doc, 'header', { class: 'hdr' }, h(doc, 'span', { class: `mark${live ? ' live' : ''}`, text: 'P' }), h(doc, 'div', { class: 'ttl' }, h(doc, 'h1', { text: 'Plato Apply' }), conn), linked ? more : null);
}
function menu(doc: Document, s: PanelState, a: Actions) {
  const item = (text: string, fn: () => void) => h(doc, 'button', { type: 'button', text, onclick: () => (a.menu(false), fn()), attrs: { role: 'menuitem' } });
  return h(doc, 'div', { class: 'menu', id: 'menu', attrs: { role: 'menu' } },
    item('Ask Plato', () => a.chat(true)),
    item(s.showLog ? 'Hide activity log' : 'Activity log', a.toggleLog),
    item('Refresh', a.refresh),
    item('Unlink this browser', a.unlink),
    h(doc, 'p', { class: 'build', text: `build ${__BUILD__}` }));
}
function nav(doc: Document, s: PanelState, a: Actions) {
  const tab = (v: 'jobs' | 'batch', text: string, badge?: Node | null) => h(doc, 'button', { type: 'button', class: '', onclick: () => a.view(v), attrs: { role: 'tab', 'aria-selected': String(s.view === v), id: `tab-${v}` } }, text, badge);
  let badge: Node | null = null;
  if (s.run) {
    const needs = s.rows.filter((r) => r.status === 'needs' || r.status === 'verify' || r.status === 'interrupted').length;
    const done = s.rows.filter((r) => !!r.outcome).length;
    if (needs) badge = h(doc, 'span', { class: 'b warn', text: String(needs) });
    else if (s.run.status === 'finished') badge = h(doc, 'span', { class: 'b ok' }, icon(doc, 'check'));
    else badge = h(doc, 'span', { class: 'b num', text: `${done}/${s.run.itemIds.length}` });
  }
  return h(doc, 'nav', { class: 'seg', attrs: { role: 'tablist' } }, tab('jobs', 'Jobs'), tab('batch', 'Batch', badge));
}

function renderInner(doc: Document, root: HTMLElement, s: PanelState, a: Actions, registry: Registry) {
  root.append(header(doc, s, a));
  if (s.status === 'loading') return void root.append(h(doc, 'div', { class: 'body' }, h(doc, 'div', { class: 'stack' }, h(doc, 'div', { class: 'skel' }), h(doc, 'div', { class: 'skel' }), h(doc, 'div', { class: 'skel' }))));

  if (s.status === 'unpaired') {
    const code = h(doc, 'input', { class: 'field', id: 'code', type: 'text', placeholder: 'ABCD-EFGH', maxlength: 20, autocomplete: 'off', attrs: { 'aria-label': 'Pairing code' } });
    const label = h(doc, 'input', { class: 'field', id: 'label', type: 'text', placeholder: 'Name this browser (optional)', maxlength: 60, autocomplete: 'off', attrs: { 'aria-label': 'Browser name' } });
    const step = (n: number, text: string) => h(doc, 'li', {}, h(doc, 'span', { class: 'n', text: String(n) }), h(doc, 'span', { text }));
    root.append(h(doc, 'div', { class: 'body' },
      s.error ? banner(doc, 'err', 'alert', null, s.error) : null,
      h(doc, 'section', { class: 'card pad link' },
        h(doc, 'span', { class: 'tile' }, icon(doc, 'link')),
        h(doc, 'h2', { text: 'Link this browser to Plato' }),
        h(doc, 'p', { text: 'Only you can link a browser to your account. It takes a few seconds.' }),
        h(doc, 'ol', { class: 'steps' }, step(1, 'In Plato, open Extension in the sidebar.'), step(2, 'Press “Generate code” and copy it.'), step(3, 'Paste it here and press Link.')),
        code, label,
        btn(doc, 'Link this browser', () => a.pair(code.value, label.value || 'This browser'), 'btn primary block', { disabled: s.busy, id: 'link' }))));
    return;
  }

  root.append(nav(doc, s, a));
  if (s.menuOpen) root.append(menu(doc, s, a));
  const body = h(doc, 'div', { class: 'body' });
  if (s.menuOpen) body.addEventListener('click', () => a.menu(false)); // a click anywhere else closes the menu
  const stack = h(doc, 'div', { class: 'stack' });
  body.append(stack);
  if (s.error) stack.append(banner(doc, 'err', 'alert', null, s.error));
  if (s.notice) stack.append(banner(doc, 'info', 'sparkle', null, s.notice));
  if (!s.policy) stack.append(banner(doc, 'err', 'wifi', 'Cannot reach Plato', 'Showing the last known state. Nothing is opened or filled until Plato answers again.'));
  else if (!registry.all.some((p) => registry.policyOf(p.id, s.policy) === 'FILL_ONLY')) stack.append(banner(doc, 'warn', 'alert', 'No sites are enabled yet', 'Your queue is kept safely; nothing will be opened or filled.'));
  if (s.pendingOutbox) stack.append(banner(doc, 'info', 'clock', null, `${s.pendingOutbox} update(s) waiting to reach Plato. They are sent in order when you are back online.`));
  if (s.showLog) {
    const box = h(doc, 'section', { class: 'card log', id: 'activity-log' }, h(doc, 'h2', { text: 'Activity log' }));
    for (const e of [...(s.log ?? [])].reverse()) box.append(h(doc, 'p', { class: `log-line ${e.level}` }, h(doc, 'span', { class: 'meta', text: e.at }), e.text));
    if (!s.log?.length) box.append(h(doc, 'p', { class: 'meta', text: 'Nothing yet.' }));
    stack.append(box);
  }
  if (s.view === 'batch') stack.append(...renderBatch(doc, s, a, registry));
  else stack.append(...renderJobs(doc, s, a, registry));
  root.append(body);
  if (s.view === 'jobs') root.append(renderDock(doc, s, a));

  if (s.toasts.length) root.append(h(doc, 'div', { class: 'toasts' }, ...s.toasts.map((t) => h(doc, 'div', { class: `toast${t.kind ? ` ${t.kind}` : ''}`, text: t.text, attrs: { role: 'status' } }))));
  if (s.sheet) root.append(...renderSheet(doc, s, a));
  if (s.chatOpen && s.assistant) {
    const running = !!s.run && s.run.status === 'running';
    const close = h(doc, 'button', { class: 'ibtn', type: 'button', onclick: () => a.chat(false), attrs: { 'aria-label': 'Close' } }, icon(doc, 'close'));
    root.append(
      h(doc, 'div', { class: 'scrim', onclick: () => a.chat(false) }),
      h(doc, 'div', { class: 'drawer', id: 'chat', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ask Plato' } },
        h(doc, 'div', { class: 'dh' }, h(doc, 'h2', { text: 'Ask Plato' }), close),
        renderChat(doc, s.assistant, a.answer, running ? 'running' : s.jobs.picked.length ? 'ready' : 'idle')),
    );
  }
}
