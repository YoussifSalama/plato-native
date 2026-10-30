import { ApiError, createApi } from '../core/api';
import { createOrchestrator, OrchestratorError, type Session } from '../core/orchestrator';
import { createOutbox } from '../core/outbox';
import { BatchError, createBatchRunner, MAX_BATCH_JOBS, pickToggle, type BatchRun, type JobMeta, type Live } from '../core/batch-runner';
import { blockingError, type FormReview } from '../core/form-review';
import { NEEDS_YOU, V3 } from '../core/messages';
import type { V3Op } from '../content/v3-reader';
import type { PageState } from '../dom/page-state';
import { createExecutor } from '../v3/executor';
import { runV3, type StopKind, type V3Result } from '../v3/run';
import type { AskQuestion, SeekerAnswer } from '../v3/contract';
import type { TurnRequest } from '../v3/contract';
import { runAiApply, type EaResult } from './ai-apply';
import { createTrusted } from './trusted';
import type { Snapshot } from '../dom/snapshot';
import { hash } from '../dom/inspect';
import { FORM_FILE, FORM_OPTIONS, PAGE_SETTLE, PAGE_STATE, SNAP_PRESS, SNAP_TAKE } from '../core/messages';
import { startFormReview } from './form-review-hook';
import { createTokenStore } from '../core/token-store';
import type { ApiItem, Decision, Evidence, PolicyMap, SearchJob } from '../core/types';
import { registry } from '../providers';
import { render, type Actions, type PanelState, type PickKey } from './view';
import { canStart, JOBS_PAGE_SIZE, latestBatch, queuedItems, visibleJobs } from './jobs-view';
import type { AnswerQuestion, OrchestratorEvent, OrchestratorRequest } from './../core/types';

// The side panel runs the whole flow. It is the only place (besides the
// service worker's one-line storage restriction) that ever sees the token.
const tokens = createTokenStore(chrome.storage.local as never);
const api = createApi({ base: __API_ORIGIN__, getToken: () => tokens.get() });
const outbox = createOutbox(chrome.storage.local);
let policy: PolicyMap | undefined;
const root = document.getElementById('root')!;
const state: PanelState = {
  status: 'loading', toasts: [], items: [], sessions: {}, progress: {}, cards: {}, formReviews: {}, pendingOutbox: 0, assistant: { messages: [], thinking: false },
  view: 'jobs', jobs: { searches: [], pickerOpen: false, jobs: [], jobsTotal: 0, known: {}, loading: false, q: '', sort: 'best', remote: false, fromPlato: false, picked: [], resumeMode: 'profile' },
  run: null, rows: [],
};
const reviews = new Map<string, FormReview>();
// The batch: one at a time, up to MAX_BATCH_JOBS, guarded in core/batch-runner.ts. Its record lives in session storage
// (a reloaded panel finds it again; a browser restart adopts what the server still lists).
const RUN_KEY = 'run';
const runner = createBatchRunner({
  get: async () => {
    const r = (await chrome.storage.session.get(RUN_KEY))[RUN_KEY] as BatchRun | undefined;
    return r && Array.isArray(r.itemIds) && r.outcomes ? r : null;
  },
  set: (r) => chrome.storage.session.set({ [RUN_KEY]: r }),
});
const MAX_TABS = 10;

const orch = createOrchestrator({
  api,
  outbox,
  registry,
  policy: () => policy,
  onLost: (id) => {
    delete state.sessions[id];
    const t = state.items.find((i) => i.id === id)?.job?.title ?? 'a job';
    toast(`Plato lost its hold on “${t}” (the server took it back). It returns to the queue.`, 'err');
    log('warn', `Lost hold on “${t}”: the server no longer has this browser as its owner.`);
    void refresh();
  },
});

// tab ids survive a panel reload for the browser session only
const tabKey = (id: string) => `tab:${id}`;
const rememberTab = (id: string, tabId: number) => chrome.storage.session.set({ [tabKey(id)]: tabId });
const recallTab = async (id: string) => ((await chrome.storage.session.get(tabKey(id)))[tabKey(id)] as number | undefined);
const tabAlive = async (id: string) => {
  const tabId = await recallTab(id);
  return tabId !== undefined && (await chrome.tabs.get(tabId).then(() => true, () => false));
};

let drawTimer: ReturnType<typeof setTimeout> | undefined;
const draw = () => {
  clearTimeout(drawTimer);
  drawTimer = undefined;
  render(document, root, state, actions, registry);
};
// Background redraws (a loop's progress, the periodic refresh) are coalesced, and held while the person has the menu,
// the sheet or the chat open: a full redraw under their pointer would swallow the click. Closing the overlay redraws.
const overlayOpen = () => !!(state.menuOpen || state.sheet || state.chatOpen);
const scheduleDraw = () =>
  (drawTimer ??= setTimeout(() => {
    drawTimer = undefined;
    if (overlayOpen()) return;
    draw();
  }, 250));
let errorAt = 0;
// The activity log (⋮ → Activity log): what happened and why, so nothing changes silently.
const log = (level: 'info' | 'warn' | 'error', text: string) => {
  state.log = [...(state.log ?? []), { at: new Date().toLocaleTimeString(), level, text: text.slice(0, 240) }].slice(-60);
};
let toastId = 0;
const toast = (text: string, kind?: 'ok' | 'err') => {
  const t = { id: ++toastId, text, kind };
  state.toasts = [...state.toasts, t].slice(-3);
  scheduleDraw();
  setTimeout(() => {
    state.toasts = state.toasts.filter((x) => x !== t);
    scheduleDraw();
  }, 3600);
};
const fail = (e: unknown) => {
  errorAt = Date.now();
  log('error', e instanceof ApiError ? `${e.status || 'network'}: ${e.message}` : e instanceof Error ? e.message : String(e));
  if (e instanceof ApiError && e.status === 401) {
    void tokens.clear();
    state.status = 'unpaired';
    state.error = 'This browser is no longer linked. Link it again.';
  } else if (e instanceof BatchError) toast(e.message, 'err');
  else state.error = e instanceof OrchestratorError || e instanceof ApiError ? e.message : 'Something went wrong. Nothing was submitted.';
  draw();
};
const guard = async (fn: () => Promise<void>) => {
  state.busy = true;
  state.error = undefined;
  draw();
  try {
    await fn();
  } catch (e) {
    fail(e);
  } finally {
    state.busy = false;
  }
  draw();
};

async function probeFor(item: ApiItem): Promise<Evidence> {
  const tabId = await recallTab(item.id);
  if (tabId === undefined) return { kind: 'gone' };
  try {
    await chrome.tabs.get(tabId);
  } catch {
    return { kind: 'gone' };
  }
  const def = item.provider ? registry.get(item.provider) : undefined;
  if (!def?.adapter || registry.policyOf(def.id, policy) !== 'FILL_ONLY') return { kind: 'unknown' };
  return (await def.adapter()).inspectOutcome(tabId);
}

// The seeker's speed setting decides how many jobs are open at once (careful 2, smart 4, fast 8).
const tabLimit = () => Math.min(state.settings?.tabs ?? MAX_TABS, MAX_TABS);
const autoSubmitDefault = () => (__FLAVOR__ === 'fixtures' ? !!state.settings?.autoSubmit : __AUTO_SUBMIT__); // production always presses Submit (owner rule 2026-10-21); the test build keeps the setting
const metaOf = (i: ApiItem): JobMeta => ({ jobId: i.job_id, title: i.job?.title ?? 'Job', company: i.job?.company ?? '', provider: i.provider });

let preselected = false;
let finishedToasted: string | null = null;
async function refresh() {
  try {
    const flushed = await orch.flushOutbox();
    if (flushed.stopped === 'unauthorized') throw new ApiError(401, 'unauthorized');
    try {
      const pol = await api.policy();
      policy = pol.providers;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      policy = undefined; // unknown policy = everything blocked
    }
    state.policy = policy;
    const items = await api.batches();
    const decided = await orch.reconcile(items, probeFor);
    state.cards = Object.fromEntries(decided.map((d) => [d.item.id, d.plan]));
    for (const d of decided) if (d.plan.action === 'confirm') runner.record(d.item.id, 'submitted', `The page confirmed it: “${d.plan.marker}”.`); // proven after a restart, by the page itself
    // reconcile may have recorded evidence or VERIFY: reload what the server now says
    state.items = decided.some((d) => d.plan.action === 'confirm' || d.plan.action === 'to-verify') ? await api.batches() : items;
    state.pendingOutbox = (await outbox.list()).length;
    if (!state.settings) state.settings = await api.settings().catch(() => null);
    state.autoSubmitPreview = autoSubmitDefault();
    if (state.settings && !preselected) state.jobs.resumeMode = state.settings.resumeMode;
    // the batch record is gone (browser restart) but jobs are open on the server: they are the batch
    if (!runner.current()) {
      const open = state.items.filter((i) => i.state !== 'PENDING');
      if (open.length) runner.adopt(open.map((i) => ({ itemId: i.id, meta: metaOf(i) })), open[0]!.batch?.label ? `“${open[0]!.batch!.label}” search` : 'Picked on Plato', autoSubmitDefault());
    }
    const run = runner.current();
    const live: Live = { sessions: state.sessions, tabsAlive: new Set() };
    if (run) for (const id of run.itemIds) if (!state.sessions[id] && (await tabAlive(id))) live.tabsAlive.add(id);
    state.rows = runner.settle(state.items, live);
    state.run = runner.current();
    state.eta = runner.eta(state.rows, tabLimit());
    if (state.run?.status === 'finished' && finishedToasted !== state.run.id) {
      finishedToasted = state.run.id;
      state.view = 'batch';
      toast('Batch finished. You can start another one.', 'ok');
    }
    // the first look at the queue: the newest pick made on Plato is ticked for the next batch
    if (!preselected) {
      preselected = true;
      if (!runner.isActive() && !state.jobs.picked.length) state.jobs.picked = latestBatch(queuedItems(state), (i) => canStart(i, state, registry)).slice(0, MAX_BATCH_JOBS).map((i) => `item:${i.id}` as PickKey);
    }
    state.jobs.picked = state.jobs.picked.filter((k) => !k.startsWith('item:') || queuedItems(state).some((i) => `item:${i.id}` === k)); // a queued job that went away leaves the selection
    state.status = 'ready';
    if (Date.now() - errorAt > 12_000) state.error = undefined; // a fresh failure stays on screen long enough to read
    if (runner.isActive()) setTimeout(() => void runQueue(), 0);
    void resumeOrphans(); // a reloaded panel picks its open jobs back up by itself
    if (!Object.values(state.sessions).some((x) => x.message === 'submit_failed')) void chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return fail(e);
    state.status = state.status === 'loading' ? 'ready' : state.status;
    state.error = 'Cannot reach Plato right now. Showing the last known state; nothing was submitted.';
  }
  scheduleDraw();
}

