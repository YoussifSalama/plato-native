import type { ReconcileAction } from '../core/reconcile';
import type { ReviewState, Row } from '../core/form-review';
import type { ApiItem, PolicyMap } from '../core/types';
import type { Registry } from '../providers/registry';
import { renderChat, type Assistant } from './assistant';
import { icon } from './icons';
import { renderReady, type ReadyActions, type RunSettings } from './ready';
import { renderWizard, type Wizard, type WizardAction } from './wizard';

// Pure rendering: state in, DOM out. Text only (textContent): job titles come
// from third-party listings and must never be parsed as HTML.
export type SessionStep = 'preparing' | 'review' | 'armed' | 'needs-user';
export interface PanelState {
  status: 'loading' | 'unpaired' | 'ready';
  error?: string;
  notice?: string;
  runNote?: string; // "Applying to N jobs…": drawn only while the run has jobs
  items: ApiItem[];
  policy?: PolicyMap; // server policy; undefined = unknown = everything blocked
  sessions: Record<string, { step: SessionStep; message?: string; detail?: string }>;
  cards: Record<string, ReconcileAction>;
  formReviews?: Record<string, ReviewState>; // the form review, per item with a live session
  pendingOutbox: number;
  busy?: boolean;
  assistant?: Assistant; // the orchestrator, while a job is blocked or it has something to say
  autoSubmit?: boolean; // this run: the seeker let Plato press Submit
  runIds?: string[]; // item ids of the current run: the runner starts only these, never older queued jobs
  settings?: RunSettings | null; // run settings from the server (Ready card)
  matchRange?: string | null; // e.g. "72%–100%" for the waiting jobs
  menuOpen?: boolean; // header ⋮ menu
  clearArmed?: boolean;
  log?: { at: string; level: 'info' | 'warn' | 'error'; text: string }[]; // what the panel did and why
  showLog?: boolean; // the first click on Clear queue: the button now asks to confirm
  running?: boolean; // the runner is opening queued jobs, up to 10 tabs at a time
  wizard?: Wizard; // first-run / new-batch flow; takes over the panel while set
}
export interface Actions {
  wizard?(a: WizardAction): void;
  resumeJob?(item: ApiItem): void; // reattach to a job left open by a reload
  readyCard?: ReadyActions; // the Ready-to-apply card
  menu?(open: boolean): void;
  toggleLog?(): void;
  dropItems?(ids: string[]): void; // remove waiting jobs (one batch)
  retry?(item: ApiItem): void; // run the steps again from where the job stopped
  resumeChoice?(item: ApiItem, choice: 'profile' | 'tailored'): void; // which resume this application uploads
  submitNow?(item: ApiItem): void; // the seeker's explicit go-ahead: Plato presses Submit on this job
  ticket?(item: ApiItem): void; // open the chat on this job's problem
  clearQueue?(go?: boolean): void; // true = ask first, true again via Yes = clear; false = cancel the question
  answer?(text: string): void; // the seeker's reply to the orchestrator
  pair(code: string, label: string): void;
  unlink(): void;
  refresh(): void;
  start(item: ApiItem): void;
  ready(item: ApiItem): void; // the person says the form is ready; THEY submit
  checkPage(item: ApiItem): void;
  attest(item: ApiItem): void;
  notSure(item: ApiItem): void;
  notSubmitted(item: ApiItem): void;
  cancel(item: ApiItem): void;
  release(item: ApiItem): void;
  // Form review (nothing is filled until the person approves, for the version they saw)
  formChoose(item: ApiItem, formId: string): void;
  formRestart(item: ApiItem): void;
  reviewToggle(item: ApiItem, rowId: string, choice: 'use' | 'skip'): void;
  reviewFill(item: ApiItem, version: number): void;
  reviewRetry(item: ApiItem, version: number): void;
  reviewReinspect(item: ApiItem): void;
}

type Child = Node | string | null | false | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: { class?: string; text?: string; disabled?: boolean; onclick?: () => void; type?: string; placeholder?: string; id?: string; maxlength?: number; autocomplete?: string; href?: string } = {},
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
  if (props.onclick) el.addEventListener('click', props.onclick);
  for (const c of children) if (c) el.append(c);
  return el;
}

