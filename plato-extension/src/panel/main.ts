import { ApiError, createApi } from '../core/api';
import { createOrchestrator, OrchestratorError, type Session } from '../core/orchestrator';
import { createOutbox } from '../core/outbox';
import { blockingError, type FormReview } from '../core/form-review';
import { NEEDS_YOU, V3 } from '../core/messages';
import type { V3Op } from '../content/v3-reader';
import { createExecutor } from '../v3/executor';
import { runV3 } from '../v3/run';
import type { TurnRequest } from '../v3/contract';
import { runAiApply, type EaResult } from './ai-apply';
import { createTrusted } from './trusted';
import type { Snapshot } from '../dom/snapshot';
import { hash } from '../dom/inspect';
import { FORM_FILE, FORM_OPTIONS, PAGE_SETTLE, PAGE_STATE, SNAP_PRESS, SNAP_TAKE } from '../core/messages';
import { latestBatch } from './view';
import { startFormReview } from './form-review-hook';
import { createTokenStore } from '../core/token-store';
import type { ApiItem, Decision, Evidence, PolicyMap } from '../core/types';
import { registry } from '../providers';
import { render, type Actions, type PanelState } from './view';
import type { AnswerQuestion, OrchestratorEvent, OrchestratorRequest } from './../core/types';
import { JOBS_PAGE_SIZE, MAX_JOBS, MAX_TABS, SEARCH_PAGE_SIZE, type Wizard, type WizardAction } from './wizard';

// The side panel runs the whole flow. It is the only place (besides the
// service worker's one-line storage restriction) that ever sees the token.
const tokens = createTokenStore(chrome.storage.local as never);
const api = createApi({ base: __API_ORIGIN__, getToken: () => tokens.get() });
const outbox = createOutbox(chrome.storage.local);
let policy: PolicyMap | undefined;
const root = document.getElementById('root')!;
const state: PanelState = { status: 'loading', items: [], sessions: {}, cards: {}, formReviews: {}, pendingOutbox: 0, assistant: { messages: [], thinking: false } };
const reviews = new Map<string, FormReview>();

const orch = createOrchestrator({
  api,
  outbox,
  registry,
  policy: () => policy,
  onLost: (id) => {
    delete state.sessions[id];
    const t = state.items.find((i) => i.id === id)?.job?.title ?? 'a job';
    state.notice = `Plato lost its hold on “${t}” (the server took it back). It returns to the queue.`;
    log('warn', `Lost hold on “${t}”: the server no longer has this browser as its owner.`);
    void refresh();
  },
});

// tab ids survive a panel reload for the browser session only
const tabKey = (id: string) => `tab:${id}`;
const rememberTab = (id: string, tabId: number) => chrome.storage.session.set({ [tabKey(id)]: tabId });
const recallTab = async (id: string) => ((await chrome.storage.session.get(tabKey(id)))[tabKey(id)] as number | undefined);

const draw = () => render(document, root, state, actions, registry);
let errorAt = 0;
// The activity log (⋮ → Activity log): what happened and why, so nothing changes silently.
const log = (level: 'info' | 'warn' | 'error', text: string) => {
  state.log = [...(state.log ?? []), { at: new Date().toLocaleTimeString(), level, text: text.slice(0, 240) }].slice(-60);
};
const fail = (e: unknown) => {
  errorAt = Date.now();
  log('error', e instanceof ApiError ? `${e.status || 'network'}: ${e.message}` : e instanceof Error ? e.message : String(e));
  if (e instanceof ApiError && e.status === 401) {
    void tokens.clear();
    state.status = 'unpaired';
    state.error = 'This browser is no longer linked. Link it again.';
  } else state.error = e instanceof OrchestratorError || e instanceof ApiError ? e.message : 'Something went wrong. Nothing was submitted.';
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
    // reconcile may have recorded evidence or VERIFY: reload what the server now says
    state.items = decided.some((d) => d.plan.action === 'confirm' || d.plan.action === 'to-verify') ? await api.batches() : items;
    state.pendingOutbox = (await outbox.list()).length;
    // the Ready card: run settings and the match range of what is waiting (best effort, never blocks the queue)
    if (state.items.some((i) => i.state === 'PENDING')) {
      const [st, q] = await Promise.all([api.settings().catch(() => state.settings ?? null), api.queue().catch(() => [])]);
      state.settings = st;
      const ms = q.map((x) => x.match).filter((x) => x > 0);
      state.matchRange = ms.length ? `${Math.min(...ms)}%–${Math.max(...ms)}%` : null;
    }
    state.status = 'ready';
    if (Date.now() - errorAt > 12_000) state.error = undefined; // a fresh failure stays on screen long enough to read
    if (state.running) setTimeout(() => void runQueue(), 0);
    watchBlocked();
    if (!state.wizard) void resumeOrphans(); // a reloaded panel picks its open jobs back up by itself
    if (!Object.values(state.sessions).some((x) => x.message === 'submit_failed')) void chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return fail(e);
    state.status = state.status === 'loading' ? 'ready' : state.status;
    state.error = 'Cannot reach Plato right now. Showing the last known state; nothing was submitted.';
  }
  draw();
}

