// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ApiItem, ItemState } from '../src/core/types';
import { render, type Actions, type PanelState } from '../src/panel/view';
import type { ReviewState, Row } from '../src/core/form-review';
import { createRegistry } from '../src/providers/registry';
import { DEFINITIONS } from '../src/providers/definitions';
import type { ProviderDefinition } from '../src/providers/types';

const adapter = async () => ({ prepare: async () => ({ kind: 'ready' as const }), inspectOutcome: async () => ({ kind: 'unknown' as const }) });
const fx: ProviderDefinition = { id: 'fx', label: 'Fx', hosts: ['fx.test'], policy: 'FILL_ONLY', urlPatterns: ['https://fx.test/*'], capabilities: { fillForms: true, detectsOutcome: true, accountRequired: false, externalRedirects: false }, classify: () => ({ provider: 'fx', page: 'apply-form', applyVia: 'internal-form' }), adapter };
// the shipped definitions are enabled; these view tests exercise the blocked paths, so switch them off
const registry = createRegistry([...DEFINITIONS.map((d) => ({ ...d, policy: 'BLOCKED' as const, adapter: undefined })), fx]);

const item = (state: ItemState, over: Partial<ApiItem> = {}): ApiItem => ({ id: 'i' + state, batch_id: 'b', job_id: 'j', provider: 'fx', state, attempt_id: 'a', seq: 1, lease_expires_at: null, detail: null, verify_reason: null, job: { title: 'Engineer', company: 'Acme', url: 'https://fx.test/1' }, ...over });
const actions = () => Object.fromEntries(['pair', 'unlink', 'refresh', 'start', 'ready', 'checkPage', 'attest', 'notSure', 'notSubmitted', 'cancel', 'release'].map((k) => [k, vi.fn()])) as unknown as Actions & Record<string, ReturnType<typeof vi.fn>>;
const draw = (s: Partial<PanelState>, a = actions()) => {
  const root = document.createElement('main');
  render(document, root, { status: 'ready', items: [], sessions: {}, cards: {}, pendingOutbox: 0, policy: { fx: 'FILL_ONLY' }, ...s }, a, registry);
  return { root, a, buttons: [...root.querySelectorAll('button')].filter((b) => !b.closest('header')).map((b) => b.textContent!) };
};

