// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ApiItem, ItemState, SearchJob } from '../src/core/types';
import { createBatchRunner, MAX_BATCH_JOBS, type BatchRun, type Row } from '../src/core/batch-runner';
import { render, type Actions, type PanelState } from '../src/panel/view';
import { createRegistry } from '../src/providers/registry';
import { DEFINITIONS } from '../src/providers/definitions';
import type { ProviderDefinition } from '../src/providers/types';

const adapter = async () => ({ prepare: async () => ({ kind: 'ready' as const }), inspectOutcome: async () => ({ kind: 'unknown' as const }) });
const fx: ProviderDefinition = { id: 'fx', label: 'Fx', hosts: ['fx.test'], policy: 'FILL_ONLY', urlPatterns: ['https://fx.test/*'], capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false }, classify: () => ({ provider: 'fx', page: 'apply-form', applyVia: 'internal-form' }), adapter };
// the shipped definitions are enabled; these view tests exercise the blocked paths, so switch them off
const registry = createRegistry([...DEFINITIONS.map((d) => ({ ...d, policy: 'BLOCKED' as const, adapter: undefined })), fx]);

const item = (state: ItemState, over: Partial<ApiItem> = {}): ApiItem => ({ id: 'i' + state, batch_id: 'b', provider: 'fx', state, attempt_id: 'a', seq: 1, lease_expires_at: null, detail: null, verify_reason: null, job: { title: 'Engineer', company: 'Acme', url: 'https://fx.test/1' }, ...over, job_id: `j-${over.id ?? 'i' + state}` });
const job = (i: number, over: Partial<SearchJob> = {}): SearchJob => ({ id: `j${i}`, title: `Job ${i}`, company: 'Acme', location: 'Cairo', source: 'LEVER', match: 90, applyable: true, ...over });
type Mocked = Actions & { jobs: Record<string, ReturnType<typeof vi.fn>>; batch: Record<string, ReturnType<typeof vi.fn>> } & Record<string, unknown>;
const actions = (): Mocked => {
  const fns = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, vi.fn()]));
  return { ...fns(['pair', 'unlink', 'refresh', 'view', 'menu', 'toggleLog', 'chat', 'answer']), jobs: fns(['pickSearch', 'picker', 'filter', 'more', 'toggle', 'selectVisible', 'site', 'dropItem', 'sheet', 'resumeMode', 'start']), batch: fns(['stop', 'cancelJob', 'release', 'resume', 'answerJob', 'retry', 'submitNow', 'checkPage', 'attest', 'notSure', 'notSubmitted', 'resumeChoice', 'watch', 'ticket', 'newBatch', 'retryFailed']) } as unknown as Mocked;
};
const base = (): PanelState => ({ status: 'ready', toasts: [], items: [], sessions: {}, progress: {}, cards: {}, pendingOutbox: 0, policy: { fx: 'FILL_ONLY' }, view: 'jobs', jobs: { searches: [], pickerOpen: false, jobs: [], jobsTotal: 0, known: {}, loading: false, q: '', sort: 'best', remote: false, fromPlato: false, picked: [], resumeMode: 'profile' }, run: null, rows: [] });
const draw = (s: Partial<PanelState>, a = actions()) => {
  const root = document.createElement('main');
  render(document, root, { ...base(), ...s }, a, registry);
  return { root, a, buttons: [...root.querySelectorAll('button')].filter((b) => !b.closest('header')).map((b) => b.textContent!.trim()) };
};
// a batch view state from a runner, so the rows are what production computes
const batch = (items: ApiItem[], sessions: PanelState['sessions'] = {}, o: { outcomes?: [string, 'submitted' | 'failed' | 'skipped' | 'cancelled', string][]; autoSubmit?: boolean; finish?: boolean } = {}) => {
  const r = createBatchRunner({ get: async () => null, set: async () => undefined });
  r.start(items.map((i) => ({ itemId: i.id, meta: { jobId: i.job_id, title: i.job?.title ?? 'Job', company: i.job?.company ?? '', provider: i.provider } })), 'Frontend', o.autoSubmit ?? true);
  for (const [id, kind, note] of o.outcomes ?? []) r.record(id, kind, note);
  const live = { sessions, tabsAlive: new Set<string>() };
  const rows: Row[] = o.finish ? r.settle(items.filter((i) => !o.outcomes?.some((x) => x[0] === i.id)), live) : r.rows(items, live);
  return { view: 'batch' as const, run: r.current() as BatchRun, rows, sessions };
};