const sessionOf = (item: ApiItem) => orch.session(item.id) as Session;
const setStep = (item: ApiItem, step: 'preparing' | 'review' | 'armed' | 'needs-user', message?: string, detail?: string, extra: { stop?: StopKind; ask?: AskQuestion[] } = {}) => {
  if (!orch.session(item.id)) return void delete state.sessions[item.id]; // the job was cancelled or lost meanwhile: nothing to show as live
  state.sessions[item.id] = { step, message, detail, ...extra };
  if (step === 'needs-user') {
    // the seeker is looking at the tab: say what is needed right there (amber overlay) and on the icon
    const tabId = orch.session(item.id)?.tabId;
    if (tabId !== undefined) void chrome.tabs.sendMessage(tabId, { type: NEEDS_YOU, text: 'Plato needs you here' }).catch(() => undefined);
    void chrome.action.setBadgeText({ text: '!' });
    void chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
  }
};

const pendingFill = (ctl: FormReview) => ctl.get().rows.filter((r) => r.choice === 'use' && !r.locked && r.status === 'pending' && r.proposed !== undefined);
// One round only: fields the page reveals while filling are NOT filled from the keyword fallback;
// they wait for the next AI decision (the generic loop decides every field).
async function fillOnce(ctl: FormReview) {
  if (ctl.get().phase === 'reviewing' && pendingFill(ctl).length) await ctl.fillApproved(ctl.get().version);
  if (ctl.get().phase === 'reviewing' && ctl.get().rows.some((r) => r.status === 'failed')) await ctl.retryFailed(ctl.get().version);
}

const answerType = (r: { kind?: string; ftype?: string }): AnswerQuestion['type'] =>
  r.ftype === 'textarea' || r.kind === 'richtext' ? 'paragraph' : r.kind === 'email' ? 'email' : r.kind === 'tel' ? 'phone' : r.kind === 'number' ? 'number' : r.kind === 'date' ? 'date' : r.kind === 'url' ? 'url' : r.kind === 'select' || r.kind === 'radio' ? 'choice' : r.kind === 'checkbox-group' ? 'multi' : r.kind === 'checkbox' ? 'boolean' : r.kind === 'combobox' && (r as ReviewRow).options?.length ? 'choice' : 'text';

// The fields the AI may answer, and how each is described to it (shared by every AI call).
type ReviewRow = ReturnType<FormReview['get']>['rows'][number];
const answerable = (r: ReviewRow) => r.status === 'pending' && !r.hasValue && !!r.kind && r.kind !== 'file' && !['already-filled', 'consent', 'unsupported'].includes(r.category);
// An upload field for the resume: by its label, or by the control's own name ("resume" behind an "Attach" button).
const isResumeField = (r: ReviewRow) => r.kind === 'file' && /resume|\bcv\b|curriculum/i.test(`${r.label} ${r.name ?? ''}`);
const RESUME_ASK = 'Resume: which resume should Plato upload?';
const toQuestion = (r: ReviewRow): AnswerQuestion => ({ id: r.id, label: r.label.slice(0, 300), type: answerType(r), required: r.required, ...(r.options?.length && { options: r.options.map((o) => o.label.slice(0, 200)) }), ...((r.error || r.form || r.kind === 'combobox' || r.kind === 'checkbox') && { hint: [r.error && `The page shows an error on this field: "${r.error.slice(0, 120)}"`, r.form && `In the form "${r.form.slice(0, 80)}"`, r.kind === 'combobox' && (r.options?.length ? 'A dropdown: answer with one of the options exactly; if your true value is not offered, the closest truthful option (Other, None of the above, Prefer not to say)' : `A type-ahead list${r.optionsTotal ? ` of ${r.optionsTotal} options` : ''}: answer with the exact option name as the site would list it (e.g. a country name)`), r.kind === 'checkbox' && (r.required ? 'A required box: the application cannot be sent without it' : 'An optional box')].filter(Boolean).join('. ') }) });
// What the page shows, without field values: equal signatures = nothing changed since the last look.
const pageSig = (sn: Snapshot) => hash(JSON.stringify([sn.url, sn.dialogOpen, sn.dialogTitle, sn.elements.map((e) => e.label), sn.fields, sn.alerts, sn.text]));

// A fill went wrong: tell the AI what it answered and what the page did, and take its corrected value.
// Returns how many fields got a new value (0 = the AI has nothing better: the seeker is asked).
// `staged`: field id -> the value the decision gave it. Repaired: those not on the page now.
async function aiRepair(item: ApiItem, ctl: FormReview, pageErrors: string[], staged: Map<string, string>, afterSubmit = false) {
  // a row the page flagged with its own error joins the repair even when the decision gave it no value
  // (after a Submit every page error counts; before it, an "is required" on a field holding a value is stale)
  const blocks = (r: Parameters<typeof blockingError>[0]) => (afterSubmit ? !!r.error : blockingError(r));
  const rows = ctl.get().rows.filter((r) => (staged.has(r.id) || blocks(r)) && r.status !== 'filled' && r.status !== 'user-edited' && r.kind && r.kind !== 'file' && r.category !== 'consent');
  if (!rows.length) return 0;
  const questions: AnswerQuestion[] = rows.slice(0, 60).map((r) => ({
    id: r.id,
    label: r.label.slice(0, 300),
    type: answerType(r),
    required: r.required,
    ...(r.options?.length && { options: r.options.map((o) => o.label.slice(0, 200)) }),
    hint: (staged.has(r.id) ? `Your last answer "${staged.get(r.id) ?? ''}" did not work: ${WHY[r.reason ?? ''] ?? r.reason ?? (r.options?.length ? 'it is not one of the options' : 'not filled')}.` : 'This field was left empty and the page rejected the form.') + `${r.error ? ` The page says for this field: ${r.error}` : ''}${pageErrors.length ? ` The page says: ${pageErrors.join('; ')}` : ''}`.slice(0, 300),
  }));
  const res = await api.answers(item.id, { questions }).catch(() => ({ answers: [] as { id: string; value: string | null }[], aiFailed: true }));
  if (res.aiFailed) {
    aiDown.add(item.id);
    return 0;
  }
  let n = 0;
  for (const a of res.answers) {
    const r = rows.find((x) => x.id === a.id);
    if (!a.value || !r || a.value === staged.get(r.id)) continue; // the same value again would fail the same way
    ctl.propose(a.id, a.value, 'ai-repair');
    staged.set(a.id, a.value);
    n++;
  }
  return n;
}

// Why a required field is still empty, in the seeker's words.
const WHY: Record<string, string> = { 'page-cleared': 'the page cleared it', 'value-mismatch': 'the page changed it', 'page-rejected': 'the page rejected it', 'no-option': 'no matching choice', 'too-long': 'answer too long', 'stale-form': 'the form reloaded', 'stale-field': 'the form reloaded', 'no-such-field': 'the form reloaded', 'user-edited': 'you edited it', 'no-result': 'the page gave no answer for it', 'replaced': 'the page replaced the field' };
const aiDown = new Set<string>(); // items whose last AI draft call failed (network / provider)
const whyEmpty = (r: { reason?: string; proposed?: unknown }, itemId: string) => (r.reason ? (WHY[r.reason] ?? r.reason) : r.proposed !== undefined ? 'not filled' : aiDown.has(itemId) ? 'AI not reachable' : 'no answer yet');