describe('panel view', () => {
  it('unpaired: asks for the code and calls pair with what was typed', () => {
    const { root, a } = draw({ status: 'unpaired' });
    (root.querySelector('#code') as HTMLInputElement).value = 'ABCD-EFGH';
    (root.querySelector('#label') as HTMLInputElement).value = 'Laptop';
    (root.querySelector('#link') as HTMLButtonElement).click();
    expect(a.pair).toHaveBeenCalledWith('ABCD-EFGH', 'Laptop');
  });

  it('renders listing text as text, never as HTML', () => {
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    const { root } = draw({ items: [item('PENDING', { job: { title: evil, company: evil, url: 'https://fx.test/1' } })] });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain(evil);
  });

  it('a blocked or unknown-policy provider has no Start button and says why', () => {
    const blocked = draw({ items: [item('PENDING', { provider: 'workable' })], policy: { workable: 'FILL_ONLY' } });
    expect(blocked.buttons).not.toContain('Start');
    expect(blocked.root.textContent).toContain('not enabled');
    const unknown = draw({ items: [item('PENDING')], policy: undefined });
    expect(unknown.buttons).not.toContain('Start');
    expect(unknown.root.textContent).toContain('Cannot reach Plato');
    const server = draw({ items: [item('PENDING')], policy: { fx: 'BLOCKED' } });
    expect(server.buttons).not.toContain('Start');
  });

  it('an enabled provider with an adapter can be started; without an adapter it cannot', () => {
    expect(draw({ items: [item('PENDING')] }).buttons).toContain('Start');
    const noAdapter = createRegistry([{ ...fx, adapter: undefined }]);
    const root = document.createElement('main');
    render(document, root, { status: 'ready', items: [item('PENDING')], sessions: {}, cards: {}, pendingOutbox: 0, policy: { fx: 'FILL_ONLY' } }, actions(), noAdapter);
    expect(root.querySelector('button.primary')).toBeNull();
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Start');
  });

  it('tells the person when no site is enabled at all', () => {
    const reg = createRegistry(DEFINITIONS);
    const root = document.createElement('main');
    render(document, root, { status: 'ready', items: [], sessions: {}, cards: {}, pendingOutbox: 0, policy: {} }, actions(), reg);
    expect(root.textContent).toContain('No sites are enabled yet');
  });

  it('review: the person is told THEY submit; AWAITING asks them to press Submit on the page', () => {
    const review = draw({ items: [item('REVIEW')], sessions: { iREVIEW: { step: 'review' } } });
    expect(review.root.textContent).toContain('Plato is filling this form');
    expect(review.buttons).toContain('The form is ready — I will submit it myself');
    const armed = draw({ items: [item('AWAITING_SUBMIT')], sessions: { iAWAITING_SUBMIT: { step: 'armed' } } });
    expect(armed.root.textContent).toContain('Press Submit on the job page yourself');
    expect(armed.buttons).toEqual(['Check the page', 'I submitted it', 'I am not sure']);
  });

  it('VERIFY: warns that Plato will not resend, offers only the person’s answers', () => {
    const v = draw({ items: [item('VERIFY', { verify_reason: 'page_closed' })] });
    expect(v.root.textContent).toContain('will not send it again by itself');
    expect(v.root.textContent).toContain('page_closed');
    expect(v.buttons.filter((b) => !['Refresh', 'Unlink'].includes(b))).toEqual(['I submitted it', 'I did not submit it']);
  });

  it('an item started in an earlier session is only offered for release', () => {
    const r = draw({ items: [item('FILLING')] });
    expect(r.root.textContent).toContain('has not been submitted');
    expect(r.buttons).toContain('Release this job');
  });

  it('no button anywhere acts as an automatic Submit', () => {
    const states: ItemState[] = ['PENDING', 'CLAIMED', 'PREPARING', 'NEEDS_USER', 'FILLING', 'REVIEW', 'AWAITING_SUBMIT', 'VERIFY'];
    for (const st of states)
      for (const step of [undefined, 'review', 'armed', 'needs-user'] as const) {
        const { buttons } = draw({ items: [item(st)], sessions: step ? { ['i' + st]: { step } } : {} });
        for (const b of buttons) expect(b).not.toMatch(/^(submit|send|apply|resubmit|retry)/i);
      }
  });

  it('buttons call the matching action with the item', () => {
    const { root, a } = draw({ items: [item('VERIFY')] });
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'I did not submit it')!.click();
    expect(a.notSubmitted).toHaveBeenCalledWith(expect.objectContaining({ state: 'VERIFY' }));
  });

  it('shows queued updates and errors', () => {
    const { root } = draw({ pendingOutbox: 2, error: 'Cannot reach Plato right now.' });
    expect(root.textContent).toContain('2 update(s) waiting');
    expect(root.querySelector('.error')?.textContent).toContain('Cannot reach');
  });

  const row = (o: Partial<Row> & { label: string }): Row => ({ id: `r-${o.label}`, fp: 'fp', vh: 'vh', required: false, category: 'proposed', locked: false, choice: 'use', status: 'pending', attempts: 0, ...o });
  const review = (rows: Row[], extra: Partial<ReviewState> = {}): ReviewState => ({ version: 1, phase: 'reviewing', forms: [], formId: 'form1', formLabel: 'Apply', rows, sensitiveExcluded: 0, hidden: 0, fillRounds: 1, submitAttempts: 0, notes: [], ...extra });

  it('review: shows what was filled, what failed, what is still needed and what was left alone; no submit control', () => {
    const rv = review(
      [
        row({ label: 'Email', required: true, proposed: 'y@example.com', shown: 'y@example.com', source: 'ai-decision', confidence: 1, status: 'filled', attempts: 1 }),
        row({ label: 'Phone', proposed: '+201001234567', shown: '+201001234567', source: 'ai-decision', status: 'failed', reason: 'invalid:pattern', attempts: 1 }),
        row({ label: 'Terms', required: true, category: 'consent', locked: true, lockReason: 'Consent and choices are yours to make', choice: 'skip' }),
        row({ label: 'Nickname', category: 'unmapped', locked: true, choice: 'skip' }),
        row({ label: 'CV', category: 'unsupported', locked: true, lockReason: 'Plato cannot fill this kind of field', reason: 'unsupported-type:file', choice: 'skip' }),
      ],
      { sensitiveExcluded: 2, submitAttempts: 1 },
    );
    const { root, buttons } = draw({ items: [item('REVIEW')], sessions: { iREVIEW: { step: 'review' } }, formReviews: { iREVIEW: rv } });
    const t = root.textContent!;
    expect(t).toContain('y@example.com');
    expect(t).toContain('(invalid:pattern)');
    expect(t).toContain('Terms *');
    expect(t).toContain('Consent and choices are yours to make');
    expect(t).toContain('Other fields, left for you: Nickname');
    expect(t).toContain('(unsupported-type:file)');
    expect(t).toContain('2 sensitive field(s)');
    expect(t).toContain('tried to submit while filling. That was blocked.');
    for (const b of buttons) expect(b).not.toMatch(/^(submit|send|apply)/i);
  });

  it('review values from a page are shown as text, never HTML', () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    const rv = review([row({ label: evil, proposed: evil, shown: evil, status: 'filled' })]);
    const { root } = draw({ items: [item('REVIEW')], sessions: { iREVIEW: { step: 'review' } }, formReviews: { iREVIEW: rv } });
    expect(root.querySelector('img')).toBeNull();
  });

  it('Clear queue asks first and the question stays until answered', () => {
    const a = { ...actions(), wizard: vi.fn(), clearQueue: vi.fn() } as unknown as Actions & Record<string, ReturnType<typeof vi.fn>>;
    const idle = draw({ items: [item('PENDING')], policy: { fx: 'FILL_ONLY' } }, a);
    expect(idle.root.querySelector('#clear-confirm')).toBeNull();
    (idle.root.querySelector('#clear-queue') as HTMLButtonElement).click();
    expect(a.clearQueue).toHaveBeenCalledWith(true);
    const asking = draw({ items: [item('PENDING')], policy: { fx: 'FILL_ONLY' }, clearArmed: true }, a);
    expect(asking.root.querySelector('#clear-confirm')!.textContent).toContain('Clear 1 waiting job?');
    (asking.root.querySelector('#clear-no') as HTMLButtonElement).click();
    expect(a.clearQueue).toHaveBeenLastCalledWith(false);
    (asking.root.querySelector('#clear-yes') as HTMLButtonElement).click();
    expect(a.clearQueue).toHaveBeenCalledTimes(3);
  });
});