const sessionOf = (item: ApiItem) => orch.session(item.id) as Session;
const setStep = (item: ApiItem, step: 'preparing' | 'review' | 'armed' | 'needs-user', message?: string, detail?: string) => {
  state.sessions[item.id] = { step, message, detail };
  if (step === 'needs-user') {
    // the seeker is looking at the tab: say what is needed right there (amber overlay) and on the icon
    const tabId = orch.session(item.id)?.tabId;
    if (tabId !== undefined) void chrome.tabs.sendMessage(tabId, { type: NEEDS_YOU, text: 'Plato needs you here' }).catch(() => undefined);
    void chrome.action.setBadgeText({ text: '!' });
    void chrome.action.setBadgeBackgroundColor({ color: '#d97706' });
  }
  return state.sessions[item.id];
};

const review = (item: ApiItem, fn: (c: FormReview) => Promise<unknown> | unknown) =>
  void guard(async () => {
    const c = reviews.get(item.id);
    if (!c) return;
    await fn(c);
    state.formReviews![item.id] = c.get();
  });

// ---- first-run / new-batch wizard: pick a search, pick jobs, allow tabs ----
const blankWizard = (step: Wizard['step']): Wizard => ({ step, searches: [], searchPage: 0, jobs: [], jobsTotal: 0, sources: [], filters: {}, picked: [], jobsPage: 0, declining: false, declineReason: '', autoSubmit: true, resumeMode: state.settings?.resumeMode ?? 'profile' }); // Plato presses Submit unless the seeker turns it off here

async function openWizard(step: Wizard['step']) {
  const w = blankWizard(step);
  state.wizard = w;
  if (step === 'search') {
    w.searches = await api.searches();
    w.searchId = w.searches[0]?.id; // the server orders: searches with jobs added on Plato, then newest
  }
  draw();
}

// One page of this search's jobs, filtered and sorted by the server (same rules as the web's Jobs page).
async function fetchJobs(w: Wizard) {
  const r = await api.searchJobs(w.searchId!, { ...w.filters, skip: w.jobsPage * JOBS_PAGE_SIZE, take: JOBS_PAGE_SIZE });
  w.jobs = r.items;
  w.jobsTotal = r.total;
  return r;
}

async function loadJobs(w: Wizard) {
  w.filters = {};
  w.jobsPage = 0;
  const r = await fetchJobs(w);
  w.sources = r.sources ?? [];
  // pre-tick only what the seeker queued from the web; never everything
  w.picked = (r.queued ?? []).slice(0, MAX_JOBS);
}

function wizardResume() {
  const ids = state.items.filter((i) => i.state === 'PENDING' && i.provider && registry.policyOf(i.provider, policy) === 'FILL_ONLY').map((i) => i.job_id).slice(0, MAX_JOBS);
  state.wizard = { ...blankWizard('consent'), picked: ids, existing: true };
}