const STATE_LABEL: Record<string, string> = {
  PENDING: 'Waiting',
  CLAIMED: 'Started',
  PREPARING: 'Preparing',
  NEEDS_USER: 'Needs you',
  FILLING: 'Filling',
  REVIEW: 'Review',
  AWAITING_SUBMIT: 'Waiting for you to submit',
  VERIFY: 'Please check',
};
const NEEDS_TEXT: Record<string, string> = {
  login: 'Log in on the site yourself, then continue.',
  mfa: 'Complete the site’s verification yourself, then continue.',
  captcha: 'Complete the human check yourself, then continue.',
  questions: 'The form asks something Plato cannot answer. Answer it on the page.',
};
const BLOCK_TEXT: Record<string, string> = {
  blocked: 'Not available: this site is not enabled for Plato yet.',
  none: 'Not available yet: nothing is built for this site.',
};

export function render(doc: Document, root: HTMLElement, s: PanelState, a: Actions, registry: Registry) {
  const typing = doc.activeElement?.id === 'answer' ? (doc.activeElement as HTMLInputElement).selectionStart : null; // keep the cursor in the chat box across redraws
  root.replaceChildren();
  root.className = s.status === 'ready' && !s.wizard ? 'queue' : '';
  try {
    renderInner(doc, root, s, a, registry);
  } finally {
    const msgs = root.querySelector('#msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const box = root.querySelector<HTMLInputElement>('#answer');
    if (typing !== null && box) {
      box.focus();
      box.setSelectionRange(typing, typing);
    }
  }
}

// One header everywhere: mark, name, connection line; on the right whatever the screen needs.
function topHeader(doc: Document, s: PanelState, right: (Node | null)[]) {
  const linked = s.status !== 'unpaired';
  return h(doc, 'header', { class: 'top' },
    h(doc, 'div', { class: 'brand' }, h(doc, 'span', { class: 'mark', text: 'P' }),
      h(doc, 'div', { class: 'brand-text' }, h(doc, 'h1', { text: 'Plato Apply' }),
        h(doc, 'p', { class: 'status-line' }, h(doc, 'span', { class: `dot${linked && s.policy ? ' ok' : ''}` }), h(doc, 'span', { text: !linked ? 'Not linked yet' : s.policy ? 'Connected' : 'Offline' }), h(doc, 'span', { class: 'build', text: `build ${__BUILD__}` })))),
    ...right);
}
const closeBtn = (doc: Document) => {
  const b = h(doc, 'button', { class: 'icon-btn', id: 'close-btn', onclick: () => window.close() }, icon(doc, 'close'));
  b.setAttribute('aria-label', 'Close');
  return b;
};

// Waiting jobs of the newest pick only: older batches are shown apart, never silently mixed in.
const batchKey = (i: ApiItem) => i.batch_id;
export function latestBatch(items: ApiItem[], ok: (i: ApiItem) => boolean = () => true) {
  const pending = items.filter((i) => i.state === 'PENDING' && ok(i));
  const newest = pending.reduce<ApiItem | null>((b, i) => (!b || (i.batch?.created_at ?? '') > (b.batch?.created_at ?? '') ? i : b), null);
  return newest ? pending.filter((i) => batchKey(i) === batchKey(newest)) : [];
}
const batchTitle = (i: ApiItem) => {
  const when = i.batch?.created_at ? new Date(i.batch.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `${i.batch?.label ? `“${i.batch.label}” search` : 'Picked on Plato'}${when ? ` · ${when}` : ''}`;
};

function renderInner(doc: Document, root: HTMLElement, s: PanelState, a: Actions, registry: Registry) {
  if (s.error) root.append(h(doc, 'p', { class: 'error', text: s.error }));
  if (s.notice) root.append(h(doc, 'p', { class: 'notice', text: s.notice }));
  else if (s.runNote && s.running && s.items.length) root.append(h(doc, 'p', { class: 'notice', text: s.runNote }));

  if (s.status === 'loading') return void root.append(h(doc, 'p', { text: 'Loading…' }));

  if (s.status === 'unpaired') {
    const code = h(doc, 'input', { id: 'code', type: 'text', placeholder: 'ABCD-EFGH', maxlength: 20, autocomplete: 'off' });
    const label = h(doc, 'input', { id: 'label', type: 'text', placeholder: 'This browser', maxlength: 60, autocomplete: 'off' });
    const step = (n: number, text: string) => h(doc, 'li', {}, h(doc, 'span', { class: 'num', text: String(n) }), h(doc, 'span', { text }));
    root.prepend(topHeader(doc, s, [closeBtn(doc)]));
    root.append(
      h(doc, 'section', { class: 'hero ready' },
        h(doc, 'div', { class: 'ready-head' }, h(doc, 'span', { class: 'ready-ico' }, icon(doc, 'link')),
          h(doc, 'div', {}, h(doc, 'h1', { text: 'Link this browser to Plato' }), h(doc, 'p', { class: 'meta', text: 'Only you can link a browser to your account. It takes a few seconds.' }))),
        h(doc, 'ol', { class: 'steps' },
          step(1, 'In Plato, open Extension in the sidebar.'),
          step(2, 'Press “Generate code” and copy it.'),
          step(3, 'Paste it here and press Link.')),
        code,
        label,
        h(doc, 'button', { id: 'link', class: 'primary block cta', text: 'Link this browser', disabled: s.busy, onclick: () => a.pair(code.value, label.value || 'This browser') })),
    );
    return;
  }

  if (s.wizard && a.wizard) {
    root.prepend(topHeader(doc, s, [s.wizard.step === 'welcome' ? null : h(doc, 'button', { class: 'link', text: 'Skip', onclick: () => a.wizard!({ type: 'skip' }) }), closeBtn(doc)]));
    return renderWizard(doc, root, s.wizard, a.wizard, !!s.busy);
  }

  const anyEnabled = registry.all.some((p) => registry.policyOf(p.id, s.policy) === 'FILL_ONLY');
  const early = Array.from(root.children); // error / notice lines drawn before the header: they belong in the scroll area
  root.append(
    topHeader(doc, s, [
      a.menu ? (() => {
        const b = h(doc, 'button', { class: 'icon-btn', id: 'menu-btn', onclick: () => a.menu!(!s.menuOpen) }, icon(doc, 'more'));
        b.setAttribute('aria-label', 'Menu');
        b.setAttribute('aria-expanded', String(!!s.menuOpen));
        return b;
      })() : null,
      closeBtn(doc),
    ]),
  );
  if (s.menuOpen && a.menu) {
    const item = (text: string, fn: () => void) => h(doc, 'button', { class: 'menu-item', text, onclick: () => (a.menu!(false), fn()) });
    root.append(h(doc, 'div', { class: 'menu', id: 'menu' },
      a.wizard ? item('New batch', () => a.wizard!({ type: 'continue' })) : null,
      item('Refresh', a.refresh),
      a.toggleLog ? item(s.showLog ? 'Hide activity log' : 'Activity log', a.toggleLog) : null,
      a.clearQueue ? item('Clear queue', () => a.clearQueue!(true)) : null,
      item('Unlink this browser', a.unlink)));
  }
  const stack = h(doc, 'div', { class: 'stack', id: 'stack' });
  stack.append(...early);
  root.append(stack);
  if (!s.policy) stack.append(h(doc, 'p', { class: 'notice', text: 'Cannot reach Plato to check which sites are enabled. Everything stays off until it can.' }));
  else if (!anyEnabled) stack.append(h(doc, 'p', { class: 'notice', text: 'No sites are enabled yet. Your queue is kept safely; nothing will be opened or filled.' }));
  if (s.pendingOutbox) stack.append(h(doc, 'p', { class: 'notice', text: `${s.pendingOutbox} update(s) waiting to reach Plato. They are sent in order when you are back online.` }));

  const canStart = (i: ApiItem) => !s.sessions[i.id] && !!i.provider && registry.policyOf(i.provider, s.policy) === 'FILL_ONLY' && !!registry.get(i.provider)?.adapter;
  const startable = s.items.filter((i) => i.state === 'PENDING' && canStart(i)).length;
  const newest = latestBatch(s.items, canStart);
  if (newest.length && !s.running && a.readyCard) {
    stack.append(renderReady(doc, newest.length, s.matchRange ?? null, s.settings ?? null, a.readyCard, !!s.busy, batchTitle(newest[0]!)));
    const older = s.items.filter((i) => i.state === 'PENDING' && !newest.includes(i));
    if (older.length && a.dropItems)
      stack.append(h(doc, 'p', { class: 'older-note' }, `${older.length} older waiting job${older.length === 1 ? '' : 's'} from earlier picks are not included. `,
        h(doc, 'button', { class: 'hint-link', id: 'drop-older', text: 'Remove them', disabled: s.busy, onclick: () => a.dropItems!(older.map((i) => i.id)) })));
  }
  else if (startable && !s.running && a.wizard)
    stack.append(h(doc, 'section', { class: 'assistant', id: 'ready-banner' },
      h(doc, 'p', { class: 'ask', text: `${startable} job${startable === 1 ? '' : 's'} ready to apply.` }),
      h(doc, 'button', { class: 'primary', text: 'Start applying', disabled: s.busy, onclick: () => a.wizard!({ type: 'resume' }) })));
  if (!s.items.length)
    stack.append(h(doc, 'section', { class: 'ready empty-card' },
      h(doc, 'div', { class: 'ready-head' }, h(doc, 'span', { class: 'ready-ico' }, icon(doc, 'inbox')),
        h(doc, 'div', {}, h(doc, 'h2', { text: 'Nothing queued.' }), h(doc, 'p', { class: 'meta', text: 'Pick jobs on Plato with “Apply with Plato”, or choose them here from one of your searches.' }))),
      a.wizard ? h(doc, 'button', { class: 'primary block cta', id: 'choose-jobs', text: 'Choose jobs to apply to', disabled: s.busy, onclick: () => a.wizard!({ type: 'continue' }) }) : null));

  if (s.clearArmed && a.clearQueue) {
    const n = s.items.filter((i) => i.state === 'PENDING').length;
    stack.prepend(h(doc, 'div', { class: 'confirm', id: 'clear-confirm' },
      h(doc, 'span', { text: `Clear ${n} waiting job${n === 1 ? '' : 's'}?` }),
      h(doc, 'button', { class: 'danger', id: 'clear-yes', text: 'Yes, clear', disabled: s.busy, onclick: a.clearQueue }),
      h(doc, 'button', { id: 'clear-no', text: 'No', disabled: s.busy, onclick: () => a.clearQueue!(false) })));
  }
  // What happened, in order: the panel's own log (opened from the ⋮ menu)
  if (s.showLog) {
    const box = h(doc, 'section', { class: 'ready log', id: 'activity-log' }, h(doc, 'h2', { text: 'Activity log' }));
    for (const e of [...(s.log ?? [])].reverse()) box.append(h(doc, 'p', { class: `log-line ${e.level}` }, h(doc, 'span', { class: 'meta', text: e.at }), ` ${e.text}`));
    if (!s.log?.length) box.append(h(doc, 'p', { class: 'meta', text: 'Nothing yet.' }));
    stack.prepend(box);
  }
  // Jobs in collapsible groups: what needs the person first, then what is running, then what waits.
  const needsYou = (i: ApiItem) => i.state === 'VERIFY' || i.state === 'NEEDS_USER' || s.sessions[i.id]?.step === 'needs-user';
  const groups: { title: string; items: ApiItem[]; open: boolean }[] = [
    { title: 'Needs you', items: s.items.filter(needsYou), open: true },
    { title: 'In progress', items: s.items.filter((i) => !needsYou(i) && i.state !== 'PENDING'), open: true },
    { title: 'Waiting', items: s.items.filter((i) => !needsYou(i) && i.state === 'PENDING'), open: s.items.length <= 6 },
  ];
  for (const g of groups) {
    if (!g.items.length) continue;
    const d = h(doc, 'details', { class: 'group' }, h(doc, 'summary', { text: `${g.title} · ${g.items.length}` }));
    if (g.open) d.setAttribute('open', '');
    if (g.title === 'Waiting' && a.clearQueue) {
      // Clear queue asks first, and the question STAYS until answered (no timeout): Yes clears, No cancels
      // the question is drawn at the TOP of the list (see below): inside a collapsed group nobody saw it
      if (!s.clearArmed) d.append(h(doc, 'button', { class: 'link', id: 'clear-queue', text: 'Clear queue', disabled: s.busy, onclick: () => a.clearQueue!(true) }));
    }
    if (g.title === 'Waiting') {
      // one block per pick, newest first, each with its own Remove
      const byBatch = new Map<string, ApiItem[]>();
      for (const i of g.items) byBatch.set(i.batch_id, [...(byBatch.get(i.batch_id) ?? []), i]);
      for (const list of [...byBatch.values()].sort((x, y) => (y[0]!.batch?.created_at ?? '').localeCompare(x[0]!.batch?.created_at ?? ''))) {
        d.append(h(doc, 'div', { class: 'batch-head' }, h(doc, 'span', { text: `${batchTitle(list[0]!)} · ${list.length}` }),
          a.dropItems ? h(doc, 'button', { class: 'hint-link', text: 'Remove', disabled: s.busy, onclick: () => a.dropItems!(list.map((i) => i.id)) }) : null));
        for (const item of list) d.append(renderItem(doc, item, s, a, registry));
      }
    } else for (const item of g.items) d.append(renderItem(doc, item, s, a, registry));
    stack.append(d);
  }
  if (s.assistant && a.answer) root.append(renderChat(doc, s.assistant, a.answer, s.running && s.items.length ? 'running' : startable ? 'ready' : 'idle'));
}

function renderItem(doc: Document, item: ApiItem, s: PanelState, a: Actions, registry: Registry) {
  const sess = s.sessions[item.id];
  const card = s.cards[item.id];
  const policy = item.provider ? registry.policyOf(item.provider, s.policy) : 'BLOCKED';
  const def = item.provider ? registry.get(item.provider) : undefined;
  const el = h(doc, 'section', { class: 'item' });
  el.append(
    h(doc, 'div', { class: 'item-head' },
      h(doc, 'span', { class: 'avatar', text: (item.job?.company ?? '?').trim().charAt(0).toUpperCase() || '?' }),
      h(doc, 'div', { class: 'item-title' }, h(doc, 'h2', { text: item.job?.title ?? 'Job' }), h(doc, 'p', { class: 'meta', text: [item.job?.company, def?.label ?? item.provider].filter(Boolean).join(' · ') })),
      h(doc, 'p', { class: `badge ${item.state}`, text: STATE_LABEL[item.state] ?? item.state })),
  );
  const actions = h(doc, 'div', { class: 'actions' });
  const btn = (text: string, fn: () => void, cls = '') => actions.append(h(doc, 'button', { class: cls, text, disabled: s.busy, onclick: fn }));

  switch (item.state) {
    case 'PENDING':
      if (policy !== 'FILL_ONLY') el.append(h(doc, 'p', { class: 'blocked', text: BLOCK_TEXT.blocked }));
      else if (!def?.adapter) el.append(h(doc, 'p', { class: 'blocked', text: BLOCK_TEXT.none }));
      else btn('Start', () => a.start(item));
      break;
    case 'CLAIMED':
    case 'PREPARING':
      if (item.mine === false) {
        el.append(h(doc, 'p', { class: 'meta', text: 'Another linked browser is working on this job.' }));
        break;
      }
    // falls through: this browser holds it, so it is shown like any job being worked on
    case 'FILLING':
    case 'NEEDS_USER':
    case 'REVIEW':
      if (sess) {
        if (sess.step === 'needs-user' && sess.message === 'resume' && a.resumeChoice) {
          el.append(h(doc, 'p', { text: 'This application asks for a resume. Which one should Plato upload?' }));
          btn('Use my profile resume', () => a.resumeChoice!(item, 'profile'), 'primary');
          btn('Make one for this job', () => a.resumeChoice!(item, 'tailored'));
        } else if (sess.step === 'needs-user') el.append(h(doc, 'p', { text: sess.detail ? (sess.message === 'questions' && !/not found|did not|could not|no |still needed/i.test(sess.detail) ? `Still needed: ${sess.detail}. Plato is asking you in the chat below.` : sess.detail) : (NEEDS_TEXT[sess.message ?? ''] ?? 'Plato stopped here. Open the ticket to see why.') }));
        if (sess.step === 'review') {
          el.append(h(doc, 'p', { text: 'Plato is filling this form. It submits only if you allowed it; otherwise, or if it cannot, you press Submit.' }));
          const rv = s.formReviews?.[item.id];
          if (rv) el.append(renderFormReview(doc, rv, item, a, !!s.busy));
          btn('The form is ready — I will submit it myself', () => a.ready(item), 'primary');
        }
        btn('Cancel', () => a.cancel(item));
      } else {
        el.append(h(doc, 'p', { text: 'This was started in an earlier session and is not open here. It has not been submitted.' }));
        if (a.resumeJob) btn('Resume', () => a.resumeJob!(item), 'primary');
        btn('Release this job', () => a.release(item));
      }
      break;
    case 'AWAITING_SUBMIT':
      el.append(h(doc, 'p', { class: 'warn', text: sess?.message === 'submit_failed' ? 'Plato tried to submit and could not. Press Submit on the job page yourself. Come back here when you have.' : 'Press Submit on the job page yourself. Come back here when you have.' }));
      if (a.submitNow && sess) btn('Submit for me', () => a.submitNow!(item), 'primary');
      btn('Check the page', () => a.checkPage(item));
      btn('I submitted it', () => a.attest(item), a.submitNow && sess ? undefined : 'primary');
      btn('I am not sure', () => a.notSure(item));
      break;
    case 'VERIFY':
      el.append(h(doc, 'p', { class: 'warn', text: 'Plato cannot tell whether this was sent. Check the site or your email for a confirmation. Plato will not send it again by itself.' }));
      if (item.verify_reason) el.append(h(doc, 'p', { class: 'meta', text: `Reason: ${item.verify_reason}` }));
      btn('I submitted it', () => a.attest(item), 'primary');
      btn('I did not submit it', () => a.notSubmitted(item));
      break;
  }
  // A job that needs the person is a ticket: tap it and the chat opens on exactly that problem.
  if (a.ticket && (sess?.step === 'needs-user' || item.state === 'VERIFY')) {
    el.classList.add('ticket');
    el.append(h(doc, 'button', { class: 'primary', text: 'Open ticket in chat', disabled: s.busy, onclick: () => a.ticket!(item) }));
    if (a.retry && sess) el.append(h(doc, 'button', { text: 'Try again', disabled: s.busy, onclick: () => a.retry!(item) }));
    el.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button, a, input')) a.ticket!(item);
    });
  }
  if (card?.action === 'ask-user') el.append(h(doc, 'p', { class: 'meta', text: 'Nothing on the page proves the outcome.' }));
  if (actions.childElementCount) el.append(actions);
  return el;
}