// What a finished run means for the job, the same for every site. Terminal outcomes are recorded on the batch.
async function finishRun(item: ApiItem, s: Session, result: EaResult | V3Result) {
  jot(item.id, result.kind === 'needs-user' ? `Stopped for the seeker: ${result.why}` : result.kind === 'confirmed' ? `Submitted: the page confirms (${result.marker}).` : result.kind === 'ready' ? 'Complete: waiting for the seeker to press Submit.' : result.kind === 'skip' ? `Skipped: ${result.why}` : 'Submit pressed, no confirmation on the page.');
  if (result.kind === 'confirmed') {
    if (orch.session(item.id)) {
      // still held: record the confirmation when the page's own marker shows it, else the proof the engine quoted from the page
      const ev = await orch.observe(s);
      if (ev.kind !== 'confirmed' && orch.session(item.id)) await orch.confirm(s, result.marker);
    } // else a look during the run already recorded it (engine v2 observes the page on every look)
    delete state.sessions[item.id];
    reviews.delete(item.id);
    delete state.formReviews![item.id];
    runner.record(item.id, 'submitted', `The page confirmed it: “${result.marker.replace(/^page:/, '')}”.`);
  } else if (result.kind === 'ready') setStep(item, 'armed');
  else if (result.kind === 'skip') {
    await orch.skip(s, result.reason, result.why); // SKIPPED with the true reason, not "needs you"
    delete state.sessions[item.id];
    runner.record(item.id, 'skipped', result.why);
    toast(`Skipped “${item.job?.title ?? 'job'}”: ${result.why}`);
  } else if (result.kind === 'unconfirmed') {
    // pressed once; never again. The page's own marker (page-state.ts) may still prove it, e.g. LinkedIn's "Application sent"
    const ev = orch.session(item.id) ? await orch.observe(s).catch(() => ({ kind: 'unknown' }) as Evidence) : ({ kind: 'unknown' } as Evidence);
    if (ev.kind === 'confirmed') {
      delete state.sessions[item.id];
      runner.record(item.id, 'submitted', `The page confirmed it: “${ev.marker}”.`);
    } else await orch.notSure(s, 'easy_apply_unconfirmed');
  }
  else {
    setStep(item, 'needs-user', result.why.includes(RESUME_ASK) ? 'resume' : 'questions', result.why, 'stop' in result ? { stop: result.stop, ask: result.ask } : {});
    void api.stop(item.id, { reason: stopKind(result.why), message: result.why.slice(0, 300) }).catch(() => undefined); // for the stop report
    void chrome.action.setBadgeText({ text: '!' });
    void chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
  }
}
// Real mouse / key events through chrome.debugger: what custom dropdowns, boxes and buttons accept.
// Attached per job tab while the loop runs; detached when it stops. Fails (DevTools open): page-side fallback.
// No call may hang the run: each one has a limit, and the error names what did not answer (it lands in the journal).
const limit = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} did not answer in ${ms / 1000}s`)), ms))]);
const trusted = createTrusted({
  attach: async (tabId) => {
    await limit(chrome.debugger.attach({ tabId }, '1.3'), 5000, 'debugger attach');
    return true;
  },
  detach: (tabId) => limit(chrome.debugger.detach({ tabId }), 5000, 'debugger detach'),
  cdp: (tabId, method, params) => timedTab(tabId, `cdp ${method}${params?.type ? ` ${String(params.type)}` : ''}`, limit(chrome.debugger.sendCommand({ tabId }, method, params), 5000, `CDP ${method}`)),
  send: <T>(tabId: number, msg: unknown) => timedTab(tabId, `msg ${(msg as { type?: string; what?: string }).type ?? ''}${(msg as { what?: string }).what ? `:${(msg as { what?: string }).what}` : ''}`, limit(chrome.tabs.sendMessage(tabId, msg) as Promise<T>, 15_000, `page message ${(msg as { type?: string }).type ?? ''}`)),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});
chrome.debugger.onDetach.addListener(({ tabId }) => void (tabId !== undefined && trusted.detach(tabId)));

// The application's journal: what Plato did on each page (decided, filled, failed, pressed, stopped). The AI gets it
// with every decision and the chat gets it with every turn: neither forgets the steps already taken.
// Kept in session storage so a reloaded panel still has it. The last line is the row's progress text.
const journals = new Map<string, string[]>();
const runStart = new Map<string, number>(); // when each job's run started: journal lines carry +seconds
const jot = (itemId: string, line: string) => {
  const t0 = runStart.get(itemId) ?? (runStart.set(itemId, Date.now()), Date.now());
  const at = `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const clean = line.replace(/\s+/g, ' ').trim();
  const j = [...(journals.get(itemId) ?? []), `${at} ${clean}`.slice(0, 300)].slice(-60);
  journals.set(itemId, j);
  state.progress[itemId] = clean.slice(0, 140);
  // the row's progress line is updated in place: a full redraw several times a second would detach the buttons
  // under the person's pointer while a job runs (the next draw shows the line anyway)
  const step = root.querySelector(`[data-item="${itemId}"] .step`);
  if (step) step.textContent = state.progress[itemId]!;
  void chrome.storage.session.set({ [`journal:${itemId}`]: j }).catch(() => undefined);
};
// Timing trace (developer view, not the seeker's journal): how long each wait took. Kept in session storage.
const traces = new Map<string, string[]>();
const timed = async <T>(itemId: string, what: string, p: Promise<T>): Promise<T> => {
  const t = Date.now();
  try {
    return await p;
  } finally {
    const tr = [...(traces.get(itemId) ?? []), `${what} ${Date.now() - t}ms`].slice(-120);
    traces.set(itemId, tr);
    void chrome.storage.session.set({ [`trace:${itemId}`]: tr }).catch(() => undefined);
  }
};
// the same timing for the trusted-input calls, per tab (only slow ones, to keep it readable)
const timedTab = async <T>(tabId: number, what: string, p: Promise<T>): Promise<T> => {
  const t = Date.now();
  try {
    return await p;
  } finally {
    const ms = Date.now() - t;
    if (ms >= 150) {
      const key = `tab${tabId}`;
      const tr = [...(traces.get(key) ?? []), `${what} ${ms}ms`].slice(-120);
      traces.set(key, tr);
      void chrome.storage.session.set({ [`trace:${key}`]: tr }).catch(() => undefined);
    }
  }
};
const journalOf = async (itemId: string) => {
  if (!journals.has(itemId)) {
    const got: Record<string, unknown> = await chrome.storage.session.get(`journal:${itemId}`).catch(() => ({}));
    const saved = got[`journal:${itemId}`] as string[] | undefined;
    if (saved) journals.set(itemId, saved);
  }
  return journals.get(itemId) ?? [];
};

// Jobs the seeker explicitly asked Plato to submit (chat "submit", or the button): overrides the run setting for that job.
const submitOverride = new Set<string>();
// What the seeker said about a job ("apply anyway", a salary, the answer to Plato's question): sent with its next decision, never asked again.
const notes = new Map<string, string[]>();
const note = (itemId: string, text: string) => {
  const list = notes.get(itemId) ?? [];
  if (text && !list.includes(text)) notes.set(itemId, [...list, text].slice(-10));
};
// ponytail: regex over our own stop texts; a typed reason on EaResult if these texts drift
const stopKind = (why: string) =>
  /sign in|log in|verification|captcha/i.test(why) ? 'login-or-captcha'
  : /still empty|needs your answer/i.test(why) ? 'unanswered-fields'
  : /could not press|did not (move|advance|settle)|named no control|no way to start/i.test(why) ? 'navigation'
  : /more steps/i.test(why) ? 'too-many-steps'
  : /lost the page/i.test(why) ? 'page-lost'
  : why.includes(RESUME_ASK) ? 'resume-choice'
  : 'ai-asked';