describe('panel view', () => {
  it('unpaired: asks for the code and calls pair with what was typed', () => {
    const { root, a } = draw({ status: 'unpaired' });
    (root.querySelector('#code') as HTMLInputElement).value = 'ABCD-EFGH';
    (root.querySelector('#label') as HTMLInputElement).value = 'Laptop';
    (root.querySelector('#link') as HTMLButtonElement).click();
    expect(a.pair).toHaveBeenCalledWith('ABCD-EFGH', 'Laptop');
  });

  it('renders listing text as text, never as HTML (queued jobs, search jobs, batch rows)', () => {
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    const queued = draw({ items: [item('PENDING', { job: { title: evil, company: evil, url: 'https://fx.test/1' } })] });
    const search = draw({ jobs: { ...base().jobs, searches: [{ id: 's', title: evil, locations: [], remote: null, job_count: 1, featured: false, created_at: '2026-10-01' }], searchId: 's', jobs: [job(1, { title: evil, company: evil })] } });
    const rows = draw(batch([item('FILLING', { job: { title: evil, company: evil, url: 'https://fx.test/1' } })], { iFILLING: { step: 'review' } }));
    for (const { root } of [queued, search, rows]) {
      expect(root.querySelector('img')).toBeNull();
      expect(root.querySelector('script')).toBeNull();
      expect(root.textContent).toContain(evil);
    }
  });

  it('a blocked or unknown-policy provider cannot be picked and says why', () => {
    const blocked = draw({ items: [item('PENDING', { provider: 'workable' })], policy: { workable: 'FILL_ONLY' } });
    expect(blocked.root.querySelector('.job')!.getAttribute('aria-disabled')).toBe('true');
    expect(blocked.root.textContent).toContain('not enabled');
    const unknown = draw({ items: [item('PENDING')], policy: undefined });
    expect(unknown.root.querySelector('.job')!.getAttribute('aria-disabled')).toBe('true');
    expect(unknown.root.textContent).toContain('Cannot reach Plato');
    const server = draw({ items: [item('PENDING')], policy: { fx: 'BLOCKED' } });
    expect(server.root.querySelector('.job')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('an enabled provider with an adapter can be picked; the pick goes through the toggle action', () => {
    const { root, a } = draw({ items: [item('PENDING')] });
    const row = root.querySelector('.job') as HTMLElement;
    expect(row.getAttribute('aria-disabled')).toBe('false');
    row.click();
    expect(a.jobs.toggle).toHaveBeenCalledWith('item:iPENDING');
  });

  it('tells the person when no site is enabled at all', () => {
    const reg = createRegistry(DEFINITIONS);
    const root = document.createElement('main');
    render(document, root, { ...base(), policy: {} }, actions(), reg);
    expect(root.textContent).toContain('No sites are enabled yet');
  });

  it('the dock shows the count against the cap; Review batch needs a pick; a full batch says so', () => {
    const none = draw({});
    expect(none.root.querySelector('#picked')!.textContent).toBe(`0 / ${MAX_BATCH_JOBS}`);
    expect((none.root.querySelector('#review') as HTMLButtonElement).disabled).toBe(true);
    const picked = Array.from({ length: MAX_BATCH_JOBS }, (_, i) => `job:j${i}` as const);
    const full = draw({ jobs: { ...base().jobs, picked } });
    expect(full.root.querySelector('#picked')!.textContent).toBe(`${MAX_BATCH_JOBS} / ${MAX_BATCH_JOBS}`);
    expect(full.root.textContent).toContain('Batch is full');
    expect(full.root.querySelectorAll('.cap i.on').length).toBe(MAX_BATCH_JOBS);
    (full.root.querySelector('#review') as HTMLButtonElement).click();
    expect(full.a.jobs.sheet).toHaveBeenCalledWith(true);
  });

  it('the sheet lists the picked jobs with a remove control, states the rules, and Start is the only control that starts', () => {
    const jobs = { ...base().jobs, known: { j1: job(1), j2: job(2) }, picked: ['job:j1', 'job:j2', 'item:iPENDING'] as PanelState['jobs']['picked'] };
    const { root, a, buttons } = draw({ items: [item('PENDING')], jobs, sheet: true, settings: { autoSubmit: true, coverLetter: true, speed: 'smart', customMessage: '', tabs: 4, resume: null, resumeMode: 'profile' }, autoSubmitPreview: true });
    const t = root.textContent!;
    expect(t).toContain('Start this batch?');
    expect(t).toContain(`3`);
    expect(t).toContain('One batch at a time');
    expect(t).toContain('Another batch can start once this one finishes');
    expect(t).toContain('up to 3 open tabs at once');
    expect(root.querySelectorAll('.mini').length).toBe(3);
    (root.querySelector('.mini .ibtn') as HTMLButtonElement).click();
    expect(a.jobs.toggle).toHaveBeenCalledWith('job:j1');
    (root.querySelector('#start-batch') as HTMLButtonElement).click();
    expect(a.jobs.start).toHaveBeenCalled();
    expect(buttons.filter((b) => /^start/i.test(b))).toEqual(['Start batch · 3 jobs']);
  });

  it('a running batch locks the jobs view: rows are disabled, the dock shows progress, the nav badge counts', () => {
    const b = batch([item('FILLING'), item('PENDING', { id: 'i2' })], { iFILLING: { step: 'review' } });
    const { root } = draw({ ...b, view: 'jobs', items: [item('FILLING'), item('PENDING', { id: 'i2' }), item('PENDING', { id: 'i3' })] });
    expect(root.textContent).toContain('A batch is running');
    expect(root.querySelector('.job')!.getAttribute('aria-disabled')).toBe('true'); // i3, queued earlier, waits
    expect(root.querySelector('.dock')!.textContent).toContain('No second batch until this one finishes');
    expect(root.querySelector('#tab-batch')!.textContent).toBe('Batch0/2');
  });

  it('batch view: every row status has its own pill and its own text; no button anywhere acts as an automatic Submit', () => {
    const items = [item('PENDING', { id: 'q' }), item('FILLING', { id: 'r' }), item('NEEDS_USER', { id: 'n' }), item('VERIFY', { id: 'v', verify_reason: 'page_closed' }), item('REVIEW', { id: 'i' }), item('CLAIMED', { id: 'e', mine: false }), item('FILLING', { id: 's' }), item('FILLING', { id: 'f' })];
    const b = batch(items, { r: { step: 'review' }, n: { step: 'needs-user', message: 'questions', detail: 'What is your notice period?' } }, { outcomes: [['s', 'submitted', 'The page confirmed it.'], ['f', 'failed', 'The site refused it.']] });
    const { root, buttons } = draw({ ...b, items, progress: { r: 'Filled: First name = Youssif.' } });
    const pills = [...root.querySelectorAll('.pill')].map((p) => p.textContent);
    expect(pills.sort()).toEqual(['Elsewhere', 'Failed', 'Interrupted', 'Needs you', 'Please check', 'Queued', 'Running', 'Submitted'].sort());
    const t = root.textContent!;
    expect(t).toContain('What is your notice period?');
    expect(t).toContain('Filled: First name = Youssif.');
    expect(t).toContain('will not send it again by itself');
    expect(t).toContain('page closed');
    expect(t).toContain('Another linked browser');
    expect(t).toContain('not in this panel');
    expect(t).toContain('2 of 8 finished'); // the two recorded outcomes
    for (const b of buttons) expect(b).not.toMatch(/^(submit|send|apply|resubmit)/i);
  });

  it('batch view: the inline answer goes to that job; VERIFY offers only the person’s answers; Release for an interrupted job', () => {
    const items = [item('NEEDS_USER', { id: 'n' }), item('VERIFY', { id: 'v' }), item('REVIEW', { id: 'i' })];
    const b = batch(items, { n: { step: 'needs-user', message: 'questions', detail: 'Expected salary?' } });
    const { root, a } = draw({ ...b, items });
    // an older engine gives only words: they become one free-answer question in the same form
    const box = root.querySelector('#ask-n-answer') as HTMLTextAreaElement;
    expect(root.querySelector('#answer-n')).toBeNull(); // no bare text box any more
    box.value = '  60k  ';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    (root.querySelector('#ask-send-n') as HTMLButtonElement).click();
    expect(a.batch.answerJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'n' }), 'Expected salary? → 60k', [{ id: 'answer', label: 'Expected salary?', value: '60k' }]);
    const verify = root.querySelector('[data-item="v"]')!;
    expect([...verify.querySelectorAll('button')].map((x) => x.textContent!.trim())).toEqual(['It was sent', 'It was not', 'Check the page']);
    (verify.querySelector('button:nth-child(2)') as HTMLButtonElement).click();
    expect(a.batch.notSubmitted).toHaveBeenCalledWith(expect.objectContaining({ id: 'v' }));
    const interrupted = root.querySelector('[data-item="i"]')!;
    expect(interrupted.textContent).toContain('has not been submitted');
    expect([...interrupted.querySelectorAll('button')].map((x) => x.textContent!.trim())).toEqual(['Resume', 'Release this job']);
  });

  it('batch view: a human check asks the person to do it on the page and continue; an armed job with auto-submit off asks THEM to press Submit', () => {
    const items = [item('NEEDS_USER', { id: 'c' }), item('AWAITING_SUBMIT', { id: 'a' })];
    const b = batch(items, { c: { step: 'needs-user', message: 'questions', detail: 'The site asks for a human check (captcha). Solve it on the page, then press Try again.' }, a: { step: 'armed' } }, { autoSubmit: false });
    const { root, a } = draw({ ...b, items });
    (root.querySelector('#continue-c') as HTMLButtonElement).click();
    expect(a.batch.retry).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    const armed = root.querySelector('[data-item="a"]')!;
    expect(armed.textContent).toContain('Press Submit on the job page yourself');
    expect([...armed.querySelectorAll('button')].map((x) => x.textContent!.trim())).toEqual(['Submit for me', 'Open the tab', 'Check the page', 'I submitted it', 'I am not sure']);
  });

  it('batch view: the estimate appears only after the first finished job, and says what it is based on', () => {
    const items = [item('FILLING', { id: 'r' }), item('PENDING', { id: 'q' })];
    const first = draw({ ...batch(items, { r: { step: 'review' } }), items, eta: 'first' });
    expect(first.root.textContent).toContain('after the first job finishes');
    const later = draw({ ...batch(items, { r: { step: 'review' } }), items, eta: { ms: 150_000, basis: 2 } });
    expect(later.root.textContent).toContain('About 3 min left · based on 2 finished jobs');
    expect(first.root.textContent).toContain('Stop batch');
    (first.root.querySelector('#stop-batch') as HTMLButtonElement).click();
    expect(first.a.batch.stop).toHaveBeenCalledWith('ask');
    const armed = draw({ ...batch(items, { r: { step: 'review' } }), items, stopArmed: true });
    expect(armed.root.textContent).toContain('Stop the batch?');
    (armed.root.querySelector('#stop-yes') as HTMLButtonElement).click();
    expect(armed.a.batch.stop).toHaveBeenCalledWith('yes');
  });

  it('a finished batch shows the outcomes and offers a new batch (and a retry of the failed ones)', () => {
    const items = [item('FILLING', { id: 's' }), item('FILLING', { id: 'f' }), item('FILLING', { id: 'k' })];
    const b = batch(items, {}, { outcomes: [['s', 'submitted', 'The page confirmed it.'], ['f', 'failed', 'Refused.'], ['k', 'skipped', 'Closed.']], finish: true });
    expect(b.run.status).toBe('finished');
    const { root, a } = draw({ ...b, items: [] });
    const t = root.textContent!;
    expect(t).toContain('Batch finished');
    expect(t).toContain('1 of 3 applications sent');
    expect(root.querySelectorAll('.strip i').length).toBe(3);
    (root.querySelector('#new-batch') as HTMLButtonElement).click();
    expect(a.batch.newBatch).toHaveBeenCalled();
    (root.querySelector('#retry-failed') as HTMLButtonElement).click();
    expect(a.batch.retryFailed).toHaveBeenCalled();
  });

  it('empty states: nothing to pick from; no batch yet; no jobs match the filters', () => {
    expect(draw({}).root.textContent).toContain('Nothing to pick from yet');
    expect(draw({ view: 'batch' }).root.textContent).toContain('No batch yet');
    const s = draw({ jobs: { ...base().jobs, searches: [{ id: 's', title: 'Frontend', locations: ['Cairo'], remote: null, job_count: 0, featured: false, created_at: '2026-10-01' }], searchId: 's', q: 'zzz' } });
    expect(s.root.textContent).toContain('No jobs match');
  });

  it('shows queued updates and errors', () => {
    const { root } = draw({ pendingOutbox: 2, error: 'Cannot reach Plato right now.' });
    expect(root.textContent).toContain('2 update(s) waiting');
    expect(root.querySelector('.banner.err')?.textContent).toContain('Cannot reach');
  });
});

describe('jobs view: the site chips filter the loaded jobs on the client', () => {
  const search = { id: 's1', title: 'Frontend', locations: ['Cairo'], remote: null, job_count: 3, featured: false, created_at: '2026-10-30T00:00:00Z' };
  const jobs = [job(1, { source: 'LINKEDIN' }), job(2, { source: 'LEVER' }), job(3, { source: 'INDEED', site: 'GREENHOUSE' }), job(4, { source: 'LINKEDIN' })];
  const state = (site: string | null = null): Partial<PanelState> => ({ jobs: { ...base().jobs, searches: [search], searchId: 's1', jobs, jobsTotal: 9, site } });
  it('one chip per site with its count on this page; a click asks for that site; the list and the count follow; the chip toggles off', () => {
    const d = draw(state());
    const chips = [...d.root.querySelectorAll('#sites button')].map((b) => b.textContent!.trim());
    expect(chips).toEqual(['All sites · 4', 'Linkedin · 2', 'Lever · 1', 'Greenhouse · 1']);
    expect(d.root.querySelectorAll('#jobs .job').length).toBe(4);
    (d.root.querySelector('#f-site-lever') as HTMLButtonElement).click();
    expect(d.a.jobs.site).toHaveBeenCalledWith('LEVER');
    const f = draw(state('LEVER'));
    expect(f.root.querySelectorAll('#jobs .job').length).toBe(1);
    expect(f.root.querySelector('#count')!.textContent).toBe('1 of 9 jobs · Lever');
    expect(f.root.querySelector('#f-site-lever')!.getAttribute('aria-pressed')).toBe('true');
    (f.root.querySelector('#f-site-lever') as HTMLButtonElement).click();
    expect(f.a.jobs.site).toHaveBeenCalledWith(null);
    expect(f.root.querySelector('#select-visible')!.textContent).toContain('Select 1');
  });
  it('a stale site (no longer on the page) shows everything; one site only shows no chips', () => {
    const d = draw(state('WORKABLE'));
    expect(d.root.querySelectorAll('#jobs .job').length).toBe(4);
    const one = draw({ jobs: { ...base().jobs, searches: [search], searchId: 's1', jobs: [job(1, { source: 'LEVER' })], jobsTotal: 1 } });
    expect(one.root.querySelector('#sites')).toBeNull();
  });
});
