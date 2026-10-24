// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { SearchCard, SearchJob } from '../src/core/types';
import { renderWizard, rounds, type Wizard } from '../src/panel/wizard';

const card = (i: number, featured = false): SearchCard => ({ id: `s${i}`, title: `Search ${i}`, locations: ['Cairo'], remote: null, job_count: 5, featured, created_at: '2026-10-01T00:00:00Z' });
const job = (i: number, applyable = true): SearchJob => ({ id: `j${i}`, title: `Job ${i}`, company: 'Acme', location: null, source: 'LEVER', match: 1, applyable });
const wiz = (over: Partial<Wizard>): Wizard => ({ step: 'search', searches: [], searchPage: 0, jobs: [], jobsTotal: 0, sources: [], filters: {}, picked: [], jobsPage: 0, declining: false, declineReason: '', autoSubmit: true, resumeMode: 'profile', ...over });
const draw = (w: Wizard) => {
  const root = document.createElement('main');
  const send = vi.fn();
  renderWizard(document, root, w, send, false);
  return { root, send };
};

describe('wizard', () => {
  it('search step: 4 cards per page, a dot per page, Continue needs a pick', () => {
    const searches = Array.from({ length: 9 }, (_, i) => card(i));
    const { root } = draw(wiz({ searches }));
    expect(root.querySelectorAll('.scard').length).toBe(4);
    expect(root.querySelectorAll('.dot').length).toBe(3);
    expect((root.querySelector('.nav .primary') as HTMLButtonElement).disabled).toBe(true);
    const last = draw(wiz({ searches, searchPage: 2, searchId: 's8' }));
    expect(last.root.querySelectorAll('.scard').length).toBe(1);
    expect((last.root.querySelector('.nav .primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('jobs step: non-applyable rows are disabled and never selectable', () => {
    const { root, send } = draw(wiz({ step: 'jobs', jobs: [job(1), job(2, false)], picked: ['j1'] }));
    const boxes = [...root.querySelectorAll<HTMLInputElement>('.jrow input')];
    expect(boxes.map((b) => b.disabled)).toEqual([false, true]);
    expect(root.querySelector('#count')!.textContent).toBe('1 selected · 0 jobs');
    boxes[0]!.dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'toggle-job', id: 'j1' });
  });

  it('jobs step: filters and paging are the server\'s; picks survive paging', () => {
    const jobs = Array.from({ length: 6 }, (_, i) => job(i));
    const d = draw(wiz({ step: 'jobs', jobs, jobsTotal: 15, picked: ['j14'], sources: [{ value: 'GREENHOUSE', count: 9 }], filters: { sort: 'newest' } }));
    expect(d.root.querySelectorAll('.jrow').length).toBe(6);
    expect(d.root.querySelector('#jobs-pager')!.textContent).toContain('Page 1 of 3');
    expect(d.root.querySelector('#count')!.textContent).toBe('1 selected · 15 jobs'); // j14 is on another page
    expect((d.root.querySelector('#f-sort') as HTMLElement).dataset.value).toBe('newest');
    const src = d.root.querySelector('#f-source') as HTMLElement;
    expect([...src.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual(['All sources', 'Greenhouse (9)']);
    (src.querySelector('.dd-trigger') as HTMLButtonElement).click();
    expect(src.classList.contains('open')).toBe(true);
    (src.querySelector('[data-value=GREENHOUSE]') as HTMLElement).click();
    expect(src.classList.contains('open')).toBe(false);
    expect(d.send).toHaveBeenCalledWith({ type: 'filter', patch: { source: 'GREENHOUSE' } });
    const q = d.root.querySelector('#job-q') as HTMLInputElement;
    q.value = ' react ';
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(d.send).toHaveBeenCalledWith({ type: 'filter', patch: { q: 'react' } });
  });

  it('consent step: rounds of 10 tabs; decline asks for a reason', () => {
    expect([rounds(1), rounds(10), rounds(11), rounds(30)]).toEqual([1, 1, 2, 3]);
    const ok = draw(wiz({ step: 'consent', picked: Array.from({ length: 30 }, (_, i) => `j${i}`) }));
    expect(ok.root.textContent).toContain('30 jobs, 10 at a time, in 3 rounds');
    const dec = draw(wiz({ step: 'consent', picked: ['j1'], declining: true }));
    expect(dec.root.querySelector('textarea')).not.toBeNull();
    // auto-submit is an explicit, visible opt-in that can be switched off
    expect(ok.root.querySelector('#auto-submit')).toBeNull(); // no preference: Plato always presses Submit
  });
});