// ---- Every site: the AI fills the page and drives it (ai-apply.ts) ----
async function runAi(item: ApiItem) {
  if (__ENGINE__ === 'v3') return runV3Item(item); // engine v3: the backend brain plans, this panel executes (src/v3/)
  if (eaRunning.has(item.id)) return;
  eaRunning.add(item.id);
  const s = sessionOf(item);
  const tabId = s.tabId;
  if (tabId === undefined) return void eaRunning.delete(item.id);
  const send = <T>(msg: unknown) => chrome.tabs.sendMessage(tabId, msg) as Promise<T>;
  const cdpOn = await trusted.attach(tabId); // real presses for dropdowns, boxes and buttons
  if (!cdpOn) log('warn', 'Trusted input unavailable on this tab (another debugger holds it): page-side events instead.');
  // the run's setting ("Let Plato press Submit for me", on by default), or the seeker's explicit "submit" for this
  // job (chat or the button). No per-site list: the site's own policy already decided whether Plato may fill it.
  // Plato always presses Submit once the form is complete (owner, 2026-10-21: no preference). The test build keeps
  // the run setting so the crash / recovery flows can still exercise a job that waits at Submit.
  const auto = submitOverride.has(item.id) || (__FLAVOR__ === 'fixtures' ? !!state.autoSubmit : __AUTO_SUBMIT__); // "Submit for me" always wins
  try {
    const canFill = !!registry.get(item.provider ?? '')?.capabilities.fillForms; // owner has enabled filling on this site
    let ctl: FormReview | null = null; // this page's inspected fields and the decision's values
    let alerts: string[] = [];
    let want = ''; // label of the control the decision named
    let staged = new Map<string, string>(); // field id -> the decision's value for it
    let labelOfStaged = new Map<string, string>(); // field id -> its label at decision time (to follow a replaced element)
    let submittedOnce = false; // after a Submit press every page error counts; before it, "is required" on a filled field is stale
    const blocks = (r: Parameters<typeof blockingError>[0]) => (submittedOnce ? !!r.error : blockingError(r));
    let resumeFile: { name: string; mime: string; data: string } | null = null; // fetched once per run
    let resumeWhy = ''; // why there is no file to upload (no CV on the profile, the build failed...)
    const uploaded = new Set<string>(); // file field ids that hold the resume now
    // The resume goes in FIRST: a site may autofill from it, and that must never overwrite what we type.
    // The choice is this run's preference (settings), kept on the application once used; with no
    // preference at all the seeker is asked once (the resume ticket).
    const uploadResume = async (c: FormReview) => {
      const targets = c.get().rows.filter((x) => isResumeField(x) && !x.hasValue && !uploaded.has(x.id));
      if (!targets.length) return false;
      if (!item.resume_choice && state.settings?.resumeMode) {
        item.resume_choice = state.settings.resumeMode;
        // saved BEFORE the file is fetched: the server serves the file only for a recorded choice (race seen 2026-10-23)
        await api.resumeChoice(item.id, item.resume_choice).catch((e) => jot(item.id, `Resume choice not saved: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160)));
      }
      if (!item.resume_choice) return false;
      resumeFile ??= await api.file(item.id).catch((e) => {
        resumeWhy = e instanceof Error ? e.message : String(e);
        log('error', `resume file: ${resumeWhy}`);
        return null;
      });
      if (!resumeFile) return false; // no file: the field stays a gap, with the reason
      let any = false;
      for (const r of targets) {
        const res = await send<{ status: string }>({ type: FORM_FILE, formId: c.get().formId, fieldId: r.id, fp: r.fp, ...resumeFile }).catch(() => ({ status: 'failed' }));
        if (res.status === 'filled') {
          uploaded.add(r.id);
          any = true;
        }
      }
      if (any) {
        await sleep(1500); // the page may parse the resume and fill fields from it
        await c.reinspect();
      }
      return any;
    };
    const snap = () => send<Snapshot>({ type: SNAP_TAKE });
    // decided values that are not on the page: a failed fill, or a value the field refused (no such option)
    const tried = () =>
      ctl
        ? [
            // a row the page or the person filled meanwhile (user-edited) holds a value: not a gap
            // a page error outranks a value in the box: the page itself says the field is not accepted
            ...ctl.get().rows.filter((r) => (staged.has(r.id) || blocks(r)) && r.status !== 'filled' && r.status !== 'user-edited' && (blocks(r) || (!r.hasValue && r.category !== 'already-filled'))).map((r) => `${r.label} (${r.error ? `the page says: ${r.error}` : whyEmpty(r, item.id) === 'no answer yet' ? 'not a valid choice' : whyEmpty(r, item.id)})`),
            ...ctl.get().rows.filter((r) => isResumeField(r) && !r.hasValue && !!item.resume_choice).map((r) => `${r.label} (the resume could not be uploaded${resumeWhy ? `: ${resumeWhy}` : ''})`),
          ]
        : [];
    const show = () => {
      if (ctl) state.formReviews![item.id] = ctl.get();
      scheduleDraw();
    };
    const result = await runAiApply({
      settle: async () => !!(await timed(item.id, 'settle', send<{ settled: boolean } | undefined>({ type: PAGE_SETTLE }).catch(() => undefined)))?.settled,
      look: async () => {
        const sn = await timed(item.id, 'look:snapshot', snap());
        alerts = sn.alerts;
        const e = await timed(item.id, 'look:observe', orch.observe(s).catch(() => ({ kind: 'unknown' }) as Evidence)); // records SUBMITTED_CONFIRMED itself
        if (e.kind === 'confirmed') runner.record(item.id, 'submitted', `The page confirmed it: “${e.marker}”.`);
        return { sig: pageSig(sn), confirmed: e.kind === 'confirmed' ? e.marker : null, loading: sn.loading, text: sn.text };
      },
      decide: async (history) => {
        const sn = await snap();
        ctl = canFill ? await timed(item.id, 'decide:read-form', startFormReview({ api, itemId: item.id, tabId, scope: sn.dialogOpen ? 'dialog' : undefined, trusted: cdpOn ? trusted : null }).catch(() => null)) : null;
        if (ctl && !ctl.get().formId) ctl = null;
        if (ctl) reviews.set(item.id, ctl);
        if (ctl) await timed(item.id, 'decide:resume', uploadResume(ctl)); // before the AI sees the fields: what the resume autofilled is kept
        if (ctl) {
          // dropdowns whose options exist only when open: open each, read its list, close it, so the AI picks from it
          const combos = ctl.get().rows.filter((r) => answerable(r) && r.kind === 'combobox' && r.optionsTotal === undefined);
          if (combos.length) {
            const formId = ctl.get().formId!;
            const found = cdpOn
              ? await trusted.probe(tabId, formId, combos.map((r) => ({ id: r.id, fp: r.fp }))).catch(() => [])
              : await send<{ fieldId: string; options: { value: string; label: string }[]; total: number }[]>({ type: FORM_OPTIONS, formId, fieldIds: combos.map((r) => r.id) }).catch(() => []);
            for (const f of found) ctl.setOptions(f.fieldId, f.options, f.total);
          }
        }
        const rows = ctl ? ctl.get().rows.filter(answerable).slice(0, 60) : [];
        // required fields Plato cannot fill yet (uploads, custom dropdowns), and consent boxes only the
        // seeker may tick: never pressed past
        // a resume upload is asked about even when the input is not marked required (sites mark the heading, not the input)
        const cannot = ctl ? ctl.get().rows.flatMap((r) => (r.hasValue ? [] : isResumeField(r) ? (item.resume_choice ? [] : [RESUME_ASK]) : !r.required ? [] : r.category === 'unsupported' ? [`${r.label} (Plato cannot fill this field yet)`] : r.category === 'consent' ? [`${r.label} (your tick)`] : r.kind === 'file' ? [`${r.label} (upload it yourself)`] : [])) : [];
        let d: Decision;
        try {
          d = await timed(item.id, 'decide:ai', api.decide(item.id, { snapshot: sn, history: history.slice(-10), autoSubmit: auto, fields: rows.map(toQuestion), notes: notes.get(item.id) ?? [], journal: (await journalOf(item.id)).slice(-30) }));
        } catch (e) {
          // the AI (or Plato) did not answer: a ticket that says so, never "lost the page"
          const msg = e instanceof Error ? e.message : String(e);
          log('error', `decide: ${msg}`);
          aiDown.add(item.id);
          return { action: 'ask', ref: null, intent: null, reason: `Plato's AI could not be reached (${msg}). Try again in a moment.`, skip_reason: null, missing: [] };
        }
        if (d.aiFailed) aiDown.add(item.id);
        else aiDown.delete(item.id);
        staged = new Map(d.fills.map((f) => [f.id, f.value]));
        labelOfStaged = new Map(d.fills.map((f) => [f.id, rows.find((r) => r.id === f.id)?.label ?? '']));
        const where = (() => { try { return new URL(sn.url).pathname; } catch { return ''; } })();
        jot(item.id, `Page ${history.length + 1} (${d.page_type}${sn.dialogOpen ? ', dialog' : ''} ${where}): ${rows.length} field(s) read, ${d.fills.length} answered${d.missing.length ? `; missing: ${d.missing.map((m) => `${rows.find((r) => r.id === m.field_id)?.label ?? m.field_id} (${m.reason})`).join('; ')}` : ''}; next: ${d.next.action}${d.next.intent ? ` ${d.next.intent}` : ''}${d.next.ref ? ` "${sn.elements.find((e) => e.ref === d.next.ref)?.label ?? ''}"` : ''}.`);
        for (const f of d.fills) ctl?.propose(f.id, f.value, 'ai-decision');
        const label = (id: string) => rows.find((r) => r.id === id)?.label ?? id;
        want = sn.elements.find((e) => e.ref === d.next.ref)?.label ?? '';
        show();
        const missing = [...d.missing.map((m) => `${label(m.field_id)} (${m.reason})`), ...cannot];
        return { ...d.next, label: want || undefined, missing };
      },
      fill: async () => {
        if (!ctl) return { failed: [], revealed: false };
        const before = new Set(ctl.get().rows.map((r) => r.id));
        await timed(item.id, 'fill:write', fillOnce(ctl));
        {
          const rows = ctl.get().rows.filter((r) => staged.has(r.id));
          const ok = rows.filter((r) => r.status === 'filled').map((r) => `${r.label} = ${String(r.shown ?? r.proposed).slice(0, 60)}`);
          const bad = rows.filter((r) => r.status !== 'filled' && r.status !== 'user-edited' && (blocks(r) || (!r.hasValue && r.category !== 'already-filled'))).map((r) => `${r.label} (${r.error ? `the page says: ${r.error}` : whyEmpty(r, item.id)}${r.proposed === undefined ? ` [${r.status}/${r.category}${r.locked ? '/locked' : ''}]` : ''})`);
          const present = rows.filter((r) => r.status === 'user-edited' || (r.status !== 'filled' && !blocks(r) && (r.hasValue || r.category === 'already-filled'))).map((r) => r.label);
          // staged values whose rows are gone (the page replaced its form after the decision): never dropped silently
          // the page replaced some fields after the decision (Ashby re-mounts the personal block after a resume upload):
          // the value staged for the old element goes to the new element with the same label, once
          const goneIds = [...staged.keys()].filter((id) => !ctl!.get().rows.some((r) => r.id === id));
          let restaged = 0;
          for (const id of goneIds) {
            const label = labelOfStaged.get(id);
            const twin = label && ctl.get().rows.find((r) => r.label === label && !r.hasValue && r.status === 'pending' && r.proposed === undefined && r.kind && r.kind !== 'file');
            if (!twin) continue;
            ctl.propose(twin.id, staged.get(id)!, 'ai-decision');
            staged.set(twin.id, staged.get(id)!);
            labelOfStaged.set(twin.id, label);
            staged.delete(id);
            restaged++;
          }
          if (restaged) { jot(item.id, `${restaged} value(s) moved to the page's replacement field(s) by label.`); await timed(item.id, 'fill:rewrite', fillOnce(ctl)); }
          const gone = goneIds.length - restaged;
          // rows the decision valued that were neither written nor reported failed: say what state kept them out
          const held = rows.filter((r) => r.status !== 'filled' && !bad.some((b) => b.startsWith(r.label)) && !present.includes(r.label)).map((r) => `${r.label.slice(0, 30)} [${r.status}/${r.category}${r.locked ? '/locked' : ''}${r.proposed === undefined ? '/no-proposal' : ''}]`);
          if (held.length) jot(item.id, `Held back: ${held.join('; ').slice(0, 260)}`);
          const err = ctl.get().error;
          if (err) jot(item.id, `Fill error: ${err.slice(0, 200)}`);
          // one journal line per fact (each line is capped): what was written, what the page held, what did not stick
          if (ok.length || bad.length || gone) jot(item.id, `Filled: ${ok.join('; ') || 'nothing'}.`);
          if (present.length) jot(item.id, `Already on the page: ${present.join('; ')}.`);
          if (bad.length) jot(item.id, `Did not stick: ${bad.join('; ')}.`);
          if (gone) jot(item.id, `${gone} value(s) for fields no longer on the page (the form was replaced).`);
        }
        await timed(item.id, 'fill:resume', uploadResume(ctl)); // a resume field revealed after the decision
        await sleep(800); // a widget may react to what was typed (a phone box reformats or clears on country change)
        await timed(item.id, 'fill:reinspect', ctl.reinspect()); // filling can reveal fields (a city after the country): they need a decision too
        if (ctl.get().rows.some((r) => r.reason === 'page-cleared')) await fillOnce(ctl); // the page emptied a value we wrote: once more
        const revealed = ctl.get().rows.some((r) => !before.has(r.id) && answerable(r));
        show();
        return { failed: tried(), revealed };
      },
      repair: async () => {
        if (!ctl) return [];
        await aiRepair(item, ctl, alerts, staged, submittedOnce);
        await fillOnce(ctl);
        jot(item.id, `Repair: ${ctl.get().rows.filter((r) => staged.has(r.id)).map((r) => `${r.label} ${r.status === 'filled' ? 'fixed' : `still failing (${whyEmpty(r, item.id)})`}`).join('; ')}.`);
        show();
        return tried();
      },
      // the decided control, found again by its label: filling may have renumbered the refs
      press: async (ref) => {
        const sn = await snap();
        const el = sn.elements.find((e) => e.ref === ref && e.label === want) ?? sn.elements.find((e) => e.label === want);
        if (!el) return { clicked: false };
        jot(item.id, `Pressed "${el.label}".`);
        if (cdpOn) {
          const r = await trusted.pressRef(tabId, el.ref).catch(() => ({ clicked: false }));
          if (r.clicked) return r;
        }
        return send({ type: SNAP_PRESS, ref: el.ref });
      },
      // Submit pressed, nothing proved it: read the page's own errors, tied to fields (the form must still be there)
      afterSubmit: async () => {
        submittedOnce = true;
        if (!ctl) return { errors: [] };
        await timed(item.id, 'after-submit:reinspect', ctl.reinspect());
        const sn = await snap();
        alerts = sn.alerts;
        const errs = ctl.get().rows.filter((r) => r.error).map((r) => `${r.label}: ${r.error}`);
        const st = await send<{ captcha?: boolean } | undefined>({ type: PAGE_STATE }).catch(() => undefined);
        jot(item.id, st?.captcha ? 'Submit did not go through: the site put up a human check (captcha).' : errs.length ? `Submit did not go through; the page shows ${errs.length} field error(s): ${errs.join('; ').slice(0, 220)}` : `Submit did not go through; no field error shown${alerts.length ? ` (page says: ${alerts.join('; ').slice(0, 160)})` : ''}.`);
        // the page's own words for a refused submission ("flagged as possible spam", "could not be submitted"): the seeker decides
        const refused = alerts.find((a) => /couldn.?t submit|could not (be )?submit|not (be )?submitted|flagged|spam|rejected|try again later|something went wrong/i.test(a));
        return { errors: errs, captcha: !!st?.captcha, ...(refused && { refused }) };
      },
      arm: async () => void (s.item.state !== 'AWAITING_SUBMIT' && (await orch.armForSubmit(s))),
      autoSubmit: auto,
      sleep,
    });
    await finishRun(item, s, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log('error', `apply loop: ${msg}`);
    await finishRun(item, s, { kind: 'needs-user', why: `Plato lost the page (${msg.slice(0, 120)}). Open the tab and try again.` });
  } finally {
    eaRunning.delete(item.id);
    await trusted.detach(tabId); // the yellow "debugging" bar goes away between runs
  }
}

const eaRunning = new Set<string>();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- Engine v3: the backend holds the Claude conversation; this panel runs each browser action in the job's tab ----
// A stopped run remembers how its conversation continues (the seeker's answer, a solved captcha); a fresh run starts over.
const v3Next = new Map<string, 'seeker_answer' | 'solved'>();
const v3Answers = new Map<string, SeekerAnswer[]>(); // the form's structured answers, sent with the next seeker_answer turn
// What a thrown error means for the person: Plato's own failure (server, network) or the job's tab gone. Never a text box.
const lostResult = (e: unknown): V3Result => {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof ApiError) return { kind: 'needs-user', stop: 'error', why: `Plato's server failed while working on this job (${e.status ? `HTTP ${e.status}: ` : ''}${msg.slice(0, 100)}). Nothing was typed or sent since the last step. Press Try again; if it repeats, the problem is on Plato's side, not the job site.` };
  return { kind: 'needs-user', stop: 'lost', why: `Plato lost contact with the job's tab (${msg.slice(0, 100)}). Nothing was sent. Open the tab, then press Try again.` };
};
const v3Running = new Set<string>();
// The tab finished loading: Chrome's own event, not a poll. Resolves at once if it already has.
const tabLoaded = (tabId: number, capMs: number) =>
  new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpd);
      clearTimeout(cap);
      resolve(v);
    };
    const onUpd = (id: number, info: { status?: string }) => id === tabId && info.status === 'complete' && finish(true);
    chrome.tabs.onUpdated.addListener(onUpd);
    const cap = setTimeout(() => finish(false), capMs);
    void chrome.tabs.get(tabId).then((t) => t.status === 'complete' && finish(true), () => finish(false));
  });