const cap = (xs: string[], n = 6) => (xs.length > n ? [...xs.slice(0, n), `…and ${xs.length - n} more`] : xs);
const STATUS_TEXT: Record<Row['status'], string> = {
  pending: '',
  filled: 'Filled',
  failed: 'Failed',
  stale: 'Changed on the page: review again',
  'user-edited': 'You changed this: left alone',
  ineligible: 'No longer fillable',
};

// The review the person works through BEFORE anything is filled. Nothing here
// submits; the buttons only fill approved fields, retry failed ones, or look
// at the page again.
function renderFormReview(doc: Document, st: ReviewState, item: ApiItem, a: Actions, busy: boolean) {
  const box = h(doc, 'div', { class: 'review' });
  if (st.error) box.append(h(doc, 'p', { class: 'error', text: st.error }));
  for (const n of st.notes) box.append(h(doc, 'p', { class: 'meta', text: n }));

  if (st.phase === 'choosing-form') {
    box.append(h(doc, 'p', { text: 'Which form is this application?' }));
    for (const f of st.forms)
      box.append(
        h(doc, 'div', { class: 'row' },
          h(doc, 'strong', { text: f.label }),
          h(doc, 'p', { class: 'meta', text: `${f.fieldCount} fillable field(s), ${f.unsupportedCount} Plato cannot fill${f.sample.length ? ` · ${f.sample.join(', ')}` : ''}` }),
          h(doc, 'button', { text: 'Use this form', disabled: busy, onclick: () => a.formChoose(item, f.id) })),
      );
    return box;
  }

  box.append(h(doc, 'p', { class: 'meta', text: `Form: ${st.formLabel ?? 'this page'}` }));
  if (st.forms.length > 1) box.append(h(doc, 'button', { class: 'link', text: 'Change form', disabled: busy, onclick: () => a.formRestart(item) }));

  const shown = st.rows.filter((r) => r.category !== 'unmapped');
  const left = st.rows.filter((r) => r.category === 'unmapped').map((r) => r.label);
  for (const r of shown) {
    const row = h(doc, 'div', { class: `row ${r.status}` });
    row.append(h(doc, 'strong', { text: `${r.label}${r.required ? ' *' : ''}` }));
    if (r.proposed !== undefined)
      row.append(h(doc, 'p', { class: 'meta', text: `${r.shown ?? String(r.proposed)} · ${r.source ?? ''}${r.confidence !== undefined ? ` · ${Math.round(r.confidence * 100)}%` : ''}` }));
    const state = STATUS_TEXT[r.status] + (r.reason && r.status === 'failed' ? ` (${r.reason})` : '');
    if (state) row.append(h(doc, 'p', { class: r.status === 'filled' ? 'meta' : 'warn', text: state }));
    if (r.note) row.append(h(doc, 'p', { class: 'meta', text: r.note }));
    if (r.locked) row.append(h(doc, 'p', { class: 'meta', text: `Skip: ${r.lockReason ?? ''}${r.category === 'unsupported' && r.reason ? ` (${r.reason})` : ''}` }));
    else if (r.status === 'pending' || r.status === 'failed') {
      const mk = (c: 'use' | 'skip', text: string) => {
        const b = h(doc, 'button', { class: r.choice === c ? 'primary' : '', text, disabled: busy, onclick: () => a.reviewToggle(item, r.id, c) });
        b.setAttribute('aria-pressed', String(r.choice === c));
        return b;
      };
      row.append(h(doc, 'div', { class: 'actions' }, mk('use', 'Use'), mk('skip', 'Skip')));
    }
    box.append(row);
  }
  if (left.length) box.append(h(doc, 'p', { class: 'meta', text: `Other fields, left for you: ${cap(left).join(', ')}` }));
  if (st.sensitiveExcluded) box.append(h(doc, 'p', { class: 'meta', text: `${st.sensitiveExcluded} sensitive field(s) (passwords, codes, payment) were left alone.` }));
  if (st.submitAttempts) box.append(h(doc, 'p', { class: 'warn', text: 'The page tried to submit while filling. That was blocked.' }));

  const approved = st.rows.filter((r) => r.choice === 'use' && !r.locked && r.status === 'pending' && r.proposed !== undefined).length;
  const failed = st.rows.filter((r) => r.status === 'failed' && r.choice === 'use' && !r.locked).length;
  const bar = h(doc, 'div', { class: 'actions' });
  bar.append(h(doc, 'button', { class: 'primary', text: `Fill ${approved} approved field(s)`, disabled: busy || !approved || st.phase === 'round-limit', onclick: () => a.reviewFill(item, st.version) }));
  if (failed) bar.append(h(doc, 'button', { text: `Retry ${failed} failed`, disabled: busy, onclick: () => a.reviewRetry(item, st.version) }));
  bar.append(h(doc, 'button', { text: 'Re-inspect page', disabled: busy, onclick: () => a.reviewReinspect(item) }));
  box.append(bar, h(doc, 'p', { class: 'meta', text: `Fill round ${Math.min(st.fillRounds, 3)} of 3. Plato submits only when you allowed it.` }));
  return box;
}