async function wizardStep(a: WizardAction) {
  if (a.type === 'resume') return wizardResume();
  const w = state.wizard;
  if (!w) return a.type === 'continue' ? openWizard('search') : undefined;
  switch (a.type) {
    case 'skip':
      state.wizard = undefined;
      return;
    case 'continue':
      if (w.step === 'welcome') return openWizard('search');
      if (w.step === 'search' && w.searchId) {
        await loadJobs(w);
        w.step = 'jobs';
      } else if (w.step === 'jobs' && w.picked.length) w.step = 'consent';
      return;
    case 'back':
      w.declining = false;
      w.step = w.step === 'consent' ? 'jobs' : 'search';
      return;
    case 'page':
      w.searchPage = Math.max(0, Math.min(a.page, Math.ceil(w.searches.length / SEARCH_PAGE_SIZE) - 1));
      return;
    case 'jobs-page':
      w.jobsPage = Math.max(0, Math.min(a.page, Math.ceil(w.jobsTotal / JOBS_PAGE_SIZE) - 1));
      await fetchJobs(w);
      return;
    case 'filter':
      w.filters = { ...w.filters, ...a.patch };
      w.jobsPage = 0;
      await fetchJobs(w);
      return;
    case 'pick-matching': {
      // every job matching the current filters (up to the cap), not just this page
      const all = await api.searchJobs(w.searchId!, { ...w.filters, skip: 0, take: MAX_JOBS });
      w.picked = [...new Set([...w.picked, ...all.items.filter((j) => j.applyable).map((j) => j.id)])].slice(0, MAX_JOBS);
      return;
    }
    case 'pick-search':
      w.searchId = a.id;
      return;
    case 'toggle-job':
      w.picked = w.picked.includes(a.id) ? w.picked.filter((x) => x !== a.id) : [...w.picked, a.id].slice(0, MAX_JOBS);
      return;
    case 'pick-none':
      w.picked = [];
      return;
    case 'declining':
      w.declining = a.on;
      return;
    case 'auto-submit':
      w.autoSubmit = a.on;
      return;
    case 'resume-mode':
      w.resumeMode = a.mode;
      return;
    case 'decline': {
      const reason = a.reason.trim();
      if (reason.length < 3) throw new OrchestratorError('bad_state', 'Please tell us why, in a few words.');
      await api.consent({ decision: 'decline', reason, jobs: w.picked.length, tabs: Math.min(w.picked.length, MAX_TABS) });
      state.wizard = undefined;
      state.notice = 'Declined. Nothing was opened or queued.';
      return;
    }
    case 'allow': {
      const tabs = Math.min(w.picked.length, MAX_TABS);
      await api.consent({ decision: 'allow', jobs: w.picked.length, tabs, auto_submit: true });
      state.autoSubmit = w.autoSubmit;
      // the choices on this step are the seeker's preferences from now on
      if (w.resumeMode !== state.settings?.resumeMode) state.settings = await api.saveSettings({ resumeMode: w.resumeMode }).catch(() => state.settings ?? null);
      const r = w.existing ? undefined : await api.createBatch(w.picked, w.searchId);
      state.wizard = undefined;
      // the runner starts ONLY this run's jobs (not older queued ones), MAX_TABS at a time
      state.runIds = [...new Set([...(state.runIds ?? []), ...(r?.items.map((i) => i.id) ?? []), ...state.items.filter((i) => i.state === 'PENDING' && w.picked.includes(i.job_id)).map((i) => i.id)])]; // new items plus ones already queued for these jobs
      state.running = state.runIds.length > 0;
      void chrome.storage.session.set({ run: { running: state.running, autoSubmit: state.autoSubmit, runIds: state.runIds } }); // survives a panel reload
      state.notice = r ? `${r.items.length} job(s) queued${r.rejected.length ? `, ${r.rejected.length} skipped (already queued or not available)` : ''}.` : 'Applying started.';
      await refresh();
      void runQueue();
      return;
    }
  }
}

// The seeker's speed setting decides how many jobs are open at once (careful 2, smart 4, fast 8).
const tabLimit = () => Math.min(state.settings?.tabs ?? MAX_TABS, MAX_TABS);

// ---- runner: up to MAX_TABS jobs open at once, all in one "Plato" tab group ----
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