async function runV3Item(item: ApiItem) {
  if (v3Running.has(item.id)) return;
  v3Running.add(item.id);
  const s = sessionOf(item);
  const tabId = s.tabId;
  if (tabId === undefined) return void v3Running.delete(item.id);
  const auto = submitOverride.has(item.id) || (__FLAVOR__ === 'fixtures' ? !!state.autoSubmit : __AUTO_SUBMIT__); // see runAi
  const send = <T>(msg: V3Op) => timedTab(tabId, `v3 ${msg.op}`, limit(chrome.tabs.sendMessage(tabId, { type: V3, ...msg }) as Promise<T>, 15_000, `page ${msg.op}`));
  // the page says when it is loaded and quiet; while its script is not there yet (mid-navigation) ask again
  const settle = async () => {
    for (let i = 0; i < 20; i++) {
      const r = await (chrome.tabs.sendMessage(tabId, { type: PAGE_SETTLE, capMs: 20_000 }) as Promise<{ settled: boolean } | undefined>).catch(() => undefined);
      if (r) return;
      await sleep(500);
    }
  };
  let resumeFile: { name: string; mime: string; data: string } | null = null;
  try {
    if (!(await trusted.attach(tabId))) return await finishRun(item, s, { kind: 'needs-user', why: 'Plato cannot press on this tab (another debugger holds it). Close DevTools on it, then press Try again.' });
    const executor = createExecutor({
      send,
      cdp: (method, params) => timedTab(tabId, `cdp ${method}`, limit(chrome.debugger.sendCommand({ tabId }, method, params), 8000, `CDP ${method}`)),
      navigate: async (url) => {
        if (url === 'back') await chrome.tabs.goBack(tabId);
        else if (url === 'forward') await chrome.tabs.goForward(tabId);
        else if (url === 'reload') await chrome.tabs.reload(tabId);
        else if (!/^https?:\/\//i.test(url)) throw new Error('navigate needs an absolute http(s) URL');
        else await chrome.tabs.update(tabId, { url });
        await tabLoaded(tabId, 30_000);
        await settle();
      },
      settle,
      activate: async () => void (await chrome.tabs.update(tabId, { active: true })),
      resume: async () => {
        if (!item.resume_choice && state.settings?.resumeMode) {
          item.resume_choice = state.settings.resumeMode;
          await api.resumeChoice(item.id, item.resume_choice).catch((e) => jot(item.id, `Resume choice not saved: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160))); // saved BEFORE the file is fetched (race seen 2026-10-23)
        }
        if (!item.resume_choice) return null;
        return (resumeFile ??= await api.file(item.id).catch((e) => {
          jot(item.id, `Resume file: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
          return null;
        }));
      },
      sleep,
      quick: __FLAVOR__ === 'fixtures',
    });
    const next = v3Next.get(item.id);
    v3Next.delete(item.id);
    const answers = v3Answers.get(item.id);
    v3Answers.delete(item.id);
    const first: TurnRequest = next === 'seeker_answer' ? { event: 'seeker_answer', text: (notes.get(item.id)?.at(-1) ?? '').slice(0, 4000), ...(answers?.length && { answers }) } : next === 'solved' ? { event: 'solved' } : auto && s.item.state === 'AWAITING_SUBMIT' ? { event: 'submit' } : { event: 'start' }; // an armed item + "Submit for me": continue the same conversation at Submit, no refill (session_lost falls back to start below)
    if (first.event === 'start') {
      // What is this page? A confirmation already on it ("Application submitted", "Applied 3w ago") ends the job here:
      // no brain turn, no refill, no navigate away. ponytail: the page-state.ts regex is the classifier; the brain's CLOSED covers the rest
      await settle();
      const st = await send<PageState | undefined>({ op: 'state' }).catch(() => undefined);
      if (st?.confirmed) {
        jot(item.id, `The page already shows a confirmation (“${st.confirmed}”): nothing to fill.`);
        return await finishRun(item, s, { kind: 'confirmed', marker: `page:${st.confirmed}` });
      }
    }
    jot(item.id, first.event === 'start' ? 'Engine v3: the AI reads the page and fills it.' : first.event === 'submit' ? 'Engine v3: the seeker allowed Submit; pressing it once.' : `Engine v3: continuing (${first.event}).`);
    const result = await runV3(
      {
        turn: async (req) => {
          try {
            return await timed(item.id, `v3:turn:${req.event}`, api.v3Turn(item.id, req));
          } catch (e) {
            // the backend lost the conversation (restart): start over from the page as it is
            if (e instanceof ApiError && e.status === 409 && /session_lost/.test(e.message) && req.event !== 'start' && !executor.submitPressed()) return api.v3Turn(item.id, { event: 'start' }); // after a press, starting over would navigate off the confirmation: runV3 checks the page instead
            throw e;
          }
        },
        exec: (call, allowed) => executor.exec(call, allowed),
        pageText: () => send<string>({ op: 'page_text' }),
        captcha: async () => !!(await send<{ captcha?: boolean } | undefined>({ op: 'state' }))?.captcha,
        arm: async () => void (s.item.state !== 'AWAITING_SUBMIT' && (await orch.armForSubmit(s))),
        pressed: () => executor.submitPressed(),
        autoSubmit: auto,
        jot: (line) => jot(item.id, line),
        sleep,
      },
      first,
    );
    if (result.kind === 'needs-user' && result.resume) v3Next.set(item.id, result.resume);
    await finishRun(item, s, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log('error', `apply loop (v3): ${msg}`);
    await finishRun(item, s, lostResult(e));
  } finally {
    v3Running.delete(item.id);
    await trusted.detach(tabId); // the yellow "debugging" bar goes away between runs
  }
}

const jobUrlOf = new Map<string, string>();

// ---- resume: jobs this device holds but this panel instance forgot (panel closed / extension reloaded) ----
const RESUMABLE = ['CLAIMED', 'NEEDS_USER', 'REVIEW'];
const resuming = new Set<string>();
const isOrphan = (i: ApiItem) => RESUMABLE.includes(i.state) && !!i.attempt_id && i.mine !== false && !orch.session(i.id); // never take over another browser's job
async function resumeOrphans(): Promise<number> {
  let n = 0;
  for (const item of state.items.filter((i) => isOrphan(i) && !resuming.has(i.id))) {
    const tabId = await recallTab(item.id);
    const alive = tabId !== undefined && (await chrome.tabs.get(tabId).then(() => true, () => false));
    if (!alive) continue; // its tab is gone: the person can release it
    resuming.add(item.id);
    n++;
    void (async () => {
      try {
        const s = await orch.adopt(item, tabId);
        const url = item.job?.apply_url ?? item.job?.url ?? '';
        jobUrlOf.set(item.id, url);
        setStep(item, 'review');
        scheduleDraw();
        if (item.state !== 'REVIEW') {
          const r = await orch.prepare(s, url); // CLAIMED / NEEDS_USER: carry on from the start of the page
          if (r !== 'review') return void afterPrepare(item, s, r);
        }
        await runAi(item);
      } catch {
        delete state.sessions[item.id]; // lost the attempt: the next refresh shows the truth
      } finally {
        resuming.delete(item.id);
        await refresh();
      }
    })();
  }
  return n;
}

// What prepare() decided when the page was not simply ready: the row says so, and the batch records what is final.
function afterPrepare(item: ApiItem, s: Session, r: 'needs-user' | 'failed' | 'skipped') {
  const msg = String((s.item.detail as { message?: string } | null)?.message ?? '');
  if (r === 'skipped') {
    // closed posting / already applied: the server has it as SKIPPED with the true reason
    delete state.sessions[item.id];
    runner.record(item.id, 'skipped', msg || 'Nothing to apply to.');
    toast(`Skipped “${item.job?.title ?? 'job'}”: ${msg || 'nothing to apply to'}`);
  } else if (r === 'needs-user') setStep(item, 'needs-user', String((s.item.detail as { reason?: string } | null)?.reason ?? ''), msg || undefined);
  else {
    delete state.sessions[item.id];
    runner.record(item.id, 'failed', msg || 'The site blocked the application.');
  }
}

// One job of the batch: claim, open its tab (grouped), prepare, run.
async function startItem(item: ApiItem) {
  // The page that holds the form: the posting's own apply link when a supported provider owns it
  // (aggregators like Google Jobs link to the real Greenhouse page there), else the listing.
  const applyUrl = item.job?.apply_url;
  const job = applyUrl && registry.route(applyUrl, policy).status === 'supported' ? applyUrl : item.job?.url;
  if (!job) throw new OrchestratorError('bad_state', 'This item has no job page');
  // Policy, adapter and the server lock come first; only then the person's own tab opens.
  const s = await orch.claim(item);
  runner.markStarted(item.id);
  jobUrlOf.set(item.id, job);
  // A tab already open for this job (the panel was closed and reopened): reuse it, never open a second one.
  const prior = await recallTab(item.id);
  const alive = prior !== undefined && (await chrome.tabs.get(prior).then(() => true, () => false));
  const tabId = alive ? prior : (await chrome.tabs.create({ url: job, active: false })).id;
  s.tabId = tabId;
  if (tabId !== undefined) {
    await rememberTab(item.id, tabId);
    await groupTab(tabId);
  }
  setStep(item, 'preparing');
  const r = await orch.prepare(s, job);
  if (r === 'review') {
    setStep(item, 'review');
    await runAi(item); // every site: the AI fills and drives the page
  } else afterPrepare(item, s, r);
}

// ---- runner: the batch's jobs, up to the speed setting's tabs open at once, all in one "Plato" tab group ----
const GROUP_KEY = 'plato-group';
// Serialised: tabs open concurrently, and without this each one saw "no group yet" and made its own.
let grouping: Promise<void> = Promise.resolve();
const groupTab = (tabId: number) => (grouping = grouping.then(() => groupTabNow(tabId)));
async function groupTabNow(tabId: number) {
  try {
    let gid = (await chrome.storage.session.get(GROUP_KEY))[GROUP_KEY] as number | undefined;
    if (gid !== undefined) await chrome.tabGroups.get(gid).catch(() => (gid = undefined));
    if (gid === undefined) gid = (await chrome.tabGroups.query({ title: 'Plato' }))[0]?.id; // reuse an existing Plato group (e.g. after a panel reload)
    gid = await chrome.tabs.group(gid === undefined ? { tabIds: [tabId] } : { tabIds: [tabId], groupId: gid });
    await chrome.tabGroups.update(gid, { title: 'Plato', color: 'purple' });
    await chrome.storage.session.set({ [GROUP_KEY]: gid });
  } catch {
    /* cosmetic: the job still runs ungrouped */
  }
}

// ponytail: sliding window, not strict rounds: a slot frees as soon as a job leaves the panel's
// sessions, so "N at a time" holds without waiting for the slowest job in a round.
let launching = false;
const tried = new Set<string>(); // a job that failed to start is not retried in a loop
async function runQueue() {
  const run = runner.current();
  if (launching || !run || run.status !== 'running') return;
  const waiting = state.items.filter((i) => run.itemIds.includes(i.id) && i.state === 'PENDING' && !tried.has(i.id) && !state.sessions[i.id] && canStart(i, state, registry));
  if (!waiting.length) return;
  const slots = tabLimit() - Object.keys(state.sessions).length;
  if (slots <= 0) return;
  launching = true;
  try {
    const batch = waiting.slice(0, slots);
    batch.forEach((i) => tried.add(i.id));
    const res = await Promise.allSettled(batch.map(startItem));
    for (const r of res) if (r.status === 'rejected') log('error', `A job could not start: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    const bad = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (bad) toast(bad.reason instanceof OrchestratorError ? bad.reason.message : 'One job could not be started. Nothing was submitted.', 'err');
  } finally {
    launching = false;
  }
  await refresh();
}

// ---- the batch begins here, and only here ----
async function startBatch() {
  const j = state.jobs;
  const jobIds = j.picked.filter((k) => k.startsWith('job:')).map((k) => k.slice(4));
  const itemIds = j.picked.filter((k) => k.startsWith('item:')).map((k) => k.slice(5));
  if (j.picked.length > MAX_BATCH_JOBS) throw new BatchError('cap', `A batch holds at most ${MAX_BATCH_JOBS} jobs.`);
  if (runner.isActive()) throw new BatchError('active', 'A batch is already running. Wait for it to finish.');
  const settings = state.settings ?? (await api.settings().catch(() => null));
  state.settings = settings;
  if (settings && j.resumeMode !== settings.resumeMode) state.settings = await api.saveSettings({ resumeMode: j.resumeMode }).catch(() => settings); // the choice on the sheet is the seeker's preference from now on
  const created = jobIds.length ? await api.createBatch(jobIds, j.searchId) : null;
  const fresh = created?.items ?? [];
  const queued = state.items.filter((i) => itemIds.includes(i.id) && i.state === 'PENDING');
  const all = [...fresh, ...queued];
  if (!all.length) throw new BatchError('empty', created?.rejected.length ? 'None of these jobs can be queued (already queued, applied, or not available).' : 'Pick at least one job.');
  const label = jobIds.length ? (j.searches.find((s) => s.id === j.searchId)?.title ?? 'Picked on Plato') : (queued[0]?.batch?.label ? `“${queued[0].batch.label}” search` : 'Picked on Plato');
  const auto = autoSubmitDefault();
  runner.start(all.map((i) => ({ itemId: i.id, meta: metaOf(i) })), label, auto); // the guard: one batch, up to the cap
  state.autoSubmit = auto;
  await api.consent({ decision: 'allow', jobs: all.length, tabs: Math.min(all.length, tabLimit()), auto_submit: auto }).catch(() => undefined); // the audit log of the go-ahead
  log('info', `Batch started: ${all.length} job(s) (${fresh.length} new, ${queued.length} queued), ${tabLimit()} at a time.`);
  tried.clear();
  j.picked = [];
  state.sheet = false;
  state.view = 'batch';
  finishedToasted = null;
  if (created?.rejected.length) toast(`${created.rejected.length} job${created.rejected.length === 1 ? '' : 's'} skipped: already queued, applied, or not available.`);
  await refresh();
  void runQueue();
}

async function stopBatch() {
  const run = runner.current();
  if (!run || run.status !== 'running') return;
  // still queued on the server and not opened by this panel meanwhile (a job that started since takes the session path below)
  const queued = state.rows.filter((r) => r.status === 'queued' && !orch.session(r.itemId) && state.items.find((i) => i.id === r.itemId)?.state === 'PENDING').map((r) => r.itemId);
  if (queued.length) {
    const r = await api.dropFromQueue(queued);
    log('info', `Stop batch: ${r.dropped} queued job(s) removed.`);
    queued.forEach((id) => runner.record(id, 'cancelled', 'Not started: you stopped the batch.'));
  }
  let failed = 0;
  for (const r of state.rows) {
    const s = orch.session(r.itemId);
    if (!s || s.item.state === 'AWAITING_SUBMIT') continue; // armed: no way back; the person settles it
    if (!(await cancelSession(s, 'Stopped before Submit. Nothing was sent.'))) failed++;
  }
  if (failed) toast(`${failed} job${failed === 1 ? '' : 's'} could not be cancelled on the server; the tab was closed. Refresh to see the truth.`, 'err');
  await refresh();
}
// Cancel one open job: the server records CANCELLED, the tab closes so nothing keeps running on it. A cancel the
// server refuses (the loop moved the item meanwhile) still closes the tab and drops the session; the next refresh
// shows what the server has. Returns whether the server accepted it.
async function cancelSession(s: Session, why: string) {
  const tabId = s.tabId;
  let ok = true;
  try {
    await orch.cancel(s);
  } catch (e) {
    ok = false;
    log('warn', `Cancel refused by the server: ${e instanceof Error ? e.message : String(e)}`);
  }
  delete state.sessions[s.item.id];
  if (ok) runner.record(s.item.id, 'cancelled', why);
  if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => undefined);
  return ok;
}

// ---- jobs view: searches and their jobs ----
async function loadSearches() {
  const j = state.jobs;
  j.searches = await api.searches();
  j.searchId ??= j.searches[0]?.id; // the server orders: searches with jobs added on Plato, then newest
  if (j.searchId) await fetchJobs(false);
}
async function fetchJobs(append: boolean) {
  const j = state.jobs;
  if (!j.searchId) return;
  j.loading = true;
  draw();
  try {
    const r = await api.searchJobs(j.searchId, { q: j.q || undefined, sort: j.sort, remoteType: j.remote ? 'REMOTE' : undefined, fromPlato: j.fromPlato || undefined, skip: append ? j.jobs.length : 0, take: JOBS_PAGE_SIZE });
    j.jobs = append ? [...j.jobs, ...r.items] : r.items;
    j.jobsTotal = r.total;
    for (const x of r.items) j.known[x.id] = x;
  } finally {
    j.loading = false;
  }
}
const togglePick = (key: PickKey) => {
  if (runner.isActive()) return toast('A batch is running. New jobs wait until it finishes.');
  const r = pickToggle(state.jobs.picked, key, MAX_BATCH_JOBS);
  state.jobs.picked = r.picked;
  draw();
  if (r.refused) {
    toast(`Batch is full (${MAX_BATCH_JOBS} of ${MAX_BATCH_JOBS}). Remove one to add another.`, 'err');
    root.querySelector(`[data-key="${key}"]`)?.classList.add('shake');
  }
};

// ---- orchestrator: the chat, on demand ----
const BLOCKER: Record<string, OrchestratorRequest['state']['blocked'][number]['blocker']> = { login: 'login', mfa: 'mfa', captcha: 'captcha', questions: 'questions', submit_failed: 'submit_failed' };
const gather = (withOrphans = false): OrchestratorRequest['state'] => {
  const c = { queued: 0, working: 0, review: 0, submitted: 0, failed: 0, skipped: 0 };
  for (const i of state.items) {
    if (i.state === 'PENDING') c.queued++;
    else if (i.state === 'AWAITING_SUBMIT' || i.state === 'REVIEW') c.review++;
    else if (i.state === 'FAILED') c.failed++;
    else if (i.state === 'SKIPPED') c.skipped++;
    else c.working++;
  }
  for (const r of state.rows) if (r.outcome?.kind === 'submitted') c.submitted++;
  const blocked = state.items.slice(0, 50).flatMap((i) => {
    const sess = state.sessions[i.id];
    if (withOrphans && isOrphan(i) && !resuming.has(i.id)) return [{ id: i.id, title: (i.job?.title ?? 'Job').slice(0, 120), company: (i.job?.company ?? '').slice(0, 120), blocker: 'other' as const, detail: 'Open from before the panel was reloaded: not running here. Use resume_jobs.' }];
    if (sess?.step !== 'needs-user') return [];
    const why = sess.message ?? '';
    // the exact labels of the required fields still empty: the agent must use these verbatim
    const fields = (reviews.get(i.id)?.get().rows ?? []).filter((r) => r.required && r.status !== 'filled' && r.category !== 'already-filled').map((r) => r.label.slice(0, 200)).slice(0, 12);
    return [{ id: i.id, title: (i.job?.title ?? 'Job').slice(0, 120), company: (i.job?.company ?? '').slice(0, 120), blocker: fields.length || why !== 'questions' ? (BLOCKER[why] ?? ('other' as const)) : ('other' as const), detail: (sess.detail ?? why).slice(0, 200), ...(fields.length && { fields }) }];
  }).slice(0, 10);
  const jobs = state.items
    .filter((i) => state.sessions[i.id])
    .slice(0, 10)
    .map((i) => {
      const rows = reviews.get(i.id)?.get().rows ?? [];
      const resumeRows = rows.filter(isResumeField);
      return {
        id: i.id,
        title: (i.job?.title ?? 'Job').slice(0, 120),
        company: (i.job?.company ?? '').slice(0, 120),
        status: String(state.sessions[i.id]?.step ?? i.state).slice(0, 60),
        filled: rows.filter((r) => r.status === 'filled' || (r.hasValue && r.kind !== 'file')).map((r) => r.label.slice(0, 200)).slice(0, 20),
        empty: rows.filter((r) => r.required && r.status !== 'filled' && !r.hasValue && r.category !== 'already-filled').map((r) => r.label.slice(0, 200)).slice(0, 12),
        // the options of each empty choice question: the chat answers with one of them, never asks for them
        choices: rows.filter((r) => r.status !== 'filled' && !r.hasValue && r.options?.length).slice(0, 8).map((r) => ({ label: r.label.slice(0, 200), options: r.options!.slice(0, 15).map((o) => o.label.slice(0, 160)) })),
        resume: resumeRows.length ? (resumeRows.some((r) => r.hasValue) ? ('uploaded' as const) : ('missing' as const)) : ('none' as const),
        journal: (journals.get(i.id) ?? []).slice(-12),
      };
    });
  return { total: state.items.length, maxTabs: tabLimit(), counts: c, blocked, jobs };
};

const applyEvent = async (e: OrchestratorEvent, a: NonNullable<PanelState['assistant']>) => {
  if (e.type === 'ask') a.ask = { jobId: e.jobId, question: e.question, choices: e.choices };
  else if (e.type === 'fill') {
    // The seeker's own answer (or a profile fact) for one empty field: fill it, verify, then continue the job.
    const ctl = reviews.get(e.jobId);
    const pending = ctl?.get().rows.filter((r) => r.status === 'pending' || r.status === 'failed' || r.status === 'stale') ?? [];
    const want = e.field.trim().toLowerCase();
    const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const overlap = (r: { label: string }) => [...words(want)].filter((w) => words(r.label).has(w)).length;
    // exact, then one containing the other, then the closest by shared words; a lone required field is unambiguous
    const required = pending.filter((r) => r.required);
    const row =
      pending.find((r) => r.label.toLowerCase() === want) ??
      pending.find((r) => r.label.toLowerCase().includes(want) || want.includes(r.label.toLowerCase())) ??
      [...pending].sort((x, y) => overlap(y) - overlap(x)).find((r) => overlap(r) >= 2) ??
      (required.length === 1 ? required[0] : undefined);
    const item = state.items.find((i) => i.id === e.jobId);
    if (ctl && row && item) {
      ctl.propose(row.id, e.value, 'seeker');
      // the seeker's answer to this question, kept for every later form: never asked again
      void api.remember([{ question: row.label.slice(0, 300), value: e.value.slice(0, 1000) }]).catch(() => undefined);
      await ctl.fillApproved(ctl.get().version);
      // the seeker's answer is in: the AI carries on from where it stopped
      void runAi(item);
    } else a.messages.push({ role: 'assistant', content: `I could not find the field “${e.field}” on that page.${pending.length ? ` Its fields are: ${pending.map((r) => `“${r.label}”`).slice(0, 8).join(', ')}.` : ''}` });
  } else if (e.type === 'attach_resume' || e.type === 'retry' || e.type === 'submit') {
    // the chat asked for a real action: the worker runs again (the resume goes in first when a field needs it)
    const item = state.items.find((i) => i.id === e.jobId);
    if (!item || !orch.session(item.id)) a.messages.push({ role: 'assistant', content: 'That job is not open in this panel. Start it again from the list.' });
    else {
      const lastUser = [...a.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      note(item.id, lastUser.slice(0, 300));
      if (e.type === 'submit') {
        submitOverride.add(item.id);
        log('info', `Submit requested in chat for “${item.job?.title ?? item.id}”.`);
      }
      if (e.type === 'attach_resume' && !item.resume_choice && state.settings?.resumeMode) {
        item.resume_choice = state.settings.resumeMode;
        void api.resumeChoice(item.id, item.resume_choice).catch(() => undefined);
      }
      setStep(item, 'preparing');
      draw();
      void runAi(item).then(() => refresh());
    }
  } else if (e.type === 'refresh') {
    await refresh();
  } else if (e.type === 'resume') {
    tried.clear(); // an explicit "continue": jobs that failed to start earlier may try again
    const n = await resumeOrphans();
    void runQueue();
    a.messages.push({ role: 'assistant', content: n ? `Resumed: ${n} open job${n === 1 ? '' : 's'} reattached.` : 'Nothing from your batch is waiting to be resumed.' });
  } else if (e.type === 'account') a.messages.push({ role: 'assistant', content: `${e.site}: ${e.reason}` });
  else if (e.type === 'pause') a.messages.push({ role: 'assistant', content: `To pause, press Stop batch on the Batch view. ${e.reason}` });
  else if (e.type === 'skip') {
    // Only the seeker drops a job. The chat may suggest it; it never happens on a loading problem.
    const lastUser = [...a.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const asked = /\b(skip|drop|remove|cancel|forget|don'?t apply|not interested)\b|سيب|تخطى|الغي|إلغاء/i.test(lastUser);
    if (!asked) a.messages.push({ role: 'assistant', content: `I kept this job. ${e.reason} Press Try again on it, or tell me "skip it".` });
    else {
      const item = state.items.find((i) => i.id === e.jobId);
      const s = item && orch.session(item.id);
      if (s) await cancelSession(s, `Skipped: ${e.reason}`);
      delete state.sessions[e.jobId];
      a.messages.push({ role: 'assistant', content: `Skipped: ${e.reason}` });
    }
  }
};

async function consultOrchestrator(message: string | null) {
  const a = (state.assistant ??= { messages: [], thinking: false });
  const st = gather(true); // a chat turn may mention jobs left open by a reload
  if (message) {
    a.messages.push({ role: 'user', content: message });
    a.ask = undefined;
  }
  a.thinking = true;
  draw();
  try {
    const history = a.messages.slice(-10).slice(0, message ? -1 : undefined);
    const r = await api.orchestrate({ message, history, state: st });
    if (r.reply) a.messages.push({ role: 'assistant', content: r.reply });
    for (const e of r.events) await applyEvent(e, a);
  } finally {
    a.thinking = false;
  }
}

// Run the steps again from where the job stopped (after the seeker fixed something on the page, or answered).
async function rerun(item: ApiItem) {
  const s = orch.session(item.id);
  if (!s) return toast('This job is not open in this panel. Release it and start it again.', 'err');
  const url = jobUrlOf.get(item.id) ?? item.job?.url ?? '';
  setStep(item, 'preparing');
  draw();
  // NEEDS_USER may go back through prepare; a job already past it resumes in place
  if (item.state === 'NEEDS_USER' || item.state === 'CLAIMED') {
    const r = await orch.prepare(s, url);
    if (r !== 'review') return void afterPrepare(item, s, r);
  }
  void runAi(item).then(() => refresh()); // the loop runs for minutes: never inside the busy guard, or every button stays disabled
}

const actions: Actions = {
  view: (v) => ((state.view = v), (state.menuOpen = false), (state.jobs.pickerOpen = false), draw()),
  menu: (open) => ((state.menuOpen = open), draw()),
  toggleLog: () => ((state.showLog = !state.showLog), draw()),
  chat: (open) => ((state.chatOpen = open), draw()),
  answer: (text) =>
    void guard(async () => {
      const asked = state.assistant?.ask?.jobId ?? null;
      if (asked) note(asked, text.trim().slice(0, 300)); // the answer belongs to that job's next decision
      await consultOrchestrator(text);
      // the chat answered without acting: a job that was waiting on this answer runs again by itself
      const item = asked ? state.items.find((i) => i.id === asked) : undefined;
      if (item && state.sessions[item.id]?.step === 'needs-user' && orch.session(item.id)) {
        setStep(item, 'preparing');
        void runAi(item).then(() => refresh());
      }
    }),
  jobs: {
    pickSearch: (id) =>
      void guard(async () => {
        const j = state.jobs;
        j.pickerOpen = false;
        if (id === j.searchId) return;
        Object.assign(j, { searchId: id, q: '', remote: false, fromPlato: false, sort: 'best', jobs: [], jobsTotal: 0 });
        await fetchJobs(false);
      }),
    picker: (open) => ((state.jobs.pickerOpen = open), draw()),
    filter: (patch) => void guard(async () => (Object.assign(state.jobs, patch), fetchJobs(false))),
    more: () => void guard(() => fetchJobs(true)),
    toggle: togglePick,
    site: (site) => ((state.jobs.site = site), draw()), // client-side only: nothing is fetched
    selectVisible: () => {
      if (runner.isActive()) return toast('A batch is running. New jobs wait until it finishes.');
      const j = state.jobs;
      const room = MAX_BATCH_JOBS - j.picked.length;
      const add = visibleJobs(j).filter((x) => x.applyable && !x.queued && !j.picked.includes(`job:${x.id}`)).map((x) => `job:${x.id}` as PickKey); // what the site chip shows, not the whole page
      j.picked = [...j.picked, ...add.slice(0, room)];
      draw();
      if (add.length > room) toast(`Added ${Math.max(0, room)}. The batch is full at ${MAX_BATCH_JOBS}; ${add.length - room} not added.`);
    },
    dropItem: (id) =>
      void guard(async () => {
        const r = await api.dropFromQueue([id]);
        state.jobs.picked = state.jobs.picked.filter((k) => k !== `item:${id}`);
        log('info', `Removed ${r.dropped} waiting job(s) from the queue.`);
        await refresh();
      }),
    sheet: (open) => void guard(async () => void ((state.sheet = open), open && !state.settings && (state.settings = await api.settings().catch(() => null)))),
    resumeMode: (mode) => ((state.jobs.resumeMode = mode), draw()),
    start: () => void guard(startBatch),
  },
  batch: {
    stop: (what) => {
      if (what === 'yes') {
        state.stopArmed = false;
        return void guard(stopBatch);
      }
      state.stopArmed = what === 'ask';
      draw();
    },
    cancelJob: (item) =>
      void guard(async () => {
        const s = orch.session(item.id);
        if (s) await cancelSession(s, 'Cancelled before Submit. Nothing was sent.');
        else if (item.state === 'PENDING') {
          await api.dropFromQueue([item.id]);
          runner.record(item.id, 'cancelled', 'Removed from this batch.');
        }
        await refresh();
      }),
    release: (item) =>
      void guard(async () => {
        await orch.release(item);
        runner.record(item.id, 'cancelled', 'Released. Nothing was sent.');
        await refresh();
      }),
    resume: () =>
      void guard(async () => {
        tried.clear();
        const n = await resumeOrphans();
        if (!n) toast('Nothing could be reattached: those tabs are gone. Release them instead.');
        void runQueue();
      }),
    answerJob: (item, text, answers) =>
      void guard(async () => {
        note(item.id, text.slice(0, 4000));
        if (answers?.length) {
          v3Answers.set(item.id, answers);
          void api.remember(answers.map((x) => ({ question: x.label.slice(0, 300), value: x.value.slice(0, 1000) }))).catch(() => undefined); // kept for later forms: never asked again
        }
        jot(item.id, `The seeker answered: ${text.replace(/\n/g, '; ').slice(0, 160)}`);
        await rerun(item);
      }),
    retry: (item) => void guard(() => rerun(item)),
    // "Submit for me": the seeker's explicit go-ahead for this job; the loop presses Submit and confirms from the page.
    submitNow: (item) =>
      void guard(async () => {
        if (!orch.session(item.id)) return void toast('This job is not open in this panel. Release it and start it again.', 'err');
        submitOverride.add(item.id);
        log('info', `Submit for me pressed for “${item.job?.title ?? item.id}”.`);
        setStep(item, 'preparing');
        void runAi(item).then(() => refresh());
      }),
    checkPage: (item) =>
      void guard(async () => {
        const s = orch.session(item.id);
        const ev = s ? await orch.observe(s) : await probeFor(item);
        if (ev.kind === 'confirmed') {
          runner.record(item.id, 'submitted', `The page confirmed it: “${ev.marker}”.`);
          delete state.sessions[item.id];
        }
        toast(ev.kind === 'confirmed' ? 'The page shows a confirmation. Recorded.' : 'The page does not clearly show a confirmation yet.');
        await refresh();
      }),
    attest: (item) =>
      void guard(async () => {
        const s = orch.session(item.id);
        if (s) await orch.attest(s);
        else await orch.settle(item, 'submitted');
        delete state.sessions[item.id];
        reviews.delete(item.id);
        delete state.formReviews![item.id];
        runner.record(item.id, 'submitted', 'You confirmed it was sent.');
        await refresh();
      }),
    notSure: (item) =>
      void guard(async () => {
        await orch.notSure(sessionOf(item));
        await refresh();
      }),
    notSubmitted: (item) =>
      void guard(async () => {
        await orch.settle(item, 'not-submitted');
        runner.record(item.id, 'failed', 'You said it was not sent. Plato will not try again by itself.');
        await refresh();
      }),
    // The resume for this application, asked once: kept on the server, then the run carries on.
    resumeChoice: (item, choice) =>
      void guard(async () => {
        await api.resumeChoice(item.id, choice);
        item.resume_choice = choice;
        const it = state.items.find((i) => i.id === item.id);
        if (it) it.resume_choice = choice;
        if (!orch.session(item.id)) return void toast('This job is not open in this panel. Release it and start it again.', 'err');
        setStep(item, 'preparing');
        void runAi(item).then(() => refresh());
      }),
    watch: (item) =>
      void (async () => {
        const tabId = orch.session(item.id)?.tabId ?? (await recallTab(item.id));
        if (tabId === undefined) return toast('That tab is gone.');
        await chrome.tabs.update(tabId, { active: true }).catch(() => toast('That tab is gone.'));
      })(),
    ticket: (item) => {
      const sess = state.sessions[item.id];
      const what = item.state === 'VERIFY' ? 'Plato could not confirm whether this was submitted' : sess?.detail ? `it stopped with: ${sess.detail}` : sess?.message === 'submit_failed' ? 'Plato could not press Submit' : `it is blocked (${sess?.message ?? 'needs me'})`;
      state.chatOpen = true;
      void guard(() => consultOrchestrator(`I opened the ticket for "${item.job?.title ?? 'this job'}" at ${item.job?.company ?? ''}: ${what}. Look at the fields listed for this job and my profile. If you can write the answer from my facts, do it and put it in the form; if a fact is truly missing, ask me for that one thing. Be brief.`));
    },
    newBatch: () => {
      runner.clear();
      state.run = null;
      state.rows = [];
      state.jobs.picked = [];
      state.view = 'jobs';
      draw();
    },
    // The failed jobs of the finished batch, as a new selection: the server lets a FAILED job be tried again.
    retryFailed: () => {
      const run = runner.current();
      if (!run) return;
      const failed = state.rows.filter((r) => r.status === 'failed');
      for (const r of failed) state.jobs.known[r.meta.jobId] ??= { id: r.meta.jobId, title: r.meta.title, company: r.meta.company, location: null, source: r.meta.provider ?? '', match: null, applyable: true } satisfies SearchJob;
      runner.clear();
      state.run = null;
      state.rows = [];
      state.jobs.picked = failed.map((r) => `job:${r.meta.jobId}` as PickKey).slice(0, MAX_BATCH_JOBS);
      state.view = 'jobs';
      state.sheet = state.jobs.picked.length > 0;
      draw();
    },
  },
  pair: (code, label) =>
    void guard(async () => {
      // A refused code is not an expired link: show the server's reason, keep the form.
      const r = await api
        .exchange(code.trim(), label.trim().slice(0, 60), chrome.runtime.getManifest().version)
        .catch((e: unknown) => {
          throw new OrchestratorError('bad_state', e instanceof ApiError && e.status !== 0 ? e.message : 'Cannot reach Plato. Try again.');
        });
      await tokens.set(r.token);
      state.status = 'loading';
      preselected = false;
      await refresh();
      await loadSearches().catch(fail);
      toast('Linked. Jobs you added on Plato are ticked for your first batch.', 'ok');
    }),
  unlink: () =>
    void guard(async () => {
      log('info', 'Unlink pressed: stopping, revoking this browser, clearing the token.');
      orch.stopAll();
      await api.unpair().catch(() => undefined); // best effort; the device list on the web can also remove it
      await tokens.clear();
      state.status = 'unpaired';
      state.items = [];
      state.sessions = {};
    }),
  refresh: () => void refresh(),
};

// The person pressed Stop on the page overlay: cancel that job's session.
chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
  if (sender.id !== chrome.runtime.id || (msg as { type?: string } | null)?.type !== 'plato:stop' || sender.tab?.id === undefined) return;
  const item = state.items.find((i) => orch.session(i.id)?.tabId === sender.tab!.id);
  if (item) void actions.batch.cancelJob(item);
});

// Only one panel instance may run the batch (two would double-open tabs and double-ask the AI).
const PANEL_ID = Math.random().toString(36).slice(2);
async function holdsPanelLock(): Promise<boolean> {
  try {
    const cur = (await chrome.storage.session.get('panelLock')).panelLock as { id: string; ts: number } | undefined;
    if (cur && cur.id !== PANEL_ID && Date.now() - cur.ts < 8000) return false;
    await chrome.storage.session.set({ panelLock: { id: PANEL_ID, ts: Date.now() } });
    return true;
  } catch {
    return true; // no session storage: single panel assumed
  }
}

// A reload or a closed panel hands the lock over at once instead of after the 8 s lease.
window.addEventListener('pagehide', () => void chrome.storage.session.remove('panelLock').catch(() => undefined));

async function boot() {
  draw();
  // the previous panel's release (pagehide) may still be landing: look twice before refusing
  if (!(await holdsPanelLock()) && !(await sleep(700), await holdsPanelLock())) {
    state.status = 'ready';
    state.error = 'Plato is already open in another panel. Use that one.';
    return draw();
  }
  setInterval(() => void holdsPanelLock(), 3000); // keep the lock while this panel is open
  const run = await runner.restore();
  state.run = run;
  state.autoSubmit = run?.autoSubmit ?? false;
  if (run?.status === 'finished') finishedToasted = run.id;
  if (run?.status === 'running') state.view = 'batch';
  try {
    await tokens.ensureTrusted(); // before ANY read of the token
  } catch {
    state.status = 'ready';
    state.error = 'This browser cannot protect the Plato link. Update Chrome.';
    return draw();
  }
  if (!(await tokens.get())) {
    state.status = 'unpaired';
    return draw();
  }
  await refresh();
  if (state.status === 'ready') loadSearches().then(draw, (e) => (log('warn', `searches: ${e instanceof Error ? e.message : String(e)}`), draw()));
  setInterval(() => document.visibilityState === 'visible' && void refresh(), 15_000);
  setInterval(() => runner.isActive() && state.view === 'batch' && ((state.eta = runner.eta(state.rows, tabLimit())), scheduleDraw()), 5_000); // the estimate counts down between refreshes
  // jobs queued from the website show up as soon as the seeker comes back to the panel
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refresh());
}
void boot();
