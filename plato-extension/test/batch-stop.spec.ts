// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ApiItem } from '../src/core/types';
import type { BatchRun, Row } from '../src/core/batch-runner';
import { render, type Actions, type PanelState } from '../src/panel/view';
import { createRegistry } from '../src/providers/registry';
import type { ProviderDefinition } from '../src/providers/types';

// The Needs-you card per kind of stop: a form for questions, buttons that fit the stop otherwise, never a bare text box
// for a server error. Rows are built directly: this is the card's own behaviour, not the runner's.
const adapter = async () => ({ prepare: async () => ({ kind: 'ready' as const }), inspectOutcome: async () => ({ kind: 'unknown' as const }) });
const fx: ProviderDefinition = { id: 'fx', label: 'Fx', hosts: ['fx.test'], policy: 'FILL_ONLY', urlPatterns: ['https://fx.test/*'], capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false }, classify: () => ({ provider: 'fx', page: 'apply-form', applyVia: 'internal-form' }), adapter };
const registry = createRegistry([fx]);
const item: ApiItem = { id: 'i1', batch_id: 'b', job_id: 'j1', provider: 'fx', state: 'REVIEW', attempt_id: 'a', seq: 1, lease_expires_at: null, detail: null, verify_reason: null, job: { title: 'Engineer', company: 'Acme', url: 'https://fx.test/1' } };
const run: BatchRun = { id: 'r', label: 'test', itemIds: ['i1'], meta: { i1: { jobId: 'j1', title: 'Engineer', company: 'Acme', provider: 'fx' } }, autoSubmit: true, startedAt: 1, finishedAt: null, status: 'running', started: {}, outcomes: {} };
const row: Row = { itemId: 'i1', meta: run.meta.i1!, status: 'needs', item };
const actions = () => {
  const fns = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, vi.fn()]));
  return { ...fns(['pair', 'unlink', 'refresh', 'view', 'menu', 'toggleLog', 'chat', 'answer']), jobs: fns(['pickSearch', 'picker', 'filter', 'more', 'toggle', 'selectVisible', 'dropItem', 'sheet', 'resumeMode', 'start']), batch: fns(['stop', 'cancelJob', 'release', 'resume', 'answerJob', 'retry', 'submitNow', 'checkPage', 'attest', 'notSure', 'notSubmitted', 'resumeChoice', 'watch', 'ticket', 'newBatch', 'retryFailed']) } as unknown as Actions & { batch: Record<string, ReturnType<typeof vi.fn>> };
};
const draw = (session: PanelState['sessions'][string]) => {
  const a = actions();
  const root = document.createElement('main');
  const s: PanelState = { status: 'ready', toasts: [], items: [item], sessions: { i1: session }, progress: {}, cards: {}, pendingOutbox: 0, policy: { fx: 'FILL_ONLY' }, view: 'batch', jobs: { searches: [], pickerOpen: false, jobs: [], jobsTotal: 0, known: {}, loading: false, q: '', sort: 'best', remote: false, fromPlato: false, picked: [], resumeMode: 'profile' }, run, rows: [row] } as PanelState;
  render(document, root, s, a, registry);
  const card = root.querySelector('.qcard')!;
  return { root, a, card, text: card?.textContent ?? '', buttons: [...card.querySelectorAll('button')].map((b) => b.textContent!.trim()) };
};

describe('the Needs-you card by kind of stop', () => {
  it('a question becomes a form (pills), with the brain’s one-line reason; the answers go to answerJob with their structure', () => {
    const d = draw({ step: 'needs-user', message: 'questions', detail: 'The form asks whether you can relocate; your profile does not say.', stop: 'ask', ask: [{ id: 'relocate', label: 'Are you willing to relocate to Munich?', type: 'boolean', options: ['Yes', 'No'] }] });
    expect(d.text).toContain('Plato needs one answer from you');
    expect(d.text).toContain('your profile does not say');
    expect(d.card.querySelector('input[type=text]')).toBeNull();
    d.card.querySelector<HTMLButtonElement>('button.opt')!.click(); // Yes
    d.card.querySelector<HTMLButtonElement>('#ask-send-i1')!.click();
    expect(d.a.batch.answerJob).toHaveBeenCalledWith(item, 'Are you willing to relocate to Munich? → Yes', [{ id: 'relocate', label: 'Are you willing to relocate to Munich?', value: 'Yes' }]);
  });
  it('a server error shows what happened and Try again; no answer box, no question', () => {
    const d = draw({ step: 'needs-user', message: 'questions', detail: "Plato's server failed while working on this job (HTTP 500: Internal server error). Nothing was typed or sent since the last step.", stop: 'error' });
    expect(d.text).toContain('Plato hit a problem on its own side');
    expect(d.text).toContain('HTTP 500');
    expect(d.card.querySelector('input, textarea, button.opt')).toBeNull();
    expect(d.buttons).toEqual(['Try again', 'Open the tab']);
  });
  it('a human check names the check and offers the tab and "I solved it, continue"', () => {
    const d = draw({ step: 'needs-user', message: 'questions', detail: 'hCaptcha challenge appeared right after Submit on the Lever form. Plato does not solve human checks.', stop: 'captcha' });
    expect(d.text).toContain('A human check stopped Plato');
    expect(d.text).toContain('hCaptcha');
    expect(d.buttons).toEqual(['Open the tab', 'I solved it, continue']);
    d.card.querySelector<HTMLButtonElement>('#continue-i1')!.click();
    expect(d.a.batch.retry).toHaveBeenCalledWith(item);
  });
  it('a refusal quotes the site and never resends by itself', () => {
    const d = draw({ step: 'needs-user', message: 'questions', detail: 'The site did not accept the submission. Its words: “flagged as possible spam”', stop: 'refused' });
    expect(d.text).toContain('did not accept');
    expect(d.text).toContain('flagged as possible spam');
    expect(d.buttons).toEqual(['Open the tab', 'I submitted it', 'Try again']);
  });
  it('an older engine with only words still gets a form (one free answer), and words about a lost page get the error card', () => {
    const legacy = draw({ step: 'needs-user', message: 'questions', detail: 'Are you authorised to work in Peru?' });
    expect(legacy.card.querySelector('textarea')).not.toBeNull();
    expect(legacy.text).toContain('Are you authorised to work in Peru?');
    const lost = draw({ step: 'needs-user', message: 'questions', detail: 'Plato lost the page (Internal server error). Open the tab and try again.' });
    expect(lost.text).toContain('Plato hit a problem on its own side');
    expect(lost.card.querySelector('input, textarea')).toBeNull();
  });
});