// What a finished run means for the job, the same for every site.
async function finishRun(item: ApiItem, s: Session, result: EaResult) {
  jot(item.id, result.kind === 'needs-user' ? `Stopped for the seeker: ${result.why}` : result.kind === 'confirmed' ? `Submitted: the page confirms (${result.marker}).` : result.kind === 'ready' ? 'Complete: waiting for the seeker to press Submit.' : result.kind === 'skip' ? `Skipped: ${result.why}` : 'Submit pressed, no confirmation on the page.');
  if (result.kind === 'confirmed') {
    const ev = await orch.observe(s); // records the confirmation when the page's own marker shows it
    if (ev.kind !== 'confirmed' && orch.session(item.id)) await orch.confirm(s, result.marker); // else the proof the engine quoted from the page
    delete state.sessions[item.id];
    reviews.delete(item.id);
    delete state.formReviews![item.id];
  } else if (result.kind === 'ready') setStep(item, 'armed');
  else if (result.kind === 'skip') {
    await orch.skip(s, result.reason, result.why); // SKIPPED with the true reason, not "needs you"
    delete state.sessions[item.id];
    state.notice = `Skipped “${item.job?.title ?? 'job'}”: ${result.why}`;
  } else if (result.kind === 'unconfirmed') await orch.notSure(s, 'easy_apply_unconfirmed'); // pressed once; never again
  else {
    setStep(item, 'needs-user', result.why.includes(RESUME_ASK) ? 'resume' : 'questions', result.why);
    if (!result.why.includes(RESUME_ASK)) {
      // the question is asked in the chat right away; the seeker's answer goes back to this job, which then continues
      const a = (state.assistant ??= { messages: [], thinking: false });
      const q = `${item.job?.title ?? 'This job'}${item.job?.company ? ` at ${item.job.company}` : ''}: ${result.why}`;
      if (a.messages.at(-1)?.content !== q) a.messages.push({ role: 'assistant', content: q });
      a.ask = { jobId: item.id, question: '', choices: [] };
    }
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
// Kept in session storage so a reloaded panel still has it.
const journals = new Map<string, string[]>();
const runStart = new Map<string, number>(); // when each job's run started: journal lines carry +seconds
const jot = (itemId: string, line: string) => {
  const t0 = runStart.get(itemId) ?? (runStart.set(itemId, Date.now()), Date.now());
  const at = `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const j = [...(journals.get(itemId) ?? []), `${at} ${line.replace(/\s+/g, ' ').trim()}`.slice(0, 300)].slice(-60);
  journals.set(itemId, j);
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
// What the seeker said about a job in the chat ("apply anyway", a salary): sent with its next decision, never asked again.
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
  const auto = __FLAVOR__ === 'fixtures' ? submitOverride.has(item.id) || !!state.autoSubmit : true;
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
      draw();
    };
    const result = await runAiApply({
      settle: async () => !!(await timed(item.id, 'settle', send<{ settled: boolean } | undefined>({ type: PAGE_SETTLE }).catch(() => undefined)))?.settled,
      look: async () => {
        const sn = await timed(item.id, 'look:snapshot', snap());
        alerts = sn.alerts;
        const e = await timed(item.id, 'look:observe', orch.observe(s).catch(() => ({ kind: 'unknown' }) as Evidence)); // records SUBMITTED_CONFIRMED itself
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
  const auto = __FLAVOR__ === 'fixtures' ? submitOverride.has(item.id) || !!state.autoSubmit : true; // see runAi
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
    const first: TurnRequest = next === 'seeker_answer' ? { event: 'seeker_answer', text: (notes.get(item.id)?.at(-1) ?? '').slice(0, 2000) } : next === 'solved' ? { event: 'solved' } : { event: 'start' };
    jot(item.id, first.event === 'start' ? 'Engine v3: the AI reads the page and fills it.' : `Engine v3: continuing (${first.event}).`);
    const result = await runV3(
      {
        turn: async (req) => {
          try {
            return await timed(item.id, `v3:turn:${req.event}`, api.v3Turn(item.id, req));
          } catch (e) {
            // the backend lost the conversation (restart): start over from the page as it is
            if (e instanceof ApiError && e.status === 409 && /session_lost/.test(e.message) && req.event !== 'start') return api.v3Turn(item.id, { event: 'start' });
            throw e;
          }
        },
        exec: (call, allowed) => executor.exec(call, allowed),
        pageText: () => send<string>({ op: 'page_text' }),
        captcha: async () => !!(await send<{ captcha?: boolean } | undefined>({ op: 'state' }))?.captcha,
        arm: async () => void (s.item.state !== 'AWAITING_SUBMIT' && (await orch.armForSubmit(s))),
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
    await finishRun(item, s, { kind: 'needs-user', why: `Plato lost the page (${msg.slice(0, 120)}). Open the tab and try again.` });
  } finally {
    v3Running.delete(item.id);
    await trusted.detach(tabId); // the yellow "debugging" bar goes away between runs
  }
}

// The seeker opted in and the server allows this provider: press Submit, then watch the page.
// Retry ONLY while the form is still on screen (the click did nothing). If the page changed
// without proof, that is VERIFY, never a second submit. After 3 tries the seeker is alerted.
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
        draw();
        if (item.state !== 'REVIEW') {
          const r = await orch.prepare(s, url); // CLAIMED / NEEDS_USER: carry on from the start of the page
          if (r !== 'review') return void (r === 'needs-user' ? setStep(item, 'needs-user', String((s.item.detail as { reason?: string } | null)?.reason ?? ''), (s.item.detail as { message?: string } | null)?.message) : delete state.sessions[item.id]);
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

// One job: claim, open its tab (grouped), prepare. Shared by the Start button and the runner.
async function startItem(item: ApiItem) {
  // The page that holds the form: the posting's own apply link when a supported provider owns it
  // (aggregators like Google Jobs link to the real Greenhouse page there), else the listing.
  const applyUrl = item.job?.apply_url;
  const job = applyUrl && registry.route(applyUrl, policy).status === 'supported' ? applyUrl : item.job?.url;
  if (!job) throw new OrchestratorError('bad_state', 'This item has no job page');
  // Policy, adapter and the server lock come first; only then the person's own tab opens.
  const s = await orch.claim(item);
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
  } else if (r === 'skipped') {
    // closed posting / already applied: the server has it as SKIPPED with the true reason
    delete state.sessions[item.id];
    state.notice = `Skipped “${item.job?.title ?? 'job'}”: ${String((s.item.detail as { message?: string } | null)?.message ?? 'nothing to apply to')}`;
  } else if (r === 'needs-user') setStep(item, 'needs-user', String((s.item.detail as { reason?: string } | null)?.reason ?? ''), (s.item.detail as { message?: string } | null)?.message);
  else delete state.sessions[item.id];
}

// ponytail: sliding window, not strict rounds: a slot frees as soon as a job leaves the panel's
// sessions, so "10 at a time" holds without waiting for the slowest job in a round.
let launching = false;
const tried = new Set<string>(); // a job that failed to start is not retried in a loop
async function runQueue() {
  if (launching || !state.running) return;
  const waiting = state.items.filter((i) => state.runIds?.includes(i.id) && i.state === 'PENDING' && !tried.has(i.id) && !state.sessions[i.id] && i.provider && registry.policyOf(i.provider, policy) === 'FILL_ONLY' && registry.get(i.provider)?.adapter);
  if (!waiting.length) {
    if (!Object.keys(state.sessions).length) {
      state.running = false;
      void chrome.storage.session.set({ run: { running: false, autoSubmit: state.autoSubmit, runIds: state.runIds ?? [] } }); // the run's job ids stay: a lease sweep after a reload puts them back in the queue and "continue" must find them
    }
    return;
  }
  const slots = tabLimit() - Object.keys(state.sessions).length;
  if (slots <= 0) return;
  launching = true;
  try {
    const batch = waiting.slice(0, slots);
    batch.forEach((i) => tried.add(i.id));
    const res = await Promise.allSettled(batch.map(startItem));
    const bad = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    for (const r of res) if (r.status === 'rejected') log('error', `A job could not start: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    if (bad) state.notice = bad.reason instanceof OrchestratorError ? bad.reason.message : 'One job could not be started. Nothing was submitted.';
  } finally {
    launching = false;
  }
  await refresh();
}

// ---- orchestrator: talks to the seeker when a job is blocked ----
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
    const mine = state.items.filter((i) => state.runIds?.includes(i.id) && i.state === 'PENDING').length; // this run's jobs the server put back in the queue
    state.running = n + mine > 0;
    void chrome.storage.session.set({ run: { running: state.running, autoSubmit: state.autoSubmit, runIds: state.runIds ?? [] } });
    void runQueue();
    const other = state.items.filter((i) => i.state === 'PENDING' && !state.runIds?.includes(i.id)).length;
    a.messages.push({ role: 'assistant', content: n + mine ? `Resumed: ${n} open job${n === 1 ? '' : 's'} reattached, ${mine} restarted from the queue.` : `Nothing from your current run is waiting.${other ? ` The ${other} jobs in Waiting are older ones: press Start applying to run them.` : ''}` });
  } else if (e.type === 'account') a.messages.push({ role: 'assistant', content: `${e.site}: ${e.reason}` });
  else if (e.type === 'pause') {
    state.running = false;
    a.messages.push({ role: 'assistant', content: `Paused: ${e.reason}` });
  } else if (e.type === 'skip') {
    // Only the seeker drops a job. The chat may suggest it; it never happens on a loading problem.
    const lastUser = [...a.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const asked = /\b(skip|drop|remove|cancel|forget|don'?t apply|not interested)\b|سيب|تخطى|الغي|إلغاء/i.test(lastUser);
    if (!asked) a.messages.push({ role: 'assistant', content: `I kept this job. ${e.reason} Press Try again on it, or tell me "skip it".` });
    else {
      const item = state.items.find((i) => i.id === e.jobId);
      const s = item && orch.session(item.id);
      if (s) await orch.cancel(s);
      delete state.sessions[e.jobId];
      a.messages.push({ role: 'assistant', content: `Skipped: ${e.reason}` });
    }
  }
};

let lastBlocked = '';
async function consultOrchestrator(message: string | null) {
  const a = (state.assistant ??= { messages: [], thinking: false });
  const st = gather(true); // a chat turn may mention jobs left open by a reload; the automatic watcher does not
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

// Ask the orchestrator once per change in what is blocked, never in a loop.
function watchBlocked() {
  const sig = gather().blocked.map((b) => `${b.id}:${b.blocker}`).join(',');
  if (!sig || sig === lastBlocked || state.assistant?.thinking) return void (sig || (lastBlocked = ''));
  lastBlocked = sig;
  void consultOrchestrator(null).then(draw, () => {
    if (state.assistant) state.assistant.thinking = false;
    draw();
  });
}

// "Start applying to all N jobs": everything waiting that Plato can fill, with the saved settings.
async function startAll() {
  const ids = latestBatch(state.items, (i) => !!i.provider && registry.policyOf(i.provider, policy) === 'FILL_ONLY' && !!registry.get(i.provider)?.adapter).map((i) => i.id);
  if (!ids.length) return;
  const st = state.settings ?? (await api.settings());
  state.settings = st;
  await api.consent({ decision: 'allow', jobs: Math.min(ids.length, 50), tabs: Math.min(st.tabs, MAX_TABS), auto_submit: st.autoSubmit }); // the audit log of the go-ahead
  state.autoSubmit = st.autoSubmit;
  state.runIds = [...new Set([...(state.runIds ?? []), ...ids])];
  state.running = true;
  tried.clear();
  void chrome.storage.session.set({ run: { running: true, autoSubmit: state.autoSubmit, runIds: state.runIds } });
  state.runNote = `Applying to ${ids.length} job${ids.length === 1 ? '' : 's'}, ${Math.min(st.tabs, MAX_TABS)} at a time.`; // shown only while jobs are live
  void runQueue();
}

const actions: Actions = {
  toggleLog: () => ((state.showLog = !state.showLog), draw()),
  dropItems: (ids) =>
    void guard(async () => {
      const r = await api.dropFromQueue(ids);
      state.notice = `${r.dropped} waiting job${r.dropped === 1 ? '' : 's'} removed.`;
      log('info', `Removed ${r.dropped} waiting job(s) (asked for ${ids.length}).`);
      await refresh();
    }),
  menu: (open) => ((state.menuOpen = open), draw()),
  readyCard: {
    start: () => void guard(startAll),
    customize: () => void guard(() => wizardStep({ type: 'continue' })),
    openResume: () => void chrome.tabs.create({ url: `${__WEB_ORIGIN__}/career` }),
    setting: (patch) =>
      void guard(async () => {
        state.settings = await api.saveSettings(patch);
        state.autoSubmit = state.settings.autoSubmit;
      }),
  },
  resumeJob: () => void guard(async () => void (await resumeOrphans())),
  // Run the steps again from where the job stopped (after the seeker fixed something, or the page loaded late).
  // "Submit for me": the seeker's explicit go-ahead for this job; the loop presses Submit and confirms from the page.
  submitNow: (item) =>
    void guard(async () => {
      if (!orch.session(item.id)) return void (state.notice = 'This job is not open in this panel. Release it and start it again.');
      submitOverride.add(item.id);
      log('info', `Submit for me pressed for “${item.job?.title ?? item.id}”.`);
      setStep(item, 'preparing');
      draw();
      await runAi(item);
      await refresh();
    }),
  // The resume for this application, asked once: kept on the server, then the run carries on.
  resumeChoice: (item, choice) =>
    void guard(async () => {
      await api.resumeChoice(item.id, choice);
      item.resume_choice = choice;
      const it = state.items.find((i) => i.id === item.id);
      if (it) it.resume_choice = choice;
      if (!orch.session(item.id)) return void (state.notice = 'This job is not open in this panel. Release it and start it again.');
      setStep(item, 'preparing');
      draw();
      await runAi(item);
      await refresh();
    }),
  retry: (item) =>
    void guard(async () => {
      const s = orch.session(item.id);
      if (!s) return void (state.notice = 'This job is not open in this panel. Release it and start it again.');
      const url = jobUrlOf.get(item.id) ?? item.job?.url ?? '';
      setStep(item, 'preparing');
      draw();
      // NEEDS_USER may go back through prepare; a job already past it resumes in place
      if (item.state === 'NEEDS_USER' || item.state === 'CLAIMED') {
        const r = await orch.prepare(s, url);
        if (r !== 'review') return void (r === 'needs-user' ? setStep(item, 'needs-user', String((s.item.detail as { reason?: string } | null)?.reason ?? ''), (s.item.detail as { message?: string } | null)?.message) : delete state.sessions[item.id]);
        await runAi(item);
      } else await runAi(item);
      await refresh();
    }),
  ticket: (item) => {
    const sess = state.sessions[item.id];
    const what = item.state === 'VERIFY' ? 'Plato could not confirm whether this was submitted' : sess?.detail ? `these required fields are still empty: ${sess.detail}` : sess?.message === 'submit_failed' ? 'Plato could not press Submit' : `it is blocked (${sess?.message ?? 'needs me'})`;
    void guard(() => consultOrchestrator(`I opened the ticket for "${item.job?.title ?? 'this job'}" at ${item.job?.company ?? ''}: ${what}. Look at the fields listed for this job and my profile. If you can write the answer from my facts, do it and put it in the form; if a fact is truly missing, ask me for that one thing. Be brief.`));
  },
  clearQueue: (ask) => {
    // "Clear queue" (ask = true) shows the question; "Yes, clear" (the click event) clears; "No" (false) cancels.
    if (typeof ask === 'boolean') {
      state.clearArmed = ask;
      return draw();
    }
    state.clearArmed = false;
    void guard(async () => {
      const r = await api.clearQueue();
      state.runIds = [];
      state.running = false;
      void chrome.storage.session.set({ run: { running: false, autoSubmit: state.autoSubmit, runIds: [] } });
      // check the server really dropped them: never claim "cleared" on faith
      state.items = await api.batches();
      const left = state.items.filter((i) => i.state === 'PENDING').length;
      log(left ? 'error' : 'info', `Clear queue: server cleared ${r.cleared}, ${left} still waiting.`);
      state.notice = left ? `Clear did not work: the server still has ${left} waiting job${left === 1 ? '' : 's'} (cleared ${r.cleared}). Restart the Plato backend and try again.` : `${r.cleared} waiting job${r.cleared === 1 ? '' : 's'} cleared.`;
      await refresh();
    });
  },
  answer: (text) =>
    void guard(async () => {
      if (/^start applying\b/i.test(text.trim()) && state.items.some((i) => i.state === 'PENDING')) return startAll();
      const asked = state.assistant?.ask?.jobId ?? null;
      if (asked) note(asked, text.trim().slice(0, 300)); // the answer belongs to that job's next decision
      await consultOrchestrator(text);
      // the chat answered without acting: a job that was waiting on this answer runs again by itself
      const item = asked ? state.items.find((i) => i.id === asked) : undefined;
      if (item && state.sessions[item.id]?.step === 'needs-user' && orch.session(item.id)) {
        setStep(item, 'preparing');
        draw();
        await runAi(item);
        await refresh();
      }
    }),
  wizard: (a) => void guard(() => wizardStep(a)),
  formChoose: (item, formId) => review(item, (c) => c.chooseForm(formId)),
  formRestart: (item) => review(item, (c) => c.start()),
  reviewToggle: (item, id, choice) => review(item, (c) => c.toggle(id, choice)),
  reviewFill: (item, version) => review(item, (c) => c.fillApproved(version)),
  reviewRetry: (item, version) => review(item, (c) => c.retryFailed(version)),
  reviewReinspect: (item) => review(item, (c) => c.reinspect()),
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
      await refresh();
      // first run: celebrate, show what is waiting and what happens next
      state.wizard = { ...blankWizard('welcome'), waiting: state.items.filter((i) => i.state === 'PENDING').length, sites: registry.all.filter((d) => registry.policyOf(d.id, policy) === 'FILL_ONLY' && d.adapter).map((d) => d.label) };
    }),
  unlink: () =>
    void guard(async () => {
      log('info', 'Unlink pressed: stopping, revoking this browser, clearing the token.');
      orch.stopAll();
      await api.unpair().catch(() => undefined); // best effort; the device list on the web can also remove it
      await tokens.clear();
      state.status = 'unpaired';
      state.items = [];
    }),
  refresh: () => void refresh(),
  start: (item) =>
    void guard(async () => {
      await startItem(item);
      await refresh();
    }),
  ready: (item) =>
    void guard(async () => {
      await orch.armForSubmit(sessionOf(item));
      setStep(item, 'armed');
      await refresh();
    }),
  checkPage: (item) =>
    void guard(async () => {
      const s = orch.session(item.id);
      const ev = s ? await orch.observe(s) : await probeFor(item);
      state.notice = ev.kind === 'confirmed' ? 'The page shows a confirmation. Recorded.' : 'The page does not clearly show a confirmation yet.';
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
      await refresh();
    }),
  cancel: (item) =>
    void guard(async () => {
      await orch.cancel(sessionOf(item));
      delete state.sessions[item.id];
      await refresh();
    }),
  release: (item) =>
    void guard(async () => {
      await orch.release(item);
      await refresh();
    }),
};

// The person pressed Stop on the page overlay: cancel that job's session.
chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
  if (sender.id !== chrome.runtime.id || (msg as { type?: string } | null)?.type !== 'plato:stop' || sender.tab?.id === undefined) return;
  const item = state.items.find((i) => orch.session(i.id)?.tabId === sender.tab!.id);
  if (item) void actions.cancel(item);
});

// Only one panel instance may run the queue (two would double-open tabs and double-ask the AI).
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
  try {
    const run = (await chrome.storage.session.get('run')).run as { running?: boolean; autoSubmit?: boolean; runIds?: string[] } | undefined;
    state.running = !!run?.running;
    state.runIds = run?.runIds ?? [];
    state.autoSubmit = !!run?.autoSubmit;
  } catch {
    /* no saved run: the banner offers to start */
  }
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
  setInterval(() => document.visibilityState === 'visible' && void refresh(), 15_000);
  // jobs queued from the website show up as soon as the seeker comes back to the panel
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refresh());
}
void boot();
